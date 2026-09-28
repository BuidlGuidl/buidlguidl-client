import fs from "fs";
import path from "path";
import { debugToFile } from "../helpers.js";
import { getRethDatadir } from "./rethSnapshot.js";

// How far back this reth node keeps state history (balances, storage, code),
// read from [prune.segments] account_history / storage_history in reth.toml.
// No TOML dependency: a small line parser for just those keys, and anything
// unfamiliar yields null.
//
// reth.toml matches what the running node uses: on every start reth rewrites
// the prune section from its CLI prune flags when any are given (--full,
// --prune.*), and uses the file as-is when none are (archive). It can only
// disagree if the file is edited while reth is running, or if the flags
// changed and reth hasn't restarted since.
//
// reth writes each mode as a sub-table ([prune.segments.account_history] with
// `distance = N` or `before = N`); an inline `{ distance = N }` and a "full"
// string are also accepted.
const HISTORY_KEYS = ["account_history", "storage_history"];
const NUMBER = /^\d+$/;

function parseModeValue(value) {
  if (value === '"full"') return { type: "full" };
  const m = value.match(/^\{\s*(distance|before)\s*=\s*(\d+)\s*\}$/);
  return m ? toMode(m[1], m[2]) : null;
}

function toMode(type, digits) {
  if (!NUMBER.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? { type, n } : null;
}

// Returns { account_history, storage_history } with each mode or undefined
// (absent = not pruned), or null if anything looks unfamiliar.
function parseHistoryModes(text) {
  const modes = {};
  let table = "";
  let sawPrune = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#[^"]*$/, "").trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("[")) {
      const header = line.match(/^\[\s*([A-Za-z0-9_.-]+)\s*\]$/);
      table = header ? header[1] : "[[array]]";
      if (table === "prune") sawPrune = true;
      const sub = table.match(/^prune\.segments\.(.+)$/);
      if (sub && HISTORY_KEYS.includes(sub[1])) {
        if (sub[1] in modes) return null; // defined twice
        modes[sub[1]] = null; // filled by the key line below
      } else if (sub && HISTORY_KEYS.some((k) => sub[1].startsWith(`${k}.`))) {
        return null;
      }
      continue;
    }

    if (!table.startsWith("prune")) continue;
    const mentionsHistory = HISTORY_KEYS.some((k) => line.includes(k));
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);

    if (table === "prune.segments" && kv && HISTORY_KEYS.includes(kv[1])) {
      if (kv[1] in modes) return null;
      const mode = parseModeValue(kv[2]);
      if (!mode) return null;
      modes[kv[1]] = mode;
      continue;
    }

    const sub = table.match(/^prune\.segments\.(account_history|storage_history)$/);
    if (sub) {
      if (!kv || modes[sub[1]] !== null) return null; // unexpected or 2nd key
      if (kv[1] !== "distance" && kv[1] !== "before") return null;
      const mode = toMode(kv[1], kv[2]);
      if (!mode) return null;
      modes[sub[1]] = mode;
      continue;
    }

    if (mentionsHistory) return null; // some form we don't understand
  }

  if (!sawPrune) return null;
  if (Object.values(modes).some((m) => m === null)) return null; // empty sub-table
  return modes;
}

// Returns { mode: "full" } | { mode: "distance", blocks } | { mode: "before", block },
// null when unknown (missing file, unfamiliar format, "full" pruning, or any
// doubt), or undefined when the file couldn't be read so callers can keep
// their last good value. Never throws.
export function readRethStateHistory(installDir) {
  const file = path.join(getRethDatadir(installDir), "reth.toml");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    debugToFile(`readRethStateHistory(): ${err.message}`);
    return err.code === "ENOENT" ? null : undefined;
  }

  const modes = parseHistoryModes(text);
  if (!modes) {
    debugToFile("readRethStateHistory(): unexpected [prune.segments] contents");
    return null;
  }

  // Report the shallower of the two. Absent = keeps everything.
  const set = HISTORY_KEYS.map((k) => modes[k]).filter(Boolean);
  if (set.some((m) => m.type === "full")) return null; // no history kept
  if (set.length === 0) return { mode: "full" };
  if (set.length === 2 && set[0].type !== set[1].type) {
    // distance vs before can't be compared without the head block
    debugToFile("readRethStateHistory(): mixed distance/before history modes");
    return null;
  }
  if (set[0].type === "distance") {
    return { mode: "distance", blocks: Math.min(...set.map((m) => m.n)) };
  }
  return { mode: "before", block: Math.max(...set.map((m) => m.n)) };
}
