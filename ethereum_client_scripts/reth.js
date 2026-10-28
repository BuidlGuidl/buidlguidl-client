import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import {
  getRethDatadir,
  readRecordedRethDbType,
} from "./rethSnapshot.js";
import { buildRethNodeArgs } from "./rethArgs.js";
import { getExecutionIpcPath } from "./executionIpc.js";
import minimist from "minimist";

let installDir = os.homedir();

const argv = minimist(process.argv.slice(2));

const executionPeerPort = argv.executionpeerport;

const executionType = argv.executiontype;
// Opt-in (--debug-trace): adds debug,trace to the public API list.
const rpcApi = argv.debugtrace ? "eth,net,web3,debug,trace" : "eth,net,web3";

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");

let rethCommand;

const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  rethCommand = path.join(installDir, "ethereum_clients", "reth", "reth");
} else if (platform === "win32") {
  rethCommand = path.join(installDir, "ethereum_clients", "reth", "reth.exe");
}

// Shared datadir definition (also used by the snapshot download in
// rethSnapshot.js) so a custom `--directory` can never make them diverge.
const datadir = getRethDatadir(installDir);

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "reth",
  "logs",
  `reth_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Second layer behind index.js: never pass --full / --prune.* to an archive db.
const recordedType = readRecordedRethDbType(datadir)?.type;
if (recordedType === "archive" && executionType !== "archive") {
  debugToFile(
    `From reth.js: --executiontype ${executionType} but the db is archive; running as archive`
  );
}

const execution = pty.spawn(
  `${rethCommand}`,
  buildRethNodeArgs({
    executionType,
    recordedType,
    executionPeerPort,
    datadir,
    jwtPath,
    rpcApi,
    ipcPath: getExecutionIpcPath("reth", installDir),
  }),
  {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: { ...process.env, INSTALL_DIR: installDir },
  }
);

// Pipe stdout and stderr to the log file and to the parent process
execution.on("data", (data) => {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data });
  }
});

execution.on("exit", (code) => {
  // const exitMessage = `geth process exited with code ${code}`;
  // logStream.write(exitMessage);
  logStream.end();
});

execution.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage }); // Send error message to parent process
  }
  debugToFile(`From reth.js: ${errorMessage}`);
});

process.on("SIGINT", () => {
  execution.kill("SIGINT");
});
