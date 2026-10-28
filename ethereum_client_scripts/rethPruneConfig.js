import fs from "fs";
import path from "path";
import { debugToFile, getFormattedDateTime } from "../helpers.js";

// Reads and edits the [prune] config in reth.toml. No TOML dependency: a small
// line scanner in the same style as rethStateHistory.js.
//
// Reth 2.8.0 always serializes a [prune] table (PruneConfig is not optional),
// so an archive node's reth.toml has one too, just with no segments set. What
// marks a pruned (full) node is a segment under [prune.segments] (or its alias
// [prune.parts]): `sender_recovery = "full"`, a [prune.segments.account_history]
// sub-table, and so on.
//
// When reth gets no CLI prune flags (--full, --prune.*), which is how BG client
// starts an archive node, it uses this section as-is. So once a full start has
// written segments here, an archive start keeps pruning until they're removed.

const PRUNE_HEADER = /^\[\s*prune(\.[A-Za-z0-9_.-]+)?\s*\]$/;
const SEGMENTS_TABLE = /^prune\.(segments|parts)(\..+)?$/;

function rethTomlPath(datadir) {
  return path.join(datadir, "reth.toml");
}

function stripComment(raw) {
  return raw.replace(/\s+#[^"]*$/, "").trim();
}

// Returns true if any prune segment is configured: a key under [prune.segments]
// or one of its sub-tables ([prune.segments.account_history] `distance = N`).
// An empty sub-table header doesn't count. Never throws.
export function tomlHasPruneSegments(text) {
  let table = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("[")) {
      const header = line.match(/^\[\s*([A-Za-z0-9_.-]+)\s*\]$/);
      table = header ? header[1] : "[[array]]";
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_.]+)\s*=/);
    if (!kv) continue;
    if (SEGMENTS_TABLE.test(table)) return true;
    if (table === "prune" && /^(segments|parts)\./.test(kv[1])) return true;
  }
  return false;
}

// Returns true (segments set), false (no pruning configured, including no
// [prune] table at all), or null if reth.toml is missing or unreadable.
export function readRethTomlPruning(datadir) {
  let text;
  try {
    text = fs.readFileSync(rethTomlPath(datadir), "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") {
      debugToFile(`readRethTomlPruning(): ${err.message}`);
    }
    return null;
  }
  return tomlHasPruneSegments(text);
}

// Drops the [prune] table and every [prune.*] sub-table; leaves the rest of the
// file as it was. Reth fills a missing [prune] with its default (no pruning).
export function removePruneTables(text) {
  const out = [];
  let inPrune = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (line.startsWith("[")) inPrune = PRUNE_HEADER.test(line);
    if (!inPrune) out.push(raw);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Archive nodes only, before reth starts. If reth.toml has prune segments left
// over from a full start, back the file up and remove the prune config so reth
// stops pruning. Returns the backup path, or null if nothing needed changing.
// Throws if the file can't be rewritten: starting reth with the segments still
// in place would keep deleting history.
export function removeStaleRethPruneConfig(datadir) {
  if (readRethTomlPruning(datadir) !== true) return null;

  const file = rethTomlPath(datadir);
  const text = fs.readFileSync(file, "utf8");
  const backup = `${file}.bak-${getFormattedDateTime()}`;
  fs.copyFileSync(file, backup);

  const tmpPath = `${file}.tmp`;
  fs.writeFileSync(tmpPath, removePruneTables(text));
  fs.renameSync(tmpPath, file);

  console.log(
    "\n⚠️  [bg] WARNING: this reth database is an archive node, but its reth.toml had pruning config"
  );
  console.log(
    "   (left by a start without --archive). Reth was deleting history with it."
  );
  console.log(`   Removed the [prune] config. Backup: ${backup}`);
  console.log(
    "   History pruned before now may already be gone; check older blocks before relying on this node as an archive.\n"
  );
  debugToFile(`removeStaleRethPruneConfig(): removed [prune], backup ${backup}`);
  return backup;
}
