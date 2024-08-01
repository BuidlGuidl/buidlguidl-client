import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes } from "../monitor_components/helperFunctions.js";

const installDir = process.env.INSTALL_DIR || os.homedir();

const jwtPath = path.join(installDir, "bgnode", "jwt", "jwt.hex");

let gethCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  gethCommand = path.join(installDir, "bgnode", "geth", "geth");
} else if (platform === "win32") {
  gethCommand = path.join(installDir, "bgnode", "geth", "geth.exe");
}

const logFilePath = path.join(
  installDir,
  "bgnode",
  "geth",
  "logs",
  `geth_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// const execution = pty.spawn(
const execution = pty.spawn(
  gethCommand,
  [
    "--mainnet",
    "--syncmode",
    "snap",
    "--http",
    "--http.api",
    "eth,net,engine",
    "--http.addr",
    "0.0.0.0",
    "--http.port",
    "8545",
    "--http.corsdomain",
    "*",
    "--datadir",
    path.join(installDir, "bgnode", "geth", "database"),
    "--authrpc.jwtsecret",
    jwtPath,
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
  debugToFile(`${errorMessage}`, () => {});
});

function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/T/, "_").replace(/\..+/, "");
}

process.on("SIGINT", () => {
  execution.kill("SIGINT");
});
