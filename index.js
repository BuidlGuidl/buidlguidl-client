import { exec, execSync, spawn } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
// import { setupDebugLogging } from "./helpers";
import { initializeMonitoring } from "./monitor.js";
import {
  installMacLinuxConsensusClient,
  installMacLinuxExecutionClient,
  installWindowsConsensusClient,
  installWindowsExecutionClient,
} from "./node_clients/install.js";
import { initializeWSConnection } from "./ws_connection/wsConnection.js";
import minimist from "minimist";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/// Set default command line option values
let executionClient = "reth";
let consensusClient = "lighthouse";
let installDir = os.homedir();

const gethVer = "1.14.3";
const rethVer = "1.0.0";
const prysmVer = "5.0.3";
const lighthouseVer = "5.2.1";

function showHelp() {
  console.log("");
  console.log("Options:");
  console.log("  -e <client>  Specify the execution client ('reth' or 'geth')");
  console.log(
    "  -c <client>  Specify the consensus client ('lighthouse or 'prysm')"
  );
  // console.log("  -d <path>    Specify the install directory (defaults to ~)");
  console.log("  -h           Display this help message and exit");
  console.log("");
}

function isValidPath(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch (err) {
    return false;
  }
}

// Process command-line arguments
const argv = minimist(process.argv.slice(2));

if (argv.e) {
  executionClient = argv.e;
  if (executionClient !== "geth" && executionClient !== "reth") {
    console.log("Invalid option for -e. Use 'geth' or 'reth'.");
    process.exit(1);
  }
}

if (argv.c) {
  consensusClient = argv.c;
  if (consensusClient !== "prysm" && consensusClient !== "lighthouse") {
    console.log("Invalid option for -c. Use 'prysm' or 'lighthouse'.");
    process.exit(1);
  }
}

// if (argv.d) {
//   installDir = argv.d;
//   if (!isValidPath(installDir)) {
//     console.log(`Invalid option for -d. '${installDir}' is not a valid path.`);
//     process.exit(1);
//   }
// }

if (argv.h) {
  showHelp();
  process.exit(0);
}

const lockFilePath = path.join(os.homedir(), "bgnode", "script.lock");

const CONFIG = {
  debugLogPath: path.join(os.homedir(), "bgnode", "debugIndex.log"),
};

// /// just for debugging
// setupDebugLogging(CONFIG.debugLogPath);

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

// function handleExit() {
//   console.log("Received exit signal");
//   try {
//     // Check if both child processes have exited
//     const checkExit = () => {
//       if (executionExited && consensusExited) {
//         console.log("Both clients exited!");
//         removeLockFile();
//         process.exit(0);
//       }
//     };

//     // Gracefully kill the execution client
//     if (executionChild && !executionExited) {
//       console.log("Exiting execution client...");
//       executionChild.kill("SIGINT");
//       executionChild.on("exit", (code) => {
//         executionExited = true;
//         console.log("Execution client exited");
//         checkExit();
//       });
//     } else {
//       executionExited = true;
//     }

//     // Gracefully kill the consensus client
//     if (consensusChild && !consensusExited) {
//       console.log("Exiting consensus client...");
//       consensusChild.kill("SIGINT");
//       consensusChild.on("exit", (code) => {
//         consensusExited = true;
//         console.log("Consensus client exited");
//         checkExit();
//       });
//     } else {
//       consensusExited = true;
//     }

//     // Initial check in case both children are already not running
//     checkExit();
//   } catch (error) {
//     console.log("Error form handle exit", error);
//   }
// }

function handleExit() {
  console.log("Received exit signal");
  try {
    // Check if both child processes have exited
    const checkExit = () => {
      if (executionExited && consensusExited) {
        console.log("Both clients exited!");
        removeLockFile();
        process.exit(0);
      }
    };

    // Handle execution client exit
    const handleExecutionExit = (code) => {
      if (!executionExited) {
        executionExited = true;
        console.log(`Execution client exited with code ${code}`);
        checkExit();
      }
    };

    // Handle consensus client exit
    const handleConsensusExit = (code) => {
      if (!consensusExited) {
        consensusExited = true;
        console.log(`Consensus client exited with code ${code}`);
        checkExit();
      }
    };

    // Handle execution client close
    const handleExecutionClose = (code) => {
      if (!executionExited) {
        executionExited = true;
        console.log(`Execution client closed with code ${code}`);
        checkExit();
      }
    };

    // Handle consensus client close
    const handleConsensusClose = (code) => {
      if (!consensusExited) {
        consensusExited = true;
        console.log(`Consensus client closed with code ${code}`);
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
      console.log("Exiting execution client...");
      setTimeout(() => {
        executionChild.kill("SIGINT");
      }, 750);
    }

    if (consensusChild && !consensusExited) {
      console.log("Exiting consensus client...");
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
  // console.log("SIGUSR2 received");
  handleExit();
});

function startClient(clientName, installDir) {
  let clientCommand, clientArgs;

  if (clientName === "geth") {
    clientCommand = path.join(__dirname, "node_clients/geth.js");
    clientArgs = [];
  } else if (clientName === "reth") {
    clientCommand = path.join(__dirname, "node_clients/reth.js");
    clientArgs = [];
  } else if (clientName === "prysm") {
    clientCommand = path.join(__dirname, "node_clients/prysm.js");
    clientArgs = [];
  } else if (clientName === "lighthouse") {
    clientCommand = path.join(__dirname, "node_clients/lighthouse.js");
    clientArgs = [];
  } else {
    clientCommand = path.join(installDir, "bgnode", clientName, clientName);
    clientArgs = [];
  }

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
    console.log(`${clientName} process exited with code ${code}`);
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

const jwtDir = path.join(installDir, "bgnode", "jwt");
const platform = os.platform();

if (["darwin", "linux"].includes(platform)) {
  installMacLinuxExecutionClient(executionClient, platform, gethVer, rethVer);
  installMacLinuxConsensusClient(
    consensusClient,
    platform,
    // prysmVer,
    lighthouseVer
  );
} else if (platform === "win32") {
  installWindowsExecutionClient(executionClient);
  installWindowsConsensusClient(consensusClient);
}

let messageForHeader = "";
let runsClient = false;

createJwtSecret(jwtDir);

const wsConfig = {
  executionClient: executionClient,
  consensusClient: consensusClient,
  gethVer: gethVer,
  rethVer: rethVer,
  prysmVer: prysmVer,
  lighthouseVer: lighthouseVer,
};

if (!isAlreadyRunning()) {
  startClient(executionClient, installDir);
  startClient(consensusClient, installDir);

  initializeWSConnection(wsConfig);

  messageForHeader = "Node execution";
  runsClient = true;
  createLockFile();
} else {
  console.log("Node already started. Initializing monitoring only.");
  messageForHeader = "Only dashboard, client already running";
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

export { executionClient };
