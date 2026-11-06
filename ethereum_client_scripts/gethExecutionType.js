import fs from "fs";
import path from "path";
import { debugToFile, getFormattedDateTime } from "../helpers.js";

// Same rule as reth (resolveRethExecutionType): once a geth datadir has run as
// archive, it keeps running as archive whether or not --archive is passed.
// Geth can't reliably be asked whether a datadir is archive, and its docs warn
// that pruned historical state can't be recovered, so BG client records the
// type in a marker in the datadir.
//
// The marker is written as archive whenever geth starts as archive, and as
// full only on a fresh datadir. An existing datadir with no marker predates
// it, and a start without --archive there may just be a forgotten flag, so
// nothing is recorded until the type is known.

function gethDatadir(installDir) {
  return path.join(installDir, "ethereum_clients", "geth", "database");
}

function markerPath(datadir) {
  return path.join(datadir, ".bg_execution_type.json");
}

function readMarkerType(datadir) {
  try {
    const p = markerPath(datadir);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")).executionType || null;
  } catch (err) {
    debugToFile(`gethExecutionType.js readMarkerType(): ${err.message}`);
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
    debugToFile(`gethExecutionType.js writeMarker(): ${err.message}`);
  }
}

function hasChainData(datadir) {
  return fs.existsSync(path.join(datadir, "geth", "chaindata"));
}

export function resolveGethExecutionType({ installDir, requested }) {
  const datadir = gethDatadir(installDir);
  const recorded = readMarkerType(datadir);

  if (recorded === "archive") {
    if (requested !== "archive") {
      console.log(
        "\n[bg] Existing geth database is an archive node; running as archive (--archive not passed).\n"
      );
    }
    return "archive";
  }

  if (recorded === "full" && requested === "archive") {
    console.log(
      "\n[bg] WARNING: --archive was passed, but this geth database is a full node and has already pruned old state."
    );
    console.log(
      `[bg] Running it as a full node. To run an archive node instead, delete the geth database directory (${datadir}).\n`
    );
    return "full";
  }

  if (requested === "archive" || !hasChainData(datadir)) {
    writeMarker(datadir, requested);
  }
  return requested;
}
