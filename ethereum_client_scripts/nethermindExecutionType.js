import fs from "fs";
import path from "path";
import { debugToFile, getFormattedDateTime } from "../helpers.js";

// Same rule as reth and geth: once a nethermind datadir has run as archive, it
// keeps running as archive whether or not --archive is passed. Nethermind
// keeps no settings in its datadir (they come only from CLI flags and the
// preset), so BG client records the type in a marker, as it does for geth.
//
// The two presets also keep their databases apart (nethermind_db/mainnet vs
// nethermind_db/mainnet_archive), so a start with the wrong type opens a
// different database rather than pruning the other one.

export function getNethermindDatadir(installDir) {
  return path.join(installDir, "ethereum_clients", "nethermind", "database");
}

// Database directory each preset uses (Init.BaseDbPath, relative to --data-dir).
export function getNethermindDbPath(installDir, executionType) {
  return path.join(
    getNethermindDatadir(installDir),
    "nethermind_db",
    executionType === "archive" ? "mainnet_archive" : "mainnet"
  );
}

function markerPath(datadir) {
  return path.join(datadir, ".bg_execution_type.json");
}

// The type this node runs as ("archive" | "full"), or null before the first
// start has recorded it.
export function readNethermindExecutionType(installDir) {
  return readMarkerType(getNethermindDatadir(installDir));
}

function readMarkerType(datadir) {
  try {
    const p = markerPath(datadir);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")).executionType || null;
  } catch (err) {
    debugToFile(`nethermindExecutionType.js readMarkerType(): ${err.message}`);
    return null;
  }
}

function writeMarker(datadir, executionType) {
  try {
    fs.mkdirSync(datadir, { recursive: true });
    const p = markerPath(datadir);
    const tmpPath = `${p}.tmp`;
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({ executionType, timestamp: getFormattedDateTime() }, null, 2)
    );
    fs.renameSync(tmpPath, p);
  } catch (err) {
    debugToFile(`nethermindExecutionType.js writeMarker(): ${err.message}`);
  }
}

export function dirHasFiles(dir) {
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  } catch (err) {
    debugToFile(`nethermindExecutionType.js dirHasFiles(${dir}): ${err.message}`);
    return false;
  }
}

export function resolveNethermindExecutionType({ installDir, requested }) {
  const datadir = getNethermindDatadir(installDir);
  const recorded = readMarkerType(datadir);

  if (recorded === "archive") {
    if (requested !== "archive") {
      console.log(
        "\n[bg] Existing nethermind database is an archive node; running as archive (--archive not passed).\n"
      );
    }
    return "archive";
  }

  if (recorded === "full" && requested === "archive") {
    console.log(
      "\n[bg] WARNING: --archive was passed, but this nethermind database is a full node."
    );
    console.log(
      `[bg] Running it as a full node. To run an archive node instead, delete the nethermind database directory (${datadir}).\n`
    );
    return "full";
  }

  if (!recorded) writeMarker(datadir, requested);
  return requested;
}
