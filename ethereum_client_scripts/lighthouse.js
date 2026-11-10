import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import { selectCheckpointUrlForLighthouse } from "../checkpointHealthCheck.js";
import minimist from "minimist";

let installDir = os.homedir();
let consensusCheckpoint = null;
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
  "--http-address",
  "0.0.0.0",
  "--disable-upnp", // There is currently a bug in the p2p-lib that causes panics with this enabled
  "--disable-enr-auto-update", // This is causing a loop of ENR updates that crashes lighthouse
];

// Only add checkpoint-sync-url if provided by parent process
if (consensusCheckpoint) {
  consensusArgs.push(
    "--checkpoint-sync-url",
    consensusCheckpoint,
    "--checkpoint-sync-url-timeout",
    "1200"
  );
  debugToFile(`Lighthouse: Using checkpoint-sync-url: ${consensusCheckpoint}`);
} else {
  debugToFile(
    "Lighthouse: Starting without checkpoint-sync-url (database exists or not needed)"
  );
}

if (argv.bgconsensuspeers) {
  debugToFile(`Lighthouse: Added Trusted BG Peers: ${bgConsensusPeers}`);
  consensusArgs.push("--trusted-peers", bgConsensusPeers);
}

if (argv.bgconsensusaddrs) {
  debugToFile(`Lighthouse: Added BG Peer Addresses: ${bgConsensusAddrs}`);
  consensusArgs.push("--libp2p-addresses", bgConsensusAddrs);
}

// Lighthouse refuses to start when its database head is older than the weak
// subjectivity period (e.g. the node was offline for a few weeks). The only
// fix is to purge the chain database and checkpoint sync again, so detect that
// failure and restart once with --purge-db-force and a checkpoint sync URL.
const WEAK_SUBJECTIVITY_ERROR = /outside the weak subjectivity period/i;

let consensus;
let isShuttingDown = false;
let staleDbRecoveryAttempted = false;

function logMessage(message) {
  logStream.write(`${message}\n`);
  if (process.send) {
    process.send({ log: message });
  }
  debugToFile(`From lighthouse.js: ${message}`);
}

function startLighthouse(args) {
  let recentOutput = "";
  let staleDbDetected = false;

  consensus = pty.spawn(`${lighthouseCommand}`, args, {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: { ...process.env, INSTALL_DIR: installDir },
  });

  // Pipe stdout and stderr to the log file and to the parent process
  consensus.on("data", (data) => {
    const cleanData = stripAnsiCodes(data);
    logStream.write(cleanData);
    if (process.send) {
      process.send({ log: data }); // No need for .toString(), pty preserves colors
    }

    // pty output wraps lines and can split them across chunks, so match
    // against a small rolling window with whitespace collapsed
    recentOutput = (recentOutput + cleanData).slice(-4096);
    if (
      !staleDbDetected &&
      WEAK_SUBJECTIVITY_ERROR.test(recentOutput.replace(/\s+/g, " "))
    ) {
      staleDbDetected = true;
    }
  });

  consensus.on("exit", (code) => {
    if (staleDbDetected && !staleDbRecoveryAttempted && !isShuttingDown) {
      staleDbRecoveryAttempted = true;
      recoverFromStaleDatabase().catch((err) => {
        logMessage(`Stale database recovery failed: ${err.message}`);
        logStream.end();
        process.exit(1);
      });
      return;
    }

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
}

async function recoverFromStaleDatabase() {
  logMessage(
    "\n⚠️  Lighthouse database is outside the weak subjectivity period (node was offline too long)."
  );
  logMessage(
    "   Purging the beacon chain database and re-syncing from a checkpoint..."
  );

  const checkpointUrl = await selectCheckpointUrlForLighthouse(
    installDir,
    consensusCheckpoint,
    { ignoreExistingDb: true }
  );

  if (isShuttingDown) {
    logStream.end();
    return;
  }

  logMessage(`   Using checkpoint sync URL: ${checkpointUrl}\n`);

  // Drop any checkpoint args from the original run and use the selected URL
  const recoveryArgs = [];
  for (let i = 0; i < consensusArgs.length; i++) {
    if (
      consensusArgs[i] === "--checkpoint-sync-url" ||
      consensusArgs[i] === "--checkpoint-sync-url-timeout"
    ) {
      i++; // skip the flag's value too
      continue;
    }
    recoveryArgs.push(consensusArgs[i]);
  }
  recoveryArgs.push(
    "--purge-db-force",
    "--checkpoint-sync-url",
    checkpointUrl,
    "--checkpoint-sync-url-timeout",
    "1200"
  );

  startLighthouse(recoveryArgs);
}

startLighthouse(consensusArgs);

process.on("SIGINT", () => {
  isShuttingDown = true;
  consensus.kill("SIGINT");
});
