import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";

let installDir = os.homedir();
let consensusCheckpoint = "https://mainnet-checkpoint-sync.stakely.io/";
let bgConsensusPeers;
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

if (argv.bgconsensuspeers) {
  bgConsensusPeers = argv.bgconsensuspeers
    .split(",")
    .map((peer) => peer.trim())
    .filter((peer) => peer) // Filter out any empty strings
    .join(",");
}

if (argv.bgconsensusaddrs) {
  bgConsensusAddrs = argv.bgconsensusaddrs;
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

const consensusArgs = [
  "bn",
  "--network",
  "mainnet",
  "--port",
  consensusPeerPorts[0],
  "--quic-port",
  consensusPeerPorts[1],
  "--execution-endpoint",
  "http://localhost:8551",
  "--checkpoint-sync-url",
  consensusCheckpoint,
  "--checkpoint-sync-url-timeout",
  "1200",
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
  "--http",
  "--disable-upnp", // There is currently a bug in the p2p-lib that causes panics with this enabled
  "--disable-enr-auto-update", // This is causing a loop of ENR updates that crashes lighthouse
  // "--libp2p-addresses",
  // "/ip4/76.155.211.156/tcp/26617/p2p/16Uiu2HAkw5RWctJguL1CPRyvgwuF4GsqTKUBW7qXdNrX3t6k4CH9,/ip4/76.155.211.156/udp/26617/quic-v1/p2p/16Uiu2HAkw5RWctJguL1CPRyvgwuF4GsqTKUBW7qXdNrX3t6k4CH9,/ip4/76.155.211.156/tcp/10000/p2p/16Uiu2HAmT4mjLEPrwStrRvorexA3rH9FLJLS367N1KJYUCPWTSio,/ip4/76.155.211.156/udp/10000/quic-v1/p2p/16Uiu2HAmT4mjLEPrwStrRvorexA3rH9FLJLS367N1KJYUCPWTSio",
  // "/ip4/76.155.211.156/tcp/9000/p2p/16Uiu2HAkw5RWctJguL1CPRyvgwuF4GsqTKUBW7qXdNrX3t6k4CH9,/ip4/76.155.211.156/udp/9001/quic-v1/p2p/16Uiu2HAkw5RWctJguL1CPRyvgwuF4GsqTKUBW7qXdNrX3t6k4CH9,/ip4/76.155.211.156/tcp/10000/p2p/16Uiu2HAmT4mjLEPrwStrRvorexA3rH9FLJLS367N1KJYUCPWTSio,/ip4/76.155.211.156/udp/10001/quic-v1/p2p/16Uiu2HAmT4mjLEPrwStrRvorexA3rH9FLJLS367N1KJYUCPWTSio,/ip4/140.228.255.200/tcp/9000/p2p/16Uiu2HAmUxRVA7mHdJdt8QeauaiFU9ifHUuqANs6BAPcU3nWbyAu,/ip4/140.228.255.200/udp/9001/quic-v1/p2p/16Uiu2HAmUxRVA7mHdJdt8QeauaiFU9ifHUuqANs6BAPcU3nWbyAu",
];

if (argv.bgconsensuspeers) {
  debugToFile(`Lighthouse: Added Trusted BG Peers: ${bgConsensusPeers}`);
  consensusArgs.push("--trusted-peers", bgConsensusPeers);
}

if (argv.bgconsensusaddrs) {
  debugToFile(`Lighthouse: Added BG Peer Addresses: ${bgConsensusAddrs}`);
  consensusArgs.push("--libp2p-addresses", bgConsensusAddrs);
}

const consensus = pty.spawn(`${lighthouseCommand}`, consensusArgs, {
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
  debugToFile(`From lighthouse.js: ${errorMessage}`);
});

process.on("SIGINT", () => {
  consensus.kill("SIGINT");
});
