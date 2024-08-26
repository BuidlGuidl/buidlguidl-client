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

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");

let prysmCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  prysmCommand = path.join(installDir, "ethereum_clients", "prysm", "prysm.sh");
} else if (platform === "win32") {
  prysmCommand = path.join(
    installDir,
    "ethereum_clients",
    "prysm",
    "prysm.exe"
  );
}

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "prysm",
  "logs",
  `prysm_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

const consensus = pty.spawn(
  prysmCommand,
  [
    "beacon-chain",
    "--mainnet",
    "--execution-endpoint",
    "http://localhost:8551",
    "--grpc-gateway-host=0.0.0.0",
    "--grpc-gateway-port=3500",
    "--checkpoint-sync-url=https://mainnet-checkpoint-sync.attestant.io/",
    "--genesis-beacon-api-url=https://mainnet-checkpoint-sync.attestant.io/",
    "--datadir",
    path.join(installDir, "ethereum_clients", "prysm", "database"),
    "--accept-terms-of-use=true",
    "--jwt-secret",
    jwtPath,
    "--monitoring-host",
    "127.0.0.1",
    "--monitoring-port",
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
  debugToFile(`From prysm.js: ${errorMessage}`, () => {});
});

process.on("SIGINT", () => {
  consensus.kill("SIGINT");
});
