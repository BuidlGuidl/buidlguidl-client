import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import { getRethDatadir } from "./rethSnapshot.js";
import { getExecutionIpcPath } from "./executionIpc.js";
import minimist from "minimist";

let installDir = os.homedir();

const argv = minimist(process.argv.slice(2));

const executionPeerPort = argv.executionpeerport;

const executionType = argv.executiontype;

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

const execution = pty.spawn(
  `${rethCommand}`,
  [
    "node",
    ...(executionType === "archive" ? [] : ["--full"]),
    "--port",
    executionPeerPort,
    "--discovery.port",
    executionPeerPort,
    "--http",
    "--http.addr",
    "0.0.0.0",
    // HTTP and WebSocket share 8545 (Interfold ciphernodes need both on one
    // port), so reth requires the same address and API list for both. `admin`
    // stays off the network; the client uses it over IPC (--ipcpath).
    "--http.api",
    "eth,net,web3",
    "--http.corsdomain",
    "*",
    "--authrpc.addr",
    "127.0.0.1",
    "--authrpc.port",
    "8551",
    "--datadir",
    datadir,
    "--authrpc.jwtsecret",
    `${jwtPath}`,
    "--metrics",
    "127.0.0.1:9001",
    "--ws",
    "--ws.api",
    "eth,net,web3",
    "--ws.origins",
    "*",
    "--ws.addr",
    "0.0.0.0",
    "--ws.port",
    "8545",
    "--ipcpath",
    getExecutionIpcPath("reth", installDir),
    "--rpc.max-blocks-per-filter",
    "10000",
    "--rpc.max-logs-per-response",
    "10000",
    ...(executionType === "archive"
      ? []
      : ["--prune.bodies.pre-merge", "--prune.receipts.before", "15537394"]),
  ],
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
