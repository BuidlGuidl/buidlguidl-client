import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { debugToFile } from "../helpers.js";
import {
  getRethCommand,
  getRethDatadir,
  INTERFOLD_RECEIPTS_SINCE,
} from "./rethSnapshot.js";
import { readRethReceiptFloor } from "./rethReceiptFloor.js";
import { fetchLatestMainnetManifest } from "./rethManifest.js";

// --add-interfold-receipts: fill in the receipt history a reth node synced from an
// older BG snapshot is missing, so an Interfold ciphernode can replay its
// contract logs.
//
// Snapshots downloaded with `reth download --full` (BG client before receipts
// were included by default) only hold receipts for the snapshot's last 10,064
// blocks. Reth 2.8.0 fails a log query with "4444: pruned history unavailable"
// when a block's bloom matches but its receipts are missing, and bloom false
// positives make that unpredictable, so every receipt file from
// INTERFOLD_RECEIPTS_SINCE up to the node's floor is restored (~193 GB on disk
// for a floor of 25,800,000).
//
// The files come from the official reth snapshot via `reth download` itself,
// so reth verifies every file against the manifest's blake3 hashes. The
// manifest is trimmed to the receipts component and to the node's floor, so
// nothing else is downloaded. Files land in a scratch datadir on the same
// disk, then move into the live static_files directory before reth starts.

const BLOCKS_PER_FILE = 50000;
const FREE_SPACE_MARGIN = 10e9; // in-flight archive + slack

// Keep only the receipts component, ending at `floor`, so `reth download` can't
// select anything the node already has.
function trimManifest(manifest, floor) {
  const receipts = manifest.components?.receipts;
  const chunks = floor / BLOCKS_PER_FILE;
  if (
    !receipts ||
    receipts.blocks_per_file !== BLOCKS_PER_FILE ||
    !Array.isArray(receipts.chunk_sizes) ||
    receipts.chunk_sizes.length < chunks
  ) {
    throw new Error("snapshot manifest has an unexpected receipts layout");
  }
  for (const key of [
    "chunk_sizes",
    "chunk_decompressed_sizes",
    "chunk_output_files",
  ]) {
    receipts[key] = receipts[key].slice(0, chunks);
  }
  receipts.total_blocks = floor;
  return { ...manifest, block: floor, components: { receipts } };
}

function receiptFileNames(start) {
  const base = `static_file_receipts_${start}_${start + BLOCKS_PER_FILE - 1}`;
  return [base, `${base}.conf`, `${base}.off`];
}

function runRethDownload(installDir, args) {
  return new Promise((resolve, reject) => {
    const download = spawn(getRethCommand(installDir), ["download", ...args], {
      stdio: "inherit",
      cwd: process.env.HOME,
      env: { ...process.env, INSTALL_DIR: installDir },
    });
    download.on("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `reth download exited with code ${code}${signal ? ` (signal ${signal})` : ""}`
            )
          )
    );
    download.on("error", reject);
  });
}

/**
 * Restore receipt files below the node's current floor down to `since`.
 * Must run while reth is stopped (before it is started). Safe to re-run: an
 * interrupted download resumes from the files already verified in the scratch
 * datadir, and a node that already has the history is left untouched.
 */
export async function restoreRethReceipts({
  installDir,
  since = INTERFOLD_RECEIPTS_SINCE,
}) {
  const datadir = getRethDatadir(installDir);
  const staticDir = path.join(datadir, "static_files");
  const scratchDir = path.join(path.dirname(datadir), "receipts-restore");

  const floor = readRethReceiptFloor(installDir);
  if (floor === null) {
    throw new Error(`could not read the receipt floor from ${staticDir}`);
  }
  if (floor <= since) {
    console.log(
      `\n[bg] --add-interfold-receipts: reth already has receipts from block ${floor}; nothing to restore.\n`
    );
    return;
  }
  if (floor % BLOCKS_PER_FILE !== 0 || since % BLOCKS_PER_FILE !== 0) {
    throw new Error(
      `receipt floor ${floor} is not on a ${BLOCKS_PER_FILE}-block file boundary; not restoring`
    );
  }

  console.log(
    `\n📥 [bg] --add-interfold-receipts: restoring reth receipts for blocks ${since}-${
      floor - 1
    } from the official reth snapshot.`
  );

  const manifest = trimManifest(await fetchLatestMainnetManifest(), floor);
  const firstChunk = since / BLOCKS_PER_FILE;
  const sizes =
    manifest.components.receipts.chunk_decompressed_sizes.slice(firstChunk);
  const needed = sizes.reduce((sum, s) => sum + s, 0);

  fs.mkdirSync(scratchDir, { recursive: true });
  const stats = fs.statfsSync(scratchDir);
  const free = stats.bavail * stats.bsize;
  console.log(
    `   ${sizes.length} receipt files, ${(needed / 1e9).toFixed(0)} GB on disk. Free space: ${(
      free / 1e9
    ).toFixed(0)} GB.\n`
  );
  if (free < needed + FREE_SPACE_MARGIN) {
    throw new Error(
      `not enough free space: need about ${(
        (needed + FREE_SPACE_MARGIN) /
        1e9
      ).toFixed(0)} GB, have ${(free / 1e9).toFixed(0)} GB`
    );
  }

  const manifestPath = path.join(scratchDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  await runRethDownload(installDir, [
    "--manifest-path",
    manifestPath,
    "--datadir",
    scratchDir,
    "--chain",
    "mainnet",
    "-y",
    "--with-receipts-distance",
    String(floor - since),
  ]);

  // Check every file is present before moving any, so a surprise never leaves
  // the live node with a partial range.
  const moves = [];
  for (let start = since; start < floor; start += BLOCKS_PER_FILE) {
    for (const name of receiptFileNames(start)) {
      const src = path.join(scratchDir, "static_files", name);
      const dest = path.join(staticDir, name);
      if (!fs.existsSync(src)) throw new Error(`download is missing ${name}`);
      if (fs.existsSync(dest))
        throw new Error(`${name} already exists in ${staticDir}`);
      moves.push([src, dest]);
    }
  }
  for (const [src, dest] of moves) fs.renameSync(src, dest);

  const newFloor = readRethReceiptFloor(installDir);
  if (newFloor !== since) {
    throw new Error(
      `receipt floor is ${newFloor} after restore, expected ${since}`
    );
  }
  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  } catch (err) {
    debugToFile(`rethReceiptRestore.js cleanup(${scratchDir}): ${err.message}`);
  }
  console.log(
    `\n✅ [bg] reth receipts restored; history now starts at block ${since}.\n`
  );
}
