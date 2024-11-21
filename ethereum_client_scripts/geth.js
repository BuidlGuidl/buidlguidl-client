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
debugToFile(`From geth.js: executionType: ${executionType}`);

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");

let gethCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  gethCommand = path.join(installDir, "ethereum_clients", "geth", "geth");
} else if (platform === "win32") {
  gethCommand = path.join(installDir, "ethereum_clients", "geth", "geth.exe");
}

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "geth",
  "logs",
  `geth_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

const execution = pty.spawn(
  gethCommand,
  [
    "--mainnet",
    "--syncmode",
    // "snap",
    ...(executionType === "full"
      ? ["snap"]
      : executionType === "archive"
      ? ["full", "--gcmode", "archive"]
      : []),
    "--port",
    executionPeerPort,
    "--discovery.port",
    executionPeerPort,
    "--http",
    "--http.api",
    "eth,net,engine,admin",
    "--http.addr",
    "0.0.0.0",
    "--http.port",
    "8545",
    "--http.corsdomain",
    "*",
    "--datadir",
    path.join(installDir, "ethereum_clients", "geth", "database"),
    "--authrpc.jwtsecret",
    jwtPath,
    "--metrics",
    "--metrics.addr",
    "127.0.0.1",
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
  debugToFile(`From geth.js: ${errorMessage}`);
});

process.on("SIGINT", () => {
  execution.kill("SIGINT");
});
