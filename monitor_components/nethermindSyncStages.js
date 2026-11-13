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
  NETHERMIND_ARCHIVE_SNAPSHOT,
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
  } else if (/snapshot/i.test(line)) {
    noteSnapshotLine(line);
  }
}

// --- Archive snapshot restore (Nethermind's Snapshot plugin) ----------------
// The plugin runs inside the node before it finishes starting (no metrics or
// RPC yet) and reports only to the log. Its messages, from the 2.2.2 plugin:
//   "Streaming snapshot from <url>" / "Downloading snapshot from <url>"
//   "Extracting snapshot to <dir>" (non-streaming mode, after the download)
//   "Verifying snapshot checksum ..." / "Snapshot checksum progress: ..."
//   "Database successfully initialized from (streamed )snapshot."
//   "Snapshot streaming failed: ..." / "Aborting snapshot initialization ..."
//   "Restarting the snapshot download." / "Extraction did not complete last
//   time. Restarting."
// Progress comes from nethermind's progress logger under the names "Snapshot
// streaming" / "Snapshot download", whose exact line format wasn't seen before
// this was written: it's matched loosely ("<done> / <total> ( <pct> %)", or
// any "<pct> %"), and the last such line is kept in the audit log so the
// parse can be checked.
const snapshot = {
  phase: null, // "download" | "extract" | "verify" | "done"
  streaming: false, // download and extract at once (Snapshot.Streaming)
  percent: null,
  done: null,
  total: null,
  error: null,
  restarts: 0,
  lastProgressLine: null,
};

function stripStamp(line) {
  return line.replace(/^\s*\d+ \w+ [\d:]+ \|\s*/, "").trim();
}

function noteSnapshotLine(line) {
  const text = stripStamp(line);
  if (/(Streaming|Downloading) snapshot from|Restoring the official nethermind archive snapshot/.test(text)) {
    snapshot.phase = "download";
    if (/Streaming snapshot from/.test(text)) snapshot.streaming = true;
    snapshot.error = null;
    if (snapshot.percent === null) snapshot.percent = 0;
    return;
  }
  if (/Restarting the snapshot download|Extraction did not complete last time|restore did not finish/.test(text)) {
    snapshot.restarts++;
    snapshot.percent = 0;
    snapshot.done = null;
    snapshot.error = null;
    return;
  }
  if (/Database successfully initialized from (streamed )?snapshot/.test(text)) {
    snapshot.phase = "done";
    snapshot.percent = 100;
    snapshot.error = null;
    return;
  }
  if (/Snapshot streaming failed:|Aborting snapshot initialization|continue running without a snapshot|permanent HTTP error|checksum verification failed/i.test(text)) {
    snapshot.error = text;
    return;
  }
  if (/^Extracting (streamed )?snapshot to/.test(text)) {
    if (snapshot.phase !== "done") snapshot.phase = "extract";
    snapshot.percent = 0;
    return;
  }
  if (/Verifying snapshot checksum|Snapshot checksum progress/.test(text)) {
    snapshot.phase = "verify";
  }
  const counted = text.match(/([\d,]+)\s*\/\s*([\d,]+)\s*\(\s*([\d.]+)\s*%\)/);
  const pct = counted ? counted[3] : text.match(/([\d.]+)\s*%/)?.[1];
  if (pct !== undefined && /Snapshot (streaming|download)|checksum progress/i.test(text)) {
    snapshot.percent = Math.min(100, parseFloat(pct));
    snapshot.done = counted ? Number(counted[1].replace(/,/g, "")) : null;
    snapshot.total = counted ? Number(counted[2].replace(/,/g, "")) : null;
    if (snapshot.phase === null) snapshot.phase = "download";
    snapshot.lastProgressLine = text.slice(0, 200);
  }
}

export function getSnapshotLogState() {
  return { ...snapshot };
}

// Block the archive snapshot was taken at (from its file name).
export const ARCHIVE_SNAPSHOT_BLOCK = Number(
  NETHERMIND_ARCHIVE_SNAPSHOT.fileName.match(/(\d+)\.tar/)?.[1] ?? 0
);

function sizeOf(n) {
  return n >= 1e12 ? `${(n / 1e12).toFixed(2)} TB` : `${(n / 1e9).toFixed(0)} GB`;
}

// Rows for an archive node: SNAPSHOT (when BG client is restoring, or has
// restored, the official snapshot) and BLOCKS (processed height catching up
// to the chain head). The snap and fast-blocks stages don't apply: an archive
// node either restores the snapshot or full-syncs from genesis.
//   marker   BG client's restore marker state: "in_progress" | "complete" | null
//   height   processed chain height (0 while the node is still starting)
//   head     chain head, 0 if unknown
//   synced   eth_syncing returned false with a height: following the head
export function computeArchiveStages({ marker, height, head, synced }) {
  const rows = [];
  const usesSnapshot = marker !== null;
  const snapshotDone =
    marker === "complete" || snapshot.phase === "done" || (usesSnapshot && height > 0);

  if (usesSnapshot) {
    let row;
    if (snapshotDone) {
      row = { progress: 1, detail: null };
    } else if (snapshot.error) {
      row = { progress: null, detail: `failed: ${snapshot.error.slice(0, 40)}` };
    } else if (snapshot.percent !== null) {
      const label =
        snapshot.phase === "extract" ? "extracting" :
        snapshot.phase === "verify" ? "verifying" :
        snapshot.streaming ? "streaming" : "downloading";
      const sizes =
        snapshot.done !== null && snapshot.total > 1e9
          ? ` ${sizeOf(snapshot.done)} / ${sizeOf(snapshot.total)}`
          : "";
      row = { progress: Math.min(1, snapshot.percent / 100), detail: `${label}${sizes}` };
    } else {
      row = { progress: null, detail: "starting…" };
    }
    rows.push({ name: "SNAPSHOT", ...row });
  }

  // BLOCKS: from the snapshot block (or genesis) to the head.
  const base = usesSnapshot ? ARCHIVE_SNAPSHOT_BLOCK : 0;
  let blocks;
  if (usesSnapshot && !snapshotDone) {
    blocks = { progress: 0, detail: null }; // waits for the restore
  } else if (synced || (head > 0 && height >= head - 1)) {
    blocks = { progress: 1, detail: null };
  } else if (height === 0) {
    blocks = { progress: 0, detail: null };
  } else if (head > base) {
    const progress = Math.max(0, Math.min(1, (height - base) / (head - base)));
    blocks = { progress, detail: `${(head - height).toLocaleString()} behind` };
  } else {
    blocks = { progress: null, detail: `at ${height.toLocaleString()}` };
  }
  rows.push({ name: "BLOCKS", ...blocks });
  return rows;
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
