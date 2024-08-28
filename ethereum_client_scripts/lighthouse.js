import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";

let installDir = os.homedir();

const argv = minimist(process.argv.slice(2));

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");

let lighthouseCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  lighthouseCommand = path.join(
    installDir,
    "ethereum_clients",
    "lighthouse",
    "lighthouse"
  );
} else if (platform === "win32") {
  lighthouseCommand = path.join(
    installDir,
    "ethereum_clients",
    "lighthouse",
    "lighthouse.exe"
  );
}

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "lighthouse",
  "logs",
  `lighthouse_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

const consensus = pty.spawn(
  `${lighthouseCommand}`,
  [
    "bn",
    "--network",
    "mainnet",
    "--execution-endpoint",
    "http://localhost:8551",
    "--checkpoint-sync-url",
    "https://mainnet.checkpoint.sigp.io",
    "--checkpoint-sync-url-timeout",
    "600",
    "--disable-deposit-contract-sync",
    "--datadir",
    path.join(installDir, "ethereum_clients", "lighthouse", "database"),
    "--execution-jwt",
    `${jwtPath}`,
    "--metrics",
    "--metrics-address",
    "127.0.0.1",
    "--metrics-port",
    "5054",
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
consensus.on("data", (data) => {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data }); // No need for .toString(), pty preserves colors
  }
});

consensus.on("exit", (code) => {
  // const exitMessage = `prysm process exited with code ${code}`;
  // logStream.write(exitMessage);
  logStream.end();
});

consensus.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage }); // Send error message to parent process
  }
  debugToFile(`From lighthouse.js: ${errorMessage}`, () => {});
});

process.on("SIGINT", () => {
  consensus.kill("SIGINT");
});
