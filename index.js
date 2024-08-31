import { execSync, spawn } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { initializeMonitoring } from "./monitor.js";
import {
  installMacLinuxConsensusClient,
  installMacLinuxExecutionClient,
  installWindowsConsensusClient,
  installWindowsExecutionClient,
} from "./ethereum_client_scripts/install.js";
import { initializeHttpConnection } from "./https_connection/httpsConnection.js";
import {
  executionClient,
  consensusClient,
  executionPeerPort,
  consensusPeerPorts,
  installDir,
  saveOptionsToFile,
  deleteOptionsFile,
} from "./commandLineOptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const gethVer = "1.14.3";
const rethVer = "1.0.0";
const prysmVer = "5.1.0";
const lighthouseVer = "5.2.0";

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

function handleExit() {
  console.log("\n\n🛰️  Received exit signal\n");

  deleteOptionsFile();

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

process.on("SIGINT", handleExit);
/// SIGTERM for using kill command to shut down process
process.on("SIGTERM", handleExit);

process.on("SIGUSR2", () => {
  handleExit();
});

function startClient(clientName, installDir) {
  let clientCommand,
    clientArgs = [];

  if (clientName === "geth") {
    clientCommand = path.join(__dirname, "ethereum_client_scripts/geth.js");

    if (executionPeerPort != null) {
      clientArgs.push("--executionpeerport", executionPeerPort);
    }
  } else if (clientName === "reth") {
    clientCommand = path.join(__dirname, "ethereum_client_scripts/reth.js");

    if (executionPeerPort != null) {
      clientArgs.push("--executionpeerport", executionPeerPort);
    }
  } else if (clientName === "prysm") {
    clientCommand = path.join(__dirname, "ethereum_client_scripts/prysm.js");

    if (consensusPeerPorts[0] !== null || consensusPeerPorts[1] !== null) {
      clientArgs.push("--consensuspeerports", consensusPeerPorts);
    }
  } else if (clientName === "lighthouse") {
    clientCommand = path.join(
      __dirname,
      "ethereum_client_scripts/lighthouse.js"
    );

    if (consensusPeerPorts[0] !== null || consensusPeerPorts[1] !== null) {
      clientArgs.push("--consensuspeerports", consensusPeerPorts);
    }
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

  if (clientName === "geth") {
    executionChild = child;
  } else if (clientName === "reth") {
    executionChild = child;
  } else if (clientName === "prysm") {
    consensusChild = child;
  } else if (clientName === "lighthouse") {
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
  installMacLinuxExecutionClient(executionClient, platform, gethVer, rethVer);
  installMacLinuxConsensusClient(consensusClient, platform, lighthouseVer);
} else if (platform === "win32") {
  installWindowsExecutionClient(executionClient);
  installWindowsConsensusClient(consensusClient);
}

let messageForHeader = "";
let runsClient = false;

createJwtSecret(jwtDir);

const httpConfig = {
  executionClient: executionClient,
  consensusClient: consensusClient,
  gethVer: gethVer,
  rethVer: rethVer,
  prysmVer: prysmVer,
  lighthouseVer: lighthouseVer,
};

if (!isAlreadyRunning()) {
  deleteOptionsFile();

  startClient(executionClient, installDir);
  startClient(consensusClient, installDir);

  initializeHttpConnection(httpConfig);

  runsClient = true;
  createLockFile();
  saveOptionsToFile();
} else {
  messageForHeader = "Dashboard View (client already running)";
  runsClient = false;
}

initializeMonitoring(
  messageForHeader,
  executionClient,
  consensusClient,
  gethVer,
  rethVer,
  prysmVer,
  lighthouseVer,
  runsClient
);
