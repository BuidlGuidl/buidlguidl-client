const { exec, execSync, spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const si = require("systeminformation");
const blessed = require("blessed");
const contrib = require("blessed-contrib");
const minimist = require("minimist");
const pty = require("node-pty");
const { createPublicClient, http } = require("viem");
const { mainnet } = require("viem/chains");
const {setupDebugLogging} = require("./helpers")
const { initializeMonitoring } = require("./monitor");
const {
  installMacLinuxConsensusClient,
  installMacLinuxExecutionClient,
  installWindowsConsensusClient,
  installWindowsExecutionClient,
} = require("./install");

// Set default command line option values
let executionClient = "geth";
let consensusClient = "prysm";
let installDir = os.homedir();
// const lockFilePath = path.join(os.homedir(), "bgnode", "script.lock");

const CONFIG = {
  debugLogPath: path.join(os.homedir(), "bgnode", "debugIndex.log"),
};

// /// just for debugging
// setupDebugLogging(CONFIG.debugLogPath);

// // Set client versions. Note: Prsym version works differently and is parsed from logs
// const gethVer = "1.14.3";
// const rethVer = "1.0.0";
// const lighthouseVer = "5.1.3";

// function showHelp() {
//   console.log("Usage: node script.js [options]");
//   console.log("");
//   console.log("Options:");
//   // console.log("  -e <client>  Specify the execution client ('geth' or 'reth')");
//   console.log("  -e <client>  Specify the execution client ('geth')");
//   // console.log(
//   //   "  -c <client>  Specify the consensus client ('prysm' or 'lighthouse')"
//   // );
//   console.log("  -c <client>  Specify the consensus client ('prysm')");
//   console.log("  -d <path>  Specify the install directory (defaults to ~)");
//   console.log("  -h           Display this help message and exit");
//   console.log("");
// }

// function isValidPath(p) {
//   try {
//     return fs.existsSync(p) && fs.statSync(p).isDirectory();
//   } catch (err) {
//     return false;
//   }
// }

// // Process command-line arguments
// const argv = minimist(process.argv.slice(2));

// if (argv.e) {
//   executionClient = argv.e;
//   if (executionClient !== "geth") {
//     console.log("Invalid option for -e. Use 'geth'.");
//     process.exit(1);
//   }
// }

// if (argv.c) {
//   consensusClient = argv.c;
//   if (consensusClient !== "prysm") {
//     console.log("Invalid option for -c. Use 'prysm'.");
//     process.exit(1);
//   }
// }

// if (argv.d) {
//   installDir = argv.d;
//   if (!isValidPath(installDir)) {
//     console.log(`Invalid option for -d. '${installDir}' is not a valid path.`);
//     process.exit(1);
//   }
// }

// if (argv.h) {
//   showHelp();
//   process.exit(0);
// }

// function debugToFile(data, callback) {
//   const filePath = path.join(installDir, "bgnode", "debug.log");
//   const now = new Date();
//   const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
//   const content =
//     typeof data === "object"
//       ? `${timestamp} - ${JSON.stringify(data, null, 2)}\n`
//       : `${timestamp} - ${data}\n`;

//   fs.writeFile(filePath, content, { flag: "a" }, (err) => {
//     if (err) {
//       console.error("Failed to write to file:", err);
//     } else {
//       if (callback) callback();
//     }
//   });
// }

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
  console.log("Received exit signal");
  try {
      // Check if both child processes have exited
    const checkExit = () => {
      if (executionExited && consensusExited) {
        console.log("Both clients exited!");
        process.exit(0);
      }
    };

    // Gracefully kill the execution client
    if (executionChild && !executionExited) {
      console.log("Exiting execution client...");
      executionChild.kill("SIGINT");
      executionChild.on("exit", (code) => {
        executionExited = true;
        console.log("Execution client exited");
        checkExit();
      });
    } else {
      executionExited = true;
    }

    // Gracefully kill the consensus client
    if (consensusChild && !consensusExited) {
      console.log("Exiting consensus client...");
      consensusChild.kill("SIGINT");
      consensusChild.on("exit", (code) => {
        consensusExited = true;
        console.log("Consensus client exited");
        checkExit();
      });
    } else {
      consensusExited = true;
    }

    // Initial check in case both children are already not running
    checkExit();
  } catch (error) {
    console.log("HUHUHUHU")
  }

  
}

// function handleExit() {
//   if (executionChild) {
//     console.log("Exit execution client...")
//     executionChild.kill("SIGINT");
//   }

//   if (consensusChild) {
//     console.log("Exit consensus client...")
//     // TODO: change back to SIGINT
//     consensusChild.kill("SIGINT");
//   }

//   // Check if both child processes have exited
//   const checkExit = () => {
//     if (executionExited && consensusExited) {
//       console.log("both clients exited")
//       process.exit(0);
//     }
//   };


//   // Listen for exit events
//   if (executionChild) {
//     executionChild.on("exit", (code) => {
//       executionExited = true;
//       console.log("Execution client exited")
//       checkExit();
//     });
//   } else {
//     executionExited = true;
//   }

//   if (consensusChild) {
//     consensusChild.on("exit", (code) => {
//       consensusExited = true;
//       console.log("Consensus client exited")
//       checkExit();
//     });
//   } else {
//     consensusExited = true;
//   }

//   // Initial check in case both children are already not running
//   checkExit();
// }

process.on("SIGINT", handleExit);
/// SIGTERM for using kill command to shut down process
process.on("SIGTERM", handleExit);

process.on("SIGUSR2", () => {
  console.log("SIGUSR2 received");
  handleExit();
});

function startClient(clientName, installDir) {
  let clientCommand, clientArgs;

  if (clientName === "geth") {
    clientCommand = path.join(__dirname, "geth.js");
    clientArgs = [];
  } else if (clientName === "reth") {
    clientCommand = path.join(__dirname, "reth.js");
    clientArgs = [];
  } else if (clientName === "prysm") {
    clientCommand = path.join(__dirname, "prysm.js");
    clientArgs = [];
  } else if (clientName === "lighthouse") {
    clientCommand = path.join(__dirname, "lighthouse.js");
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
    consensusChild = child;
  } else if (clientName === "prysm") {
    consensusChild = child;
  } else if (clientName === "lighthouse") {
    consensusChild = child;
  }

  // child.on("exit", (code) => {
  //   console.log(`${clientName} process exited with code ${code}`);
  // });

  child.on("exit", (code) => {
    console.log(`${clientName} process exited with code ${code}`);
    if (clientName === "geth") {
      executionExited = true;
    } else if (clientName === "prysm"){
      consensusExited = true;
    }
  });

  child.on("error", (err) => {
    console.log(`Error from start client: ${err.message}`);
  });
  
  console.log(clientName, "started");

  // Add error listeners to handle stream errors
  child.stdout.on("error", (err) => {
    console.error(`Error on stdout of ${clientName}: ${err.message}`);
  });
  
}

module.exports = { startClient };

// let lastStats = {
//   totalSent: 0,
//   totalReceived: 0,
//   timestamp: Date.now(),
// };

// function getNetworkStats() {
//   return new Promise((resolve, reject) => {
//     si.networkStats()
//       .then((interfaces) => {
//         let currentTotalSent = 0;
//         let currentTotalReceived = 0;

//         interfaces.forEach((iface) => {
//           currentTotalSent += iface.tx_bytes;
//           currentTotalReceived += iface.rx_bytes;
//         });

//         // Calculate time difference in seconds
//         const currentTime = Date.now();
//         const timeDiff = (currentTime - lastStats.timestamp) / 1000;

//         // Calculate bytes per second
//         const sentPerSecond =
//           (currentTotalSent - lastStats.totalSent) / timeDiff;
//         const receivedPerSecond =
//           (currentTotalReceived - lastStats.totalReceived) / timeDiff;

//         // Update last stats for next calculation
//         lastStats = {
//           totalSent: currentTotalSent,
//           totalReceived: currentTotalReceived,
//           timestamp: currentTime,
//         };

//         resolve({
//           sentPerSecond: sentPerSecond / 1000000,
//           receivedPerSecond: receivedPerSecond / 1000000,
//         });
//       })
//       .catch((error) => {
//         debugToFile(
//           `getNetworkStats() Error fetching network stats: ${error}`,
//           () => {}
//         );
//         reject(error);
//       });
//   });
// }

// getNetworkStats();

const jwtDir = path.join(installDir, "bgnode", "jwt");
const platform = os.platform();

// if (["darwin", "linux"].includes(platform)) {
//   installMacLinuxExecutionClient(executionClient, platform, gethVer, rethVer);
//   installMacLinuxConsensusClient(consensusClient, platform, lighthouseVer);
// } else if (platform === "win32") {
//   installWindowsExecutionClient(executionClient);
//   installWindowsConsensusClient(consensusClient);
// }

createJwtSecret(jwtDir);


startClient(executionClient, installDir);
startClient(consensusClient, installDir);

initializeMonitoring();