import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";

let installDir = os.homedir();

const argv = minimist(process.argv.slice(2));

// Check if a different install directory was provided via the `-d` option
if (argv.d) {
  installDir = argv.d;
}

const jwtPath = path.join(installDir, "bgnode", "jwt", "jwt.hex");

let rethCommand;

const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  rethCommand = path.join(installDir, "bgnode", "reth", "reth");
} else if (platform === "win32") {
  rethCommand = path.join(installDir, "bgnode", "reth", "reth.exe");
}

const logFilePath = path.join(
  installDir,
  "bgnode",
  "reth",
  "logs",
  `reth_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

const execution = pty.spawn(
  `${rethCommand}`,
  [
    "node",
    "--full",
    "--http",
    "--http.addr",
    "0.0.0.0",
    "--http.api",
    // "trace,web3,eth,debug",
    // "trace,web3,eth,debug,net",
    "debug,eth,net,trace,txpool,web3,rpc",
    "--ws",
    "--ws.api",
    "trace,web3,eth,debug",
    "--authrpc.addr",
    "127.0.0.1",
    "--authrpc.port",
    "8551",
    "--datadir",
    path.join(installDir, "bgnode", "reth", "database"),
    "--authrpc.jwtsecret",
    `${jwtPath}`,
    "--metrics",
    "127.0.0.1:9001",
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
  debugToFile(`From reth.js: ${errorMessage}`, () => {});
});

process.on("SIGINT", () => {
  execution.kill("SIGINT");
});
