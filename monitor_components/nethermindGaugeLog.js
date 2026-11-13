// Audit log of what the Nethermind sync gauge displayed, and the inputs it was
// computed from, so a finished sync can be checked against nethermind's own log
// (match on the `local` timestamp, which uses nethermind's "13 Nov 09:28:23"
// format).
//
// One JSON object per line in
//   <installDir>/ethereum_clients/nethermind/logs/sync_gauge.jsonl
// (.jsonl, so getLatestLogFile's nethermind_*.log filter never picks it up).
// A line is written at once when something changes state: a stage goes
// pending -> active -> done, the gauge is shown or hidden, or nethermind can't
// be read. Progress moving within a stage isn't a change, and neither are the
// active sync modes (nethermind toggles FastSync on and off with every block);
// both are recorded in a snapshot once a minute.

import fs from "fs";
import path from "path";
import { installDir } from "../commandLineOptions.js";
import { debugToFile } from "../helpers.js";

const HEARTBEAT_MS = 60_000;

let lastKey = null;
let lastWrite = 0;
let started = false;

function logPath() {
  return path.join(
    installDir,
    "ethereum_clients",
    "nethermind",
    "logs",
    "sync_gauge.jsonl"
  );
}

function localStamp(d) {
  const month = d.toLocaleString("en-US", { month: "short" });
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${month} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

// A row's state, ignoring how far along it is.
function stageState({ progress }) {
  if (progress === null) return "active";
  if (progress >= 1) return "done";
  return progress > 0 ? "active" : "pending";
}

// The text a row shows on screen.
export function displayText({ name, progress, detail }) {
  return progress === null
    ? `${name}: ▸ ${detail}`
    : `${name}: ${Math.floor(progress * 100)}%`;
}

function write(entry) {
  const now = new Date();
  const line = JSON.stringify({
    ts: now.toISOString(),
    local: localStamp(now),
    ...entry,
  });
  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    fs.appendFileSync(logPath(), line + "\n");
    lastWrite = now.getTime();
  } catch (error) {
    debugToFile(`nethermindGaugeLog: ${error}`);
  }
}

// One poll's worth. `rows` from computeNethermindStages; `inputs` the raw
// values they came from; `visible` whether the gauge is on screen.
export function recordGaugePoll({ rows, inputs, visible }) {
  if (!started) {
    started = true;
    write({ event: "monitor_start" });
  }
  const display = rows.map(displayText);
  const states = rows.map((r) => `${r.name}:${stageState(r)}`);
  const key = JSON.stringify([states, visible]);
  const changed = key !== lastKey;
  if (!changed && Date.now() - lastWrite < HEARTBEAT_MS) return;
  lastKey = key;
  write({
    event: changed ? "change" : "snapshot",
    visible,
    display,
    inputs,
  });
}

// A poll that couldn't read nethermind (down, starting, shutting down). Only
// the transition into the error state is written.
export function recordGaugeError(error) {
  const key = `error:${error}`;
  if (key === lastKey) return;
  lastKey = key;
  write({ event: "error", error: String(error) });
}
