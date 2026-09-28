import fs from "fs";
import path from "path";
import { debugToFile } from "../helpers.js";
import { getRethDatadir } from "./rethSnapshot.js";

// Lowest block a reth static-file segment still holds, read straight from the
// header of that segment's lowest non-empty static file — no RPC calls, no reth
// subprocess, no database access. This is the same value `reth db stats` shows
// as the segment's static-file block range start.
//   receipts:     below it eth_getLogs silently returns [] and receipts are null
//   transactions: below it block bodies/transactions are gone
//
// Header (`static_file_<segment>_<start>_<end>.conf`) is bincode, little-endian:
//   u64 version | u64 expected_start | u64 expected_end
//   | u8 Some/None | u64 block_start | u64 block_end | ...
// expected_start/end must match the filename; anything else means an unknown
// layout and we report null rather than guess.
//
// Don't use reth's PruneCheckpoints table: on a snapshot-synced node it reports
// ~45k blocks above the real receipt floor.
const SEGMENTS = ["receipts", "transactions"];

// Returns the floor (number), null when it can't be determined with certainty
// (unknown segment, no segment files, unfamiliar header), or undefined when a
// file read failed (e.g. reth's pruner removed a segment mid-read) so callers
// can keep their last good value. Never throws.
export function readRethSegmentFloor(installDir, segment) {
  const tag = `readRethSegmentFloor(${segment})`;
  if (!SEGMENTS.includes(segment)) {
    debugToFile(`${tag}: unknown segment`);
    return null;
  }
  const conf = new RegExp(`^static_file_${segment}_(\\d+)_(\\d+)\\.conf$`);
  const dir = path.join(getRethDatadir(installDir), "static_files");

  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    debugToFile(`${tag}: ${err.message}`);
    return undefined;
  }

  const segments = files
    .map((name) => name.match(conf))
    .filter(Boolean)
    .map((m) => ({ name: m[0], start: BigInt(m[1]), end: BigInt(m[2]) }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  for (const seg of segments) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(dir, seg.name));
    } catch (err) {
      debugToFile(`${tag}: ${err.message}`);
      return undefined;
    }
    if (
      buf.length < 41 ||
      buf.readBigUInt64LE(8) !== seg.start ||
      buf.readBigUInt64LE(16) !== seg.end
    ) {
      debugToFile(`${tag}: unexpected header in ${seg.name}`);
      return null;
    }
    if (buf[24] === 0) continue; // empty segment, try the next one
    if (buf[24] !== 1) {
      debugToFile(`${tag}: unexpected header in ${seg.name}`);
      return null;
    }
    return Number(buf.readBigUInt64LE(25));
  }
  return null;
}

export function readRethReceiptFloor(installDir) {
  return readRethSegmentFloor(installDir, "receipts") ?? null;
}
