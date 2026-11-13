// Nethermind sync stages from its Prometheus metrics (127.0.0.1:9001, enabled
// in nethermindArgs.js). No log parsing. Metric names checked against
// Nethermind 2.2.2.
//
// What the metrics give us:
//   nethermind_sync_time_in_mode_seconds{sync_mode=...}  cumulative seconds per
//     sync mode; the modes active right now are the ones that grew since the
//     last poll (modes overlap, e.g. StateNodes + FastSync).
//   nethermind_fast_headers / _bodies / _receipts  blocks downloaded in the
//     fast-blocks stages (counted down from the pivot).
//   nethermind_snap_synced_accounts  accounts from snap ranges (phase 1).
//   nethermind_state_synced, nethermind_synced_state_trie_nodes,
//   nethermind_synced_storage_trie_nodes  state healing (phase 2).
// Nethermind publishes no completion percentage for either state phase, so
// those two stages report counts, not a bar.
//
// All of these counters are in-process and restart from 0 with nethermind.
// The fast-blocks stages aren't redone after a restart, so their completion is
// read from the database over RPC instead (see `persisted`). Snap state is
// different: nethermind 2.2.2's flat snap sync can't resume and starts state
// over after a restart, so its zeroed counters are the truth.

import {
  NETHERMIND_BODIES_SINCE,
  NETHERMIND_RECEIPTS_SINCE,
} from "../ethereum_client_scripts/nethermindArgs.js";

export const NETHERMIND_METRICS_URL = "http://127.0.0.1:9001/metrics";

// The one value taken from the log: snap phase 1 completion. Nethermind
// computes it (share of the account keyspace covered) but publishes it only
// in its log, not as a metric or over RPC:
//   "Snap         State Ranges (Phase 1 of 2): (  3.18 %) [...]"
//   "Snap - State Ranges (Phase 1 of 2) finished."
// null until a line has been seen. A nethermind restart starts snap over and
// a new log file, so the value from the current file is the current run's.
let snapRangesPercent = null;
const SNAP_RANGES_LINE = /State Ranges \(Phase 1 of 2\): \(\s*([\d.]+)\s*%\)/;

export function noteNethermindLogLine(line) {
  const m = line.match(SNAP_RANGES_LINE);
  if (m) {
    snapRangesPercent = parseFloat(m[1]);
  } else if (/State Ranges \(Phase 1 of 2\) finished/.test(line)) {
    snapRangesPercent = 100;
  }
}

export function getSnapRangesPercent() {
  return snapRangesPercent;
}

// Returns { values: {name: number}, modes: {mode: seconds} } from a Prometheus
// text page. Labels other than sync_mode are dropped (only unlabelled values
// and the per-mode times are needed).
export function parseNethermindMetrics(text) {
  const values = {};
  const modes = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_:][\w:]*)(?:\{([^}]*)\})?\s+(\S+)/);
    if (!m) continue;
    const [, name, labels = "", raw] = m;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (name === "nethermind_sync_time_in_mode_seconds") {
      const mode = labels.match(/sync_mode="([^"]+)"/);
      if (mode) modes[mode[1]] = value;
    } else if (!(name in values)) {
      values[name] = value;
    }
  }
  return { values, modes };
}

function compact(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function bytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

// Stage rows for the gauge: [{ name, progress, detail }]. `progress` is 0..1
// for a measurable stage, or null when Nethermind gives no percentage (then
// `detail` says what it is doing). `prev` is the previous poll's parse (or
// null on the first); `headBlock` the chain head (eth_syncing highestBlock),
// used as the pivot until the headers stage reports it; `archive` keeps full
// history, so bodies and receipts go back to genesis. `persisted` says which
// fast-blocks stages the database shows as complete ({ headers, bodies,
// receipts }), which holds across restarts.
export function computeNethermindStages(
  cur,
  prev,
  headBlock,
  archive,
  persisted = {}
) {
  const v = (k) => cur.values[k] ?? 0;
  const ran = (mode) => (cur.modes[mode] ?? 0) > 0;
  const active = (mode) =>
    prev !== null && (cur.modes[mode] ?? 0) > (prev.modes[mode] ?? 0);

  // persisted.state: the node processes blocks, so state sync is complete.
  const full = ran("Full") || active("Full") || persisted.state === true;
  const healingStarted = v("nethermind_state_synced") > 0;
  const stateActive = active("StateNodes");
  const bodiesStarted = ran("FastBodies") || v("nethermind_fast_bodies") > 0;
  const receiptsStarted =
    ran("FastReceipts") || v("nethermind_fast_receipts") > 0;

  // HEADERS: downloaded from the pivot to genesis, so the count once done is
  // the pivot number. Done when the stage stopped, or a later stage has begun
  // (after a restart the counter starts again from 0 and headers aren't redone).
  const headers = v("nethermind_fast_headers");
  const headersDone =
    persisted.headers ||
    full ||
    healingStarted ||
    bodiesStarted ||
    receiptsStarted ||
    (headers > 0 && prev !== null && !active("FastHeaders"));
  const pivot = headersDone && headers > 0 ? headers : headBlock;
  const headersProgress = headersDone
    ? 1
    : pivot > 0
    ? Math.min(1, headers / pivot)
    : 0;

  // STATE RANGES (snap phase 1) ends where healing (phase 2) begins.
  const accounts = v("nethermind_snap_synced_accounts");
  const rangesDone = full || healingStarted;
  const ranges = rangesDone
    ? { progress: 1, detail: null }
    : snapRangesPercent !== null
    ? { progress: Math.min(1, snapRangesPercent / 100), detail: null }
    : stateActive || accounts > 0
    ? // no progress line logged yet (it comes every few seconds)
      { progress: null, detail: `${compact(accounts)} accounts` }
    : { progress: 0, detail: null };

  // HEALING (snap phase 2): no end point is known until it finishes.
  const healed = v("nethermind_state_synced");
  const trieNodes =
    v("nethermind_synced_state_trie_nodes") +
    v("nethermind_synced_storage_trie_nodes");
  const healingDone =
    full || (healingStarted && !stateActive && (bodiesStarted || receiptsStarted));
  const healing = healingDone
    ? { progress: 1, detail: null }
    : healingStarted
    ? { progress: null, detail: `${bytes(healed)} · ${compact(trieNodes)} nodes` }
    : { progress: 0, detail: null };

  // BODIES / RECEIPTS: from the pivot back to the history floor.
  const fastBlocks = (count, since, done) => {
    if (done) return { progress: 1, detail: null };
    const target = pivot - (archive ? 0 : since);
    if (target <= 0) return { progress: 0, detail: null };
    const progress = Math.min(1, count / target);
    return { progress: progress >= 0.999 ? 1 : progress, detail: null };
  };
  const bodies = fastBlocks(
    v("nethermind_fast_bodies"),
    NETHERMIND_BODIES_SINCE,
    persisted.bodies
  );
  const receipts = fastBlocks(
    v("nethermind_fast_receipts"),
    NETHERMIND_RECEIPTS_SINCE,
    persisted.receipts
  );

  return [
    { name: "HEADERS", progress: headersProgress, detail: null },
    { name: "STATE RANGES", ...ranges },
    { name: "STATE HEALING", ...healing },
    { name: "BODIES", ...bodies },
    { name: "RECEIPTS", ...receipts },
  ];
}
