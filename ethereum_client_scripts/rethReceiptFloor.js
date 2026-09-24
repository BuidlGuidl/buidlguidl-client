import fs from "fs";
import path from "path";
import { debugToFile } from "../helpers.js";
import { getRethDatadir } from "./rethSnapshot.js";

// Lowest block that still has receipts on this reth node (below it eth_getLogs
// silently returns []). Read straight from the header of the lowest receipts
// static file — no RPC calls, no reth subprocess. This is the same value
// `reth db stats` shows as the Receipts static-file block range start.
//
// Header (`static_file_receipts_<start>_<end>.conf`) is bincode, little-endian:
//   u64 version | u64 expected_start | u64 expected_end
//   | u8 Some/None | u64 block_start | u64 block_end | ...
// expected_start/end must match the filename; anything else means an unknown
// layout and we report null rather than guess.
//
// Don't use reth's PruneCheckpoints table: on a snapshot-synced node it reports
// ~45k blocks above the real floor.
const RECEIPTS_CONF = /^static_file_receipts_(\d+)_(\d+)\.conf$/;

export function readRethReceiptFloor(installDir) {
  const dir = path.join(getRethDatadir(installDir), "static_files");
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    debugToFile(`readRethReceiptFloor(): ${err.message}`);
    return null;
  }

  const segments = files
    .map((name) => name.match(RECEIPTS_CONF))
    .filter(Boolean)
    .map((m) => ({ name: m[0], start: BigInt(m[1]), end: BigInt(m[2]) }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  for (const seg of segments) {
    try {
      const buf = fs.readFileSync(path.join(dir, seg.name));
      if (
        buf.length < 41 ||
        buf.readBigUInt64LE(8) !== seg.start ||
        buf.readBigUInt64LE(16) !== seg.end
      ) {
        debugToFile(`readRethReceiptFloor(): unexpected header in ${seg.name}`);
        return null;
      }
      if (buf[24] === 0) continue; // empty segment, try the next one
      if (buf[24] !== 1) {
        debugToFile(`readRethReceiptFloor(): unexpected header in ${seg.name}`);
        return null;
      }
      return Number(buf.readBigUInt64LE(25));
    } catch (err) {
      debugToFile(`readRethReceiptFloor(): ${err.message}`);
      return null;
    }
  }
  return null;
}
