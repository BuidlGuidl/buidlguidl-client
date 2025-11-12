import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
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

let erigonCommand;

const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  erigonCommand = path.join(installDir, "ethereum_clients", "erigon", "erigon");
} else if (platform === "win32") {
  erigonCommand = path.join(
    installDir,
    "ethereum_clients",
    "erigon",
    "erigon.exe"
  );
}

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "erigon",
  "logs",
  `erigon_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

const execution = pty.spawn(
  `${erigonCommand}`,
  [
    "--chain=mainnet",
    "--externalcl", // CRITICAL: Use external consensus layer (Lighthouse/Prysm)
    ...(executionType === "archive" ? ["--prune.mode=archive"] : []),
    "--port",
    executionPeerPort,
    "--http",
    "--http.addr",
    "0.0.0.0",
    "--http.port",
    "8545",
    "--http.api",
    "eth,net,engine,admin",
    "--http.vhosts",
    "*",
    "--authrpc.addr",
    "127.0.0.1",
    "--authrpc.port",
    "8551",
    "--authrpc.jwtsecret",
    `${jwtPath}`,
    "--datadir",
    path.join(installDir, "ethereum_clients", "erigon", "database"),
    "--metrics",
    "--metrics.addr",
    "127.0.0.1",
    "--metrics.port",
    "9001", // Match Reth's metrics port
    "--ws",
    "--ws.port",
    "8546",
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
  // const exitMessage = `erigon process exited with code ${code}`;
  // logStream.write(exitMessage);
  logStream.end();
});

execution.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage }); // Send error message to parent process
  }
  debugToFile(`From erigon.js: ${errorMessage}`);
});

process.on("SIGINT", () => {
  execution.kill("SIGINT");
});
