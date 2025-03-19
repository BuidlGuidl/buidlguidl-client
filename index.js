import { execSync, spawn } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { initializeMonitoring } from "./monitor.js";
import { installMacLinuxClient } from "./ethereum_client_scripts/install.js";
import { initializeWebSocketConnection } from "./web_socket_connection/webSocketConnection.js";
import {
  executionClient,
  executionType,
  consensusClient,
  executionPeerPort,
  consensusPeerPorts,
  consensusCheckpoint,
  installDir,
  owner,
  saveOptionsToFile,
  deleteOptionsFile,
} from "./commandLineOptions.js";
import {
  fetchBGExecutionPeers,
  configureBGExecutionPeers,
  fetchBGConsensusPeers,
  configureBGConsensusPeers,
} from "./ethereum_client_scripts/configureBGPeers.js";
import { getVersionNumber } from "./ethereum_client_scripts/install.js";
import { debugToFile } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const lockFilePath = path.join(installDir, "ethereum_clients", "script.lock");

function createJwtSecret(jwtDir) {
  if (!fs.existsSync(jwtDir)) {
    console.log(`\nCreating '${jwtDir}'`);
    fs.mkdirSync(jwtDir, { recursive: true });
  }

  if (!fs.existsSync(`${jwtDir}/jwt.hex`)) {
    console.log("Generating JWT.hex file.");
    execSync(`cd "${jwtDir}" && openssl rand -hex 32 > jwt.hex`, {
      stdio: "inherit",
    });
  }
}

let executionChild;
let consensusChild;
let executionExited = false;
let consensusExited = false;
let isExiting = false;

function handleExit(exitType) {
  if (isExiting) return; // Prevent multiple calls

  // Check if the current process PID matches the one in the lockfile
  try {
    const lockFilePid = fs.readFileSync(lockFilePath, "utf8");
    if (parseInt(lockFilePid) !== process.pid) {
      console.log(
        `This client process (${process.pid}) is not the first instance launched. Closing dashboard view without killing clients.`
      );
      process.exit(0);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn("Lockfile not found; continuing exit handling.");
    } else {
      console.error("Error reading lockfile:", error);
      process.exit(1);
    }
  }

  isExiting = true;
  console.log(`\n\n🛰️  Received exit signal: ${exitType}\n`);

  deleteOptionsFile();
  debugToFile(`handleExit(): deleteOptionsFile() has been called`);

  try {
    const checkExit = () => {
      if (executionExited && consensusExited) {
        console.log("\n👍 Both clients exited!");
        removeLockFile();
        process.exit(0);
      }
    };

    const handleExecutionExit = (code) => {
      if (!executionExited) {
        executionExited = true;
        console.log(`🫡 Execution client exited with code ${code}`);
        checkExit();
      }
    };

    const handleConsensusExit = (code) => {
      if (!consensusExited) {
        consensusExited = true;
        console.log(`🫡 Consensus client exited with code ${code}`);
        checkExit();
      }
    };

    const handleExecutionClose = (code) => {
      if (!executionExited) {
        executionExited = true;
        console.log(`🫡 Execution client closed with code ${code}`);
        checkExit();
      }
    };

    const handleConsensusClose = (code) => {
      if (!consensusExited) {
        consensusExited = true;
        console.log(`🫡 Consensus client closed with code ${code}`);
        checkExit();
      }
    };

    if (executionChild && !executionExited) {
      executionChild.on("exit", handleExecutionExit);
      executionChild.on("close", handleExecutionClose);
    } else {
      executionExited = true;
    }

    if (consensusChild && !consensusExited) {
      consensusChild.on("exit", handleConsensusExit);
      consensusChild.on("close", handleConsensusClose);
    } else {
      consensusExited = true;
    }

    if (executionChild && !executionExited) {
      console.log("⌛️ Exiting execution client...");
      setTimeout(() => {
        executionChild.kill("SIGINT");
      }, 750);
    }

    if (consensusChild && !consensusExited) {
      console.log("⌛️ Exiting consensus client...");
      setTimeout(() => {
        consensusChild.kill("SIGINT");
      }, 750);
    }

    checkExit();

    const intervalId = setInterval(() => {
      checkExit();
      if (executionExited && consensusExited) {
        clearInterval(intervalId);
      }
    }, 1000);
  } catch (error) {
    console.log("Error from handleExit()", error);
  }
}

process.on("SIGINT", () => handleExit("SIGINT"));
process.on("SIGTERM", () => handleExit("SIGTERM"));
process.on("SIGHUP", () => handleExit("SIGHUP"));
process.on("SIGUSR2", () => handleExit("SIGUSR2"));
process.on("exit", (code) => {
  if (!isExiting) {
    handleExit("exit");
  }
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  handleExit("uncaughtException");
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  handleExit("unhandledRejection");
});

let bgConsensusPeers = [];
let bgConsensusAddrs;

async function startClient(clientName, executionType, installDir) {
  let clientCommand, clientArgs = [];

  if (clientName === "geth") {
    clientArgs.push("--executionpeerport", executionPeerPort);
    clientArgs.push("--executiontype", executionType);
    clientCommand = path.join(__dirname, "ethereum_client_scripts/geth.js");
  } else if (clientName === "reth") {
    clientArgs.push("--executionpeerport", executionPeerPort);
    clientArgs.push("--executiontype", executionType);
    clientCommand = path.join(__dirname, "ethereum_client_scripts/reth.js");
  } else if (clientName === "prysm") {
    bgConsensusPeers = await fetchBGConsensusPeers();
    bgConsensusAddrs = await configureBGConsensusPeers(consensusClient);
    if (bgConsensusPeers.length > 0) {
      clientArgs.push("--bgconsensuspeers", bgConsensusPeers);
    }
    if (bgConsensusAddrs != null) {
      clientArgs.push("--bgconsensusaddrs", bgConsensusAddrs);
    }
    if (consensusCheckpoint != null) {
      clientArgs.push("--consensuscheckpoint", consensusCheckpoint);
    }
    clientArgs.push("--consensuspeerports", consensusPeerPorts);
    clientCommand = path.join(__dirname, "ethereum_client_scripts/prysm.js");
  } else if (clientName === "lighthouse") {
    bgConsensusPeers = await fetchBGConsensusPeers();
    bgConsensusAddrs = await configureBGConsensusPeers(consensusClient);
    if (bgConsensusPeers.length > 0) {
      clientArgs.push("--bgconsensuspeers", bgConsensusPeers);
    }
    if (bgConsensusAddrs != null) {
      clientArgs.push("--bgconsensusaddrs", bgConsensusAddrs);
    }
    if (consensusCheckpoint != null) {
      clientArgs.push("--consensuscheckpoint", consensusCheckpoint);
    }
    clientArgs.push("--consensuspeerports", consensusPeerPorts);
    clientCommand = path.join(__dirname, "ethereum_client_scripts/lighthouse.js");
  } else {
    clientCommand = path.join(installDir, "ethereum_clients", clientName, clientName);
  }

  clientArgs.push("--directory", installDir);

  const child = spawn("node", [clientCommand, ...clientArgs], {
    stdio: ["inherit", "pipe", "inherit"],
    cwd: process.env.HOME,
    env: { ...process.env, INSTALL_DIR: installDir },
  });

  if (clientName === "geth" || clientName === "reth") {
    executionChild = child;
  } else if (clientName === "prysm" || clientName === "lighthouse") {
    consensusChild = child;
  }

  child.on("exit", (code) => {
    console.log(`🫡 ${clientName} process exited with code ${code}`);
    if (clientName === "geth" || clientName === "reth") {
      executionExited = true;
    } else if (clientName === "prysm" || clientName === "lighthouse") {
      consensusExited = true;
    }
  });

  child.on("error", (err) => {
    console.log(`Error from start client: ${err.message}`);
  });

  console.log(clientName, "started");

  child.stdout.on("error", (err) => {
    console.error(`Error on stdout of ${clientName}: ${err.message}`);
  });
}

function isAlreadyRunning() {
  try {
    if (fs.existsSync(lockFilePath)) {
      const pid = fs.readFileSync(lockFilePath, "utf8");
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        if (e.code === "ESRCH") {
          fs.unlinkSync(lockFilePath);
          return false;
        }
        throw e;
      }
    }
    return false;
  } catch (err) {
    console.error("Error checking for existing process:", err);
    return false;
  }
}

function createLockFile() {
  fs.writeFileSync(lockFilePath, process.pid.toString(), "utf8");
}

function removeLockFile() {
  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);
  }
}

const jwtDir = path.join(installDir, "ethereum_clients", "jwt");
const platform = os.platform();

if (["darwin", "linux"].includes(platform)) {
  installMacLinuxClient(executionClient, platform);
  installMacLinuxClient(consensusClient, platform);
}

createJwtSecret(jwtDir);

const executionClientVer = getVersionNumber(executionClient);
const consensusClientVer = getVersionNumber(consensusClient);

const wsConfig = {
  executionClient: executionClient,
  consensusClient: consensusClient,
  executionClientVer: executionClientVer,
  consensusClientVer: consensusClientVer,
};

let messageForHeader = "";
let runsClient = false;

if (!isAlreadyRunning()) {
  deleteOptionsFile();
  createLockFile();

  await startClient(executionClient, executionType, installDir);
  await startClient(consensusClient, executionType, installDir);

  if (owner !== null) {
    initializeWebSocketConnection(wsConfig);
  }
  runsClient = true;
  saveOptionsToFile();
} else {
  messageForHeader = "Dashboard View (client already running)";
  runsClient = false;
  if (owner !== null) {
    initializeWebSocketConnection(wsConfig);
  }
}

initializeMonitoring(
  messageForHeader,
  executionClient,
  consensusClient,
  executionClientVer,
  consensusClientVer,
  runsClient
);

let bgExecutionPeers = [];

setTimeout(async () => {
  bgExecutionPeers = await fetchBGExecutionPeers();
  await configureBGExecutionPeers(bgExecutionPeers);
}, 10000);

export { bgExecutionPeers, bgConsensusPeers };
