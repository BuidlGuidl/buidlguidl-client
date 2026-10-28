import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { debugToFile, getFormattedDateTime } from "../helpers.js";
import { fetchLatestMainnetManifest } from "./rethManifest.js";
import { readRethTomlPruning } from "./rethPruneConfig.js";

// Single source of truth for reth's data directory. Both the snapshot download
// (here) and the node run (reth.js) import this so a custom `--directory` can
// never cause the two to point at different paths.
export function getRethDatadir(installDir) {
  return path.join(installDir, "ethereum_clients", "reth", "database");
}

export function getRethCommand(installDir) {
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
export function hasExistingChainData(datadir) {
  const mdbx = path.join(datadir, "db", "mdbx.dat");
  const dbVersion = path.join(datadir, "db", "database.version");
  const staticFiles = path.join(datadir, "static_files");
  return (
    fs.existsSync(mdbx) ||
    fs.existsSync(dbVersion) ||
    dirHasFiles(staticFiles)
  );
}

// What an existing reth database is: { type: "archive" | "full", source }, or
// null when there's no synced database to go by (fresh install or a partial
// snapshot download). Never throws.
//
// - A marker saying archive always wins. An archive db that a full start has
//   since damaged has prune segments in reth.toml, so reth.toml can't overrule
//   it.
// - A marker type from a real snapshot download is trusted.
// - Otherwise (no marker, a marker without a type, or a "preexisting-database"
//   stamp, which older BG clients wrote with whatever type was requested even
//   when --archive was forgotten), go by reth.toml: prune segments mean full,
//   none mean archive.
// - With no reth.toml either, fall back to the marker's type. Markers without
//   a type predate archive snapshots, so those were full.
export function readRecordedRethDbType(datadir) {
  const marker = readSnapshotMarker(datadir);
  if (marker?.state === "in_progress") return null;
  if (!hasExistingChainData(datadir)) return null;

  const complete = marker?.state === "complete" ? marker : null;
  const markerType = complete?.executionType;
  if (markerType === "archive") return { type: "archive", source: "marker" };
  if (markerType && complete.reason !== "preexisting-database") {
    return { type: markerType, source: "marker" };
  }

  const pruned = readRethTomlPruning(datadir);
  if (pruned !== null) {
    return { type: pruned ? "full" : "archive", source: "reth.toml" };
  }
  if (complete) return { type: markerType || "full", source: "marker" };
  return null;
}

/**
 * The execution type to run reth as. An existing database's recorded type wins
 * over the --archive flag, so forgetting the flag can never turn an archive
 * node into a pruning full node; switching back to full needs the database
 * deleted or RETH_SNAPSHOT=force. With no existing database, the flag decides.
 *
 * Call once, before ensureRethSnapshot(). Also corrects a marker whose type
 * was missing or wrong, so later starts take the marker's word.
 */
export function resolveRethExecutionType({ installDir, requested }) {
  const datadir = getRethDatadir(installDir);
  const override = (process.env.RETH_SNAPSHOT || "").trim().toLowerCase();
  if (override === "force") return requested; // the db is about to be wiped

  const recorded = readRecordedRethDbType(datadir);
  if (!recorded) return requested;

  const marker = readSnapshotMarker(datadir);
  if (
    recorded.source === "reth.toml" &&
    marker?.state === "complete" &&
    marker.executionType !== recorded.type
  ) {
    const { state, timestamp, ...rest } = marker;
    writeSnapshotMarker(datadir, state, {
      ...rest,
      executionType: recorded.type,
      executionTypeSource: "reth.toml",
    });
  }

  if (recorded.type === "archive" && requested !== "archive") {
    console.log(
      "\n[bg] Existing reth database is an archive node; running as archive (--archive not passed).\n"
    );
  } else if (recorded.type === "full" && requested === "archive") {
    console.log(
      "\n[bg] WARNING: --archive was passed, but this reth database is a full node and has already pruned old history."
    );
    console.log(
      "[bg] Running it as a full node. To run an archive node instead, delete the reth database"
    );
    console.log(
      `[bg] directory (${datadir}) or set RETH_SNAPSHOT=force to download an archive snapshot (about 3 TB).\n`
    );
  }
  return recorded.type;
}

// Remove only the snapshot's targets (never the whole datadir and never the
// marker) — the same set `reth download --force` clears. Only ever called when
// we know there is no synced db to protect (fresh install or recovering a
// partial/forced download).
function wipeSnapshotTargets(datadir) {
  for (const sub of ["db", "static_files", "rocksdb", "reth.toml"]) {
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

function logFreeSpace(datadir, executionType) {
  try {
    if (typeof fs.statfsSync === "function") {
      const stats = fs.statfsSync(datadir);
      const freeGb = (stats.bavail * stats.bsize) / 1e9;
      console.log(
        `   Free space at datadir: ${freeGb.toFixed(
          0
        )} GB (a ${executionType} reth snapshot needs ${
          executionType === "archive" ? "about 3 TB" : "well over 1 TB"
        }).`
      );
    }
  } catch (err) {
    debugToFile(`rethSnapshot.js logFreeSpace(): ${err.message}`);
  }
}

// Interfold ciphernodes scan eth_getLogs from their oldest configured deploy
// block (fee_token, 20,663,730). Reth 2.8.0 fails those queries with "4444:
// pruned history unavailable" wherever receipts are missing, so full nodes keep
// receipts from the start of the 50k-block file holding that block. Also the
// floor --add-interfold-receipts fills existing nodes down to.
export const INTERFOLD_RECEIPTS_SINCE = 20650000;

// `--full` only fetches receipts for the snapshot's last 10,064 blocks and
// can't be combined with --with-receipts-since, so list its components
// instead: state + headers (always included), transactions since the merge,
// state history for the last 10,064 blocks, plus receipts back to
// INTERFOLD_RECEIPTS_SINCE (~215 GB more on disk than --full).
const RETH_FULL_SNAPSHOT_ARGS = [
  "--with-txs-since",
  "15537394",
  "--with-state-history-distance",
  "10064",
  "--with-receipts-since",
  String(INTERFOLD_RECEIPTS_SINCE),
];

// Spawn `reth download` with inherited stdio so reth's own progress output owns
// the terminal. Resolves ONLY on a clean exit code 0; completion is detected by
// the exit code, never by parsing output.
function runSnapshotDownload(installDir, datadir, executionType, manifestPath) {
  return new Promise((resolve, reject) => {
    const rethCommand = getRethCommand(installDir);

    console.log(
      "\n📥 Downloading reth database snapshot. This can take a long time and"
    );
    console.log(
      "   must finish before reth and the dashboard start. Do not interrupt.\n"
    );
    logFreeSpace(datadir, executionType);
    console.log("");

    const download = spawn(
      rethCommand,
      [
        "download",
        "--datadir",
        datadir,
        "--chain",
        "mainnet",
        "--manifest-path",
        manifestPath,
        ...(executionType === "archive"
          ? ["--archive"]
          : RETH_FULL_SNAPSHOT_ARGS),
      ],
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

  const marker = readSnapshotMarker(datadir);
  const forced = override === "force";

  // Fast path: snapshot already applied (or stamped for a pre-existing db).
  // resolveRethExecutionType() has already matched executionType to the db and
  // warned about a mismatch with the flag.
  if (!forced && marker?.state === "complete") {
    return;
  }

  // AIRTIGHT GUARD: a populated database with no marker means this node existed
  // before snapshot support (or was synced/backfilled by other means). Never
  // download into it; stamp it complete so future starts take the fast path.
  // executionType here is what resolveRethExecutionType() read from reth.toml,
  // not the flag, so a forgotten --archive can't label an archive db full.
  if (!forced && !marker && hasExistingChainData(datadir)) {
    console.log(
      "\n[bg] Existing reth database detected without a snapshot marker."
    );
    console.log(
      "[bg] Skipping snapshot download to avoid clobbering it.\n"
    );
    writeSnapshotMarker(datadir, "complete", {
      reason: "preexisting-database",
      executionType,
    });
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

  writeSnapshotMarker(datadir, "in_progress", {
    startedAt: getFormattedDateTime(),
    executionType,
  });
  // Resolve the manifest here (timeout + retries) instead of letting reth
  // discover it, which can hang forever; see rethManifest.js.
  const manifestPath = path.join(datadir, ".bg_snapshot_manifest.json");
  console.log("\n[bg] Looking up the latest reth snapshot...");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(await fetchLatestMainnetManifest())
  );
  await runSnapshotDownload(installDir, datadir, executionType, manifestPath);
  fs.rmSync(manifestPath, { force: true });
  writeSnapshotMarker(datadir, "complete", {
    completedAt: getFormattedDateTime(),
    executionType,
  });
  console.log("\n✅ reth snapshot download complete. Starting reth.\n");
}
