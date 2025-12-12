import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";

let installDir = os.homedir();
let consensusCheckpoint = null;
let bgConsensusAddrs;

const argv = minimist(process.argv.slice(2));

const consensusPeerPorts = argv.consensuspeerports
  .split(",")
  .map((port) => parseInt(port.trim(), 10));

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

if (argv.consensuscheckpoint) {
  consensusCheckpoint = argv.consensuscheckpoint;
}

if (argv.bgconsensusaddrs) {
  bgConsensusAddrs = argv.bgconsensusaddrs
    .split(",")
    .map((addr) => addr.trim());
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

const consensusArgs = [
  "beacon-chain",
  "--mainnet",
  "--p2p-udp-port",
  consensusPeerPorts[1],
  "--p2p-quic-port",
  consensusPeerPorts[0],
  "--p2p-tcp-port",
  consensusPeerPorts[0],
  "--execution-endpoint",
  "http://localhost:8551",
  "--grpc-gateway-host=0.0.0.0",
  "--grpc-gateway-port=5052",
  "--datadir",
  path.join(installDir, "ethereum_clients", "prysm", "database"),
  "--accept-terms-of-use=true",
  "--jwt-secret",
  jwtPath,
  "--monitoring-host",
  "127.0.0.1",
  "--monitoring-port",
  "5054",
  // "--peer",
  // "enr:-MK4QFKbF8xjEtSUT8mGKGHujC-NrlgX_-FPF0PuMmeZYzuePneu7Kf78RMhY0XyDOMb9mfOd7GwS_XSeC1LeCM81tyGAZIRObQZh2F0dG5ldHOIABgAAAAAAACEZXRoMpBqlaGpBQAAAP__________gmlkgnY0gmlwhAoAAEiJc2VjcDI1NmsxoQIxBPPTLz6I7hjG94FZDpSfm4UzdJPKjs2zB7OmGCs2dIhzeW5jbmV0cwCDdGNwghueg3VkcIIbOQ",
];

// Only add checkpoint-sync-url if provided by parent process
if (consensusCheckpoint) {
  consensusArgs.push(
    `--checkpoint-sync-url=${consensusCheckpoint}`,
    `--genesis-beacon-api-url=${consensusCheckpoint}`
  );
  debugToFile(`Prysm: Using checkpoint-sync-url: ${consensusCheckpoint}`);
} else {
  debugToFile(
    "Prysm: Starting without checkpoint-sync-url (database exists or not needed)"
  );
}

if (argv.bgconsensusaddrs) {
  bgConsensusAddrs.forEach((peer) => {
    debugToFile(`Prysm: Adding BG peer: ${peer}`);
    consensusArgs.push("--peer", peer);
  });
}

const consensus = pty.spawn(`${prysmCommand}`, consensusArgs, {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: { ...process.env, INSTALL_DIR: installDir },
});

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
  debugToFile(`From prysm.js: ${errorMessage}`);
});

process.on("SIGINT", () => {
  consensus.kill("SIGINT");
});
