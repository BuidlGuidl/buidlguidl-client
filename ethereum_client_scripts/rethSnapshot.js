import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { debugToFile, getFormattedDateTime } from "../helpers.js";

// Single source of truth for reth's data directory. Both the snapshot download
// (here) and the node run (reth.js) import this so a custom `--directory` can
// never cause the two to point at different paths.
export function getRethDatadir(installDir) {
  return path.join(installDir, "ethereum_clients", "reth", "database");
}

function getRethCommand(installDir) {
  const platform = os.platform();
  return path.join(
    installDir,
    "ethereum_clients",
    "reth",
    platform === "win32" ? "reth.exe" : "reth"
  );
}

function markerPath(datadir) {
  return path.join(datadir, ".bg_snapshot.json");
}

function readSnapshotMarker(datadir) {
  try {
    const p = markerPath(datadir);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    debugToFile(`rethSnapshot.js readSnapshotMarker(): ${err.message}`);
    return null;
  }
}

// Atomic marker write (temp file + rename) so an interrupted write can never
// leave a half-written marker that we'd misread on the next run.
function writeSnapshotMarker(datadir, state, extra = {}) {
  try {
    fs.mkdirSync(datadir, { recursive: true });
    const payload = JSON.stringify(
      { state, timestamp: getFormattedDateTime(), ...extra },
      null,
      2
    );
    const p = markerPath(datadir);
    const tmpPath = `${p}.tmp`;
    fs.writeFileSync(tmpPath, payload);
    fs.renameSync(tmpPath, p);
  } catch (err) {
    debugToFile(`rethSnapshot.js writeSnapshotMarker(): ${err.message}`);
  }
}

function dirHasFiles(dir) {
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  } catch (err) {
    debugToFile(`rethSnapshot.js dirHasFiles(${dir}): ${err.message}`);
    return false;
  }
}

// AIRTIGHT GUARD: returns true if the datadir already holds real chain data
// that must never be clobbered by a snapshot download. The install step always
// creates an empty `database/` directory, so we probe the actual reth
// database/static_files contents rather than the datadir itself.
function hasExistingChainData(datadir) {
  const mdbx = path.join(datadir, "db", "mdbx.dat");
  const dbVersion = path.join(datadir, "db", "database.version");
  const staticFiles = path.join(datadir, "static_files");
  return (
    fs.existsSync(mdbx) ||
    fs.existsSync(dbVersion) ||
    dirHasFiles(staticFiles)
  );
}

// Remove only the snapshot's target directories (never the whole datadir and
// never the marker). Only ever called when we know there is no synced db to
// protect (fresh install or recovering a partial/forced download).
function wipeSnapshotTargets(datadir) {
  for (const sub of ["db", "static_files"]) {
    const dir = path.join(datadir, sub);
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      debugToFile(`rethSnapshot.js wipeSnapshotTargets(${dir}): ${err.message}`);
    }
  }
}

function logFreeSpace(datadir) {
  try {
    if (typeof fs.statfsSync === "function") {
      const stats = fs.statfsSync(datadir);
      const freeGb = (stats.bavail * stats.bsize) / 1e9;
      console.log(
        `   Free space at datadir: ${freeGb.toFixed(
          0
        )} GB (a full reth snapshot needs well over 1 TB).`
      );
    }
  } catch (err) {
    debugToFile(`rethSnapshot.js logFreeSpace(): ${err.message}`);
  }
}

// Spawn `reth download` with inherited stdio so reth's own progress output owns
// the terminal. Resolves ONLY on a clean exit code 0; completion is detected by
// the exit code, never by parsing output.
function runSnapshotDownload(installDir, datadir) {
  return new Promise((resolve, reject) => {
    const rethCommand = getRethCommand(installDir);

    console.log(
      "\n📥 Downloading reth database snapshot. This can take a long time and"
    );
    console.log(
      "   must finish before reth and the dashboard start. Do not interrupt.\n"
    );
    logFreeSpace(datadir);
    console.log("");

    const download = spawn(
      rethCommand,
      ["download", "--datadir", datadir, "--chain", "mainnet", "--full"],
      {
        stdio: "inherit",
        cwd: process.env.HOME,
        env: { ...process.env, INSTALL_DIR: installDir },
      }
    );

    download.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `reth download exited with code ${code}${
              signal ? ` (signal ${signal})` : ""
            }`
          )
        );
      }
    });

    download.on("error", (err) => reject(err));
  });
}

/**
 * Ensure the reth database snapshot has been applied before reth is started.
 *
 * This is a BLOCKING step intended to run in index.js BEFORE the monitoring
 * dashboard launches, so the user sees reth's native download output before the
 * TUI takes over the terminal. Resolves once reth is safe to start; rejects if
 * a required download failed (the caller must not start reth in that case).
 *
 * The snapshot download is only ever run against a datadir with no existing
 * chain data, so a synced (or mid-backfill) database is never clobbered.
 */
export async function ensureRethSnapshot({ installDir, executionType }) {
  const datadir = getRethDatadir(installDir);
  const override = (process.env.RETH_SNAPSHOT || "").trim().toLowerCase();

  if (override === "skip") {
    console.log(
      "\n[bg] RETH_SNAPSHOT=skip set; skipping snapshot download and starting reth as-is.\n"
    );
    return;
  }

  // The published snapshot is a `--full` snapshot; it cannot seed an archive
  // node, so archive nodes always sync from scratch.
  if (executionType === "archive") {
    console.log(
      "\n[bg] Archive node selected; skipping full snapshot download (not compatible with archive sync).\n"
    );
    return;
  }

  const marker = readSnapshotMarker(datadir);
  const forced = override === "force";

  // Fast path: snapshot already applied (or stamped for a pre-existing db).
  if (!forced && marker?.state === "complete") {
    return;
  }

  // AIRTIGHT GUARD: a populated database with no marker means this node existed
  // before snapshot support (or was synced/backfilled by other means). Never
  // download into it; stamp it complete so future starts take the fast path.
  if (!forced && !marker && hasExistingChainData(datadir)) {
    console.log(
      "\n[bg] Existing reth database detected without a snapshot marker."
    );
    console.log(
      "[bg] Skipping snapshot download to avoid clobbering it.\n"
    );
    writeSnapshotMarker(datadir, "complete", { reason: "preexisting-database" });
    return;
  }

  // Recover from an interrupted download (marker stuck at in_progress) or an
  // explicit force: clear partial snapshot data before (re)downloading. This is
  // only reached when there is no synced db to protect.
  if (forced || marker?.state === "in_progress") {
    console.log(
      forced
        ? "\n[bg] RETH_SNAPSHOT=force set; wiping any snapshot target data and re-downloading."
        : "\n[bg] Previous snapshot download did not finish; wiping partial data and re-downloading."
    );
    wipeSnapshotTargets(datadir);
  }

  writeSnapshotMarker(datadir, "in_progress", { startedAt: getFormattedDateTime() });
  await runSnapshotDownload(installDir, datadir);
  writeSnapshotMarker(datadir, "complete", { completedAt: getFormattedDateTime() });
  console.log("\n✅ reth snapshot download complete. Starting reth.\n");
}
