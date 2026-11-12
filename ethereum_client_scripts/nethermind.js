import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import minimist from "minimist";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import { getExecutionIpcPath } from "./executionIpc.js";
import {
  buildNethermindArgs,
  NETHERMIND_ARCHIVE_SNAPSHOT,
} from "./nethermindArgs.js";
import {
  getNethermindDatadir,
  getNethermindDbPath,
  dirHasFiles,
} from "./nethermindExecutionType.js";

let installDir = os.homedir();

const argv = minimist(process.argv.slice(2));

const executionPeerPort = argv.executionpeerport;
const executionType = argv.executiontype;

if (argv.directory) {
  installDir = argv.directory;
}

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");

// Same layout as install.js getNethermindCommand(); not imported from there
// because install.js pulls in commandLineOptions.js, which parses this
// process's argv as if it were index.js.
const nethermindCommand = path.join(
  installDir,
  "ethereum_clients",
  "nethermind",
  "nethermind",
  "nethermind"
);

const datadir = getNethermindDatadir(installDir);

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "nethermind",
  "logs",
  `nethermind_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

function writeLog(data) {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data });
  }
}

// --- Archive snapshot -------------------------------------------------------
// Nethermind's Snapshot plugin restores the official archive snapshot inside
// the node process. It keeps its own checkpoint file, and when it finds a
// database whose restore never finished it deletes it and starts over (a
// streaming restore can't resume). That also means it would delete an archive
// database it didn't restore, so its docs say to enable it only on an empty
// database and to drop the Snapshot.* options once restored. So the options are
// passed only:
// - on an empty archive database (BG marker set to in_progress first), or
// - while the BG marker says a restore BG client started hasn't finished,
// and never again once the plugin's checkpoint says Completed or Extracted.
// NETHERMIND_SNAPSHOT=skip syncs the archive from genesis instead.
const snapshotMarkerPath = path.join(datadir, ".bg_snapshot.json");
const snapshotDir = path.join(datadir, "snapshot");

function snapshotCheckpointDone() {
  const file = path.join(
    snapshotDir,
    `checkpoint_${NETHERMIND_ARCHIVE_SNAPSHOT.fileName}`
  );
  try {
    const stage = fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim();
    return stage === "Completed" || stage === "Extracted";
  } catch {
    return false;
  }
}

function readSnapshotState() {
  try {
    return JSON.parse(fs.readFileSync(snapshotMarkerPath, "utf8")).state || null;
  } catch {
    return null;
  }
}

function writeSnapshotState(state) {
  try {
    fs.mkdirSync(datadir, { recursive: true });
    const tmpPath = `${snapshotMarkerPath}.tmp`;
    fs.writeFileSync(
      tmpPath,
      JSON.stringify(
        {
          state,
          url: NETHERMIND_ARCHIVE_SNAPSHOT.url,
          timestamp: getFormattedDateTime(),
        },
        null,
        2
      )
    );
    fs.renameSync(tmpPath, snapshotMarkerPath);
  } catch (err) {
    debugToFile(`From nethermind.js: writeSnapshotState(): ${err.message}`);
  }
}

function useArchiveSnapshot() {
  if (executionType !== "archive") return false;
  const override = (process.env.NETHERMIND_SNAPSHOT || "").trim().toLowerCase();
  if (override === "skip") return false;

  const state = readSnapshotState();
  if (state === "complete") return false;
  if (snapshotCheckpointDone()) {
    writeSnapshotState("complete");
    return false;
  }

  if (state === "in_progress") {
    writeLog(
      "[bg] The nethermind archive snapshot restore did not finish; nethermind will restart it.\n"
    );
  } else if (dirHasFiles(getNethermindDbPath(installDir, "archive"))) {
    // An archive db BG client didn't restore: the plugin would delete it.
    writeSnapshotState("complete");
    return false;
  }

  writeSnapshotState("in_progress");
  writeLog(
    "[bg] Restoring the official nethermind archive snapshot (about 2 TB, needs about 3 TB free). Do not stop the client until it finishes: a streaming restore can't resume.\n"
  );
  return true;
}

const restoringSnapshot = useArchiveSnapshot();

const args = buildNethermindArgs({
  executionType,
  executionPeerPort,
  datadir,
  jwtPath,
  ipcPath: getExecutionIpcPath("nethermind", installDir),
  debugTrace: !!argv.debugtrace,
  snapshot: restoringSnapshot ? NETHERMIND_ARCHIVE_SNAPSHOT : null,
  snapshotDir,
});

debugToFile(`From nethermind.js: ${nethermindCommand} ${args.join(" ")}`);

const execution = pty.spawn(nethermindCommand, args, {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: { ...process.env, INSTALL_DIR: installDir },
});

execution.on("data", writeLog);

execution.on("exit", () => {
  logStream.end();
});

execution.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage });
  }
  debugToFile(`From nethermind.js: ${errorMessage}`);
});

process.on("SIGINT", () => {
  execution.kill("SIGINT");
});
