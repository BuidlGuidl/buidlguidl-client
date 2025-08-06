import { execSync, spawn } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { initializeMonitoring } from "./monitor.js";
import { installMacLinuxClient } from "./ethereum_client_scripts/install.js";
import { getLatestLogFile } from "./monitor_components/helperFunctions.js";
import { initializeWebSocketConnection } from "./webSocketConnection.js";
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

// const CONFIG = {
//   debugLogPath: path.join(installDir, "ethereum_clients", "debugIndex.log"),
// };

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

// Auto-restart state tracking
let userRequestedExit = false;
let restartTimeouts = new Map(); // Track restart timeouts
let clientRestartCounts = new Map(); // Track restart attempts per client

function handleExit(exitType) {
  if (isExiting) return; // Prevent multiple calls

  // Mark that user requested exit to prevent auto-restart
  userRequestedExit = true;

  // Cancel any pending restart timers
  restartTimeouts.forEach((timeout, clientName) => {
    clearTimeout(timeout);
    restartTimeouts.delete(clientName);
  });

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
    console.error("Error reading lockfile:", error);
    process.exit(1);
  }

  isExiting = true;

  console.log(`\n\n🛰️  Received exit signal: ${exitType}\n`);

  deleteOptionsFile();
  debugToFile(`handleExit(): deleteOptionsFile() has been called`);

  try {
    // Check if both child processes have exited
    const checkExit = () => {
      if (executionExited && consensusExited) {
        console.log("\n👍 Both clients exited!");
        removeLockFile();
        process.exit(0);
      }
    };

    // Handle execution client exit
    const handleExecutionExit = (code) => {
      if (!executionExited) {
        executionExited = true;
        console.log(`🫡 Execution client exited with code ${code}`);
        checkExit();
      }
    };

    // Handle consensus client exit
    const handleConsensusExit = (code) => {
      if (!consensusExited) {
        consensusExited = true;
        console.log(`🫡 Consensus client exited with code ${code}`);
        checkExit();
      }
    };

    // Handle execution client close
    const handleExecutionClose = (code) => {
      if (!executionExited) {
        executionExited = true;
        console.log(`🫡 Execution client closed with code ${code}`);
        checkExit();
      }
    };

    // Handle consensus client close
    const handleConsensusClose = (code) => {
      if (!consensusExited) {
        consensusExited = true;
        console.log(`🫡 Consensus client closed with code ${code}`);
        checkExit();
      }
    };

    // Ensure event listeners are set before killing the processes
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

    // Send the kill signals after setting the event listeners
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

    // Initial check in case both children are already not running
    checkExit();

    // Periodically check if both child processes have exited
    const intervalId = setInterval(() => {
      checkExit();
      // Clear interval if both clients have exited
      if (executionExited && consensusExited) {
        clearInterval(intervalId);
      }
    }, 1000);
  } catch (error) {
    console.log("Error from handleExit()", error);
  }
}

// Modify existing listeners
process.on("SIGINT", () => handleExit("SIGINT"));
process.on("SIGTERM", () => handleExit("SIGTERM"));
process.on("SIGHUP", () => handleExit("SIGHUP"));
process.on("SIGUSR2", () => handleExit("SIGUSR2"));

// Modify the exit listener
process.on("exit", (code) => {
  if (!isExiting) {
    handleExit("exit");
  }
});

// This helps catch uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  handleExit("uncaughtException");
});

// This helps catch unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  handleExit("unhandledRejection");
});

let bgConsensusPeers = [];
let bgConsensusAddrs;

async function notifyMonitoringOfRestart(clientName) {
  try {
    // Give the new log file a moment to be created
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Log the restart for debugging
    debugToFile(
      `${clientName} restarted - log monitoring should automatically pick up new log file`
    );

    // The monitoring system will automatically detect the new log file since it uses getLatestLogFile()
    // which sorts by modification time. The fs.watchFile in setupLogStreaming will handle file changes.
  } catch (error) {
    debugToFile(
      `Error notifying monitoring of restart for ${clientName}: ${error}`
    );
  }
}

async function handleClientAutoRestart(clientName, exitCode) {
  // Don't restart if user requested exit
  if (userRequestedExit || isExiting) {
    return;
  }

  // Track restart attempts to prevent infinite restart loops
  const restartCount = clientRestartCounts.get(clientName) || 0;
  const maxRestarts = 5; // Maximum restarts within a time window

  if (restartCount >= maxRestarts) {
    debugToFile(
      `${clientName} has reached maximum restart attempts (${maxRestarts}). Auto-restart disabled for this client.`
    );
    return;
  }

  // Increment restart count
  clientRestartCounts.set(clientName, restartCount + 1);

  // Reset restart count after 30 minutes
  setTimeout(() => {
    clientRestartCounts.set(clientName, 0);
  }, 30 * 60 * 1000);

  debugToFile(
    `${clientName} exited with code ${exitCode}. Scheduling auto-restart in 20 seconds (attempt ${
      restartCount + 1
    }/${maxRestarts})`
  );

  // Schedule restart after 20 seconds
  const restartTimeout = setTimeout(async () => {
    try {
      restartTimeouts.delete(clientName);

      // Reset the exit flags for the client being restarted
      if (clientName === executionClient) {
        executionExited = false;
        executionChild = null;
      } else if (clientName === consensusClient) {
        consensusExited = false;
        consensusChild = null;
      }

      debugToFile(`Auto-restarting ${clientName}...`);
      await startClient(clientName, executionType, installDir);
      debugToFile(`${clientName} auto-restart completed successfully`);

      // Notify the monitoring system about the restart so it can pick up the new log file
      await notifyMonitoringOfRestart(clientName);
    } catch (error) {
      debugToFile(`Error during auto-restart of ${clientName}: ${error}`);
    }
  }, 20000); // 20 second delay

  // Track the timeout so we can cancel it if needed
  restartTimeouts.set(clientName, restartTimeout);
}

async function startClient(clientName, executionType, installDir) {
  let clientCommand,
    clientArgs = [];

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

    clientCommand = path.join(
      __dirname,
      "ethereum_client_scripts/lighthouse.js"
    );
  } else {
    clientCommand = path.join(
      installDir,
      "ethereum_clients",
      clientName,
      clientName
    );
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
    // Don't show exit message on the terminal dashboard to prevent overlay
    // Instead, log to debug file only
    debugToFile(`${clientName} process exited with code ${code}`);

    if (clientName === "geth" || clientName === "reth") {
      executionExited = true;
    } else if (clientName === "prysm" || clientName === "lighthouse") {
      consensusExited = true;
    }

    // Trigger auto-restart if conditions are met
    handleClientAutoRestart(clientName, code);
  });

  child.on("error", (err) => {
    debugToFile(`Error from start client: ${err.message}`);
  });

  debugToFile(`${clientName} started`);

  child.stdout.on("error", (err) => {
    debugToFile(`Error on stdout of ${clientName}: ${err.message}`);
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
    debugToFile("Error checking for existing process:", err);
    return false;
  }
}

function createLockFile() {
  fs.writeFileSync(lockFilePath, process.pid.toString(), "utf8");
  // console.log(process.pid.toString())
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
// } else if (platform === "win32") {
//   installWindowsExecutionClient(executionClient);
//   installWindowsConsensusClient(consensusClient);
// }

let messageForHeader = "";
let runsClient = false;

createJwtSecret(jwtDir);

const executionClientVer = getVersionNumber(executionClient);
const consensusClientVer = getVersionNumber(consensusClient);

const wsConfig = {
  executionClient: executionClient,
  consensusClient: consensusClient,
  executionClientVer: executionClientVer,
  consensusClientVer: consensusClientVer,
};

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
  // Initialize WebSocket connection for secondary instances too
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
