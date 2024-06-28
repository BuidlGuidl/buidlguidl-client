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
const { initializeMonitoring } = require("./monitor");

// Set default command line option values
let executionClient = "geth";
let consensusClient = "prysm";
let installDir = os.homedir();

// Set client versions. Note: Prsym version works differently and is parsed from logs
const gethVer = "1.14.3";
const rethVer = "1.0.0";
const lighthouseVer = "5.1.3";

function showHelp() {
  console.log("Usage: node script.js [options]");
  console.log("");
  console.log("Options:");
  // console.log("  -e <client>  Specify the execution client ('geth' or 'reth')");
  console.log("  -e <client>  Specify the execution client ('geth')");
  // console.log(
  //   "  -c <client>  Specify the consensus client ('prysm' or 'lighthouse')"
  // );
  console.log("  -c <client>  Specify the consensus client ('prysm')");
  console.log("  -d <path>  Specify the install directory (defaults to ~)");
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
  if (executionClient !== "geth") {
    console.log("Invalid option for -e. Use 'geth'.");
    process.exit(1);
  }
}

if (argv.c) {
  consensusClient = argv.c;
  if (consensusClient !== "prysm") {
    console.log("Invalid option for -c. Use 'prysm'.");
    process.exit(1);
  }
}

if (argv.d) {
  installDir = argv.d;
  if (!isValidPath(installDir)) {
    console.log(`Invalid option for -d. '${installDir}' is not a valid path.`);
    process.exit(1);
  }
}

if (argv.h) {
  showHelp();
  process.exit(0);
}

function debugToFile(data, callback) {
  const filePath = path.join(installDir, "bgnode", "debug.log");
  const now = new Date();
  const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  const content =
    typeof data === "object"
      ? `${timestamp} - ${JSON.stringify(data, null, 2)}\n`
      : `${timestamp} - ${data}\n`;

  fs.writeFile(filePath, content, { flag: "a" }, (err) => {
    if (err) {
      console.error("Failed to write to file:", err);
    } else {
      if (callback) callback();
    }
  });
}

function getFormattedDateTime() {
  const now = new Date();

  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const hour = now.getHours().toString().padStart(2, "0");
  const minute = now.getMinutes().toString().padStart(2, "0");
  const second = now.getSeconds().toString().padStart(2, "0");

  return `${year}_${month}_${day}_${hour}_${minute}_${second}`;
}

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

function downloadRethSnapshot(rethDir, platform) {
  const snapshotDate = "2024-05-14";

  if (
    !fs.existsSync(
      path.join(installDir, "bgnode", "reth", "database", "db", "mdbx.dat")
    ) ||
    !fs.existsSync(
      path.join(installDir, "bgnode", "reth", "database", "blobstore")
    )
  ) {
    console.log("\nDownloading Reth snapshot.");
    if (platform === "darwin") {
      execSync(
        `cd "${rethDir}/database" && wget -O - https://downloads.merkle.io/reth-${snapshotDate}.tar.lz4 | lz4 -dc | tar -xvf -`,
        { stdio: "inherit" }
      );
    } else if (platform === "linux") {
      execSync(
        `cd "${rethDir}/database" && wget -O - https://downloads.merkle.io/reth-${snapshotDate}.tar.lz4 | tar -I lz4 -xvf -`,
        { stdio: "inherit" }
      );
    } else if (platform === "win32") {
      // TODO: Add code for downloading snapshot on windows
    }
  } else {
    console.log("\nReth snapshot already downloaded.");
  }
}

function installMacLinuxExecutionClient(
  executionClient,
  platform,
  gethVer,
  rethVer
) {
  const arch = os.arch();

  const configs = {
    darwin: {
      x64: {
        gethFileName: `geth-darwin-amd64-${gethVer}-ab48ba42`,
        rethFileName: `reth-v${rethVer}-rc.2-x86_64-apple-darwin`,
      },
      arm64: {
        gethFileName: `geth-darwin-arm64-${gethVer}-ab48ba42`,
        rethFileName: `reth-v${rethVer}-rc.2-aarch64-apple-darwin`,
      },
    },
    linux: {
      x64: {
        gethFileName: `geth-linux-amd64-${gethVer}-ab48ba42`,
        rethFileName: `reth-v${rethVer}-rc.2-x86_64-unknown-linux-gnu`,
      },
      arm64: {
        gethFileName: `geth-linux-arm64-${gethVer}-ab48ba42`,
        rethFileName: `reth-v${rethVer}-rc.2-aarch64-unknown-linux-gnu`,
      },
    },
  };

  const { gethFileName, rethFileName } = configs[platform][arch];

  if (executionClient === "geth") {
    const gethDir = path.join(installDir, "bgnode", "geth");
    const gethScript = path.join(gethDir, "geth");
    if (!fs.existsSync(gethScript)) {
      console.log("\nInstalling Geth.");
      if (!fs.existsSync(gethDir)) {
        console.log(`Creating '${gethDir}'`);
        fs.mkdirSync(`${gethDir}/database`, { recursive: true });
        fs.mkdirSync(`${gethDir}/logs`, { recursive: true });
      }
      console.log("Downloading Geth.");
      execSync(
        `cd "${gethDir}" && curl -L -O -# https://gethstore.blob.core.windows.net/builds/${gethFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Geth.");
      execSync(`cd "${gethDir}" && tar -xzvf "${gethFileName}.tar.gz"`, {
        stdio: "inherit",
      });
      execSync(`cd "${gethDir}/${gethFileName}" && mv geth ..`, {
        stdio: "inherit",
      });
      console.log("Cleaning up Geth directory.");
      execSync(
        `cd "${gethDir}" && rm -r "${gethFileName}" && rm "${gethFileName}.tar.gz"`,
        { stdio: "inherit" }
      );
    } else {
      console.log("Geth is already installed.");
    }
  } else if (executionClient === "reth") {
    const rethDir = path.join(installDir, "bgnode", "reth");
    const rethScript = path.join(rethDir, "reth");
    if (!fs.existsSync(rethScript)) {
      console.log("\nInstalling Reth.");
      if (!fs.existsSync(rethDir)) {
        console.log(`Creating '${rethDir}'`);
        fs.mkdirSync(`${rethDir}/database`, { recursive: true });
        fs.mkdirSync(`${rethDir}/logs`, { recursive: true });
      }
      console.log("Downloading Reth.");
      execSync(
        `cd "${rethDir}" && curl -L -O -# https://github.com/paradigmxyz/reth/releases/download/v${rethVer}-rc.2/${rethFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Reth.");
      execSync(`cd "${rethDir}" && tar -xzvf "${rethFileName}.tar.gz"`, {
        stdio: "inherit",
      });
      console.log("Cleaning up Reth directory.");
      execSync(`cd "${rethDir}" && rm "${rethFileName}.tar.gz"`, {
        stdio: "inherit",
      });

      // downloadRethSnapshot(rethDir, platform);
    } else {
      console.log("Reth is already installed.");
    }
  }
}

function installMacLinuxConsensusClient(
  consensusClient,
  platform,
  lighthouseVer
) {
  const arch = os.arch();

  const configs = {
    darwin: {
      x64: {
        lighthouseFileName: `lighthouse-v${lighthouseVer}-x86_64-apple-darwin`,
      },
      arm64: {
        lighthouseFileName: `lighthouse-v${lighthouseVer}-x86_64-apple-darwin-portable`,
      },
    },
    linux: {
      x64: {
        lighthouseFileName: `lighthouse-v${lighthouseVer}-x86_64-unknown-linux-gnu`,
      },
      arm64: {
        lighthouseFileName: `lighthouse-v${lighthouseVer}-aarch64-unknown-linux-gnu`,
      },
    },
  };

  const prysmFileName = "prysm";
  const { lighthouseFileName } = configs[platform][arch];

  if (consensusClient === "prysm") {
    const prysmDir = path.join(installDir, "bgnode", "prysm");
    const prysmScript = path.join(prysmDir, "prysm.sh");
    if (!fs.existsSync(prysmScript)) {
      console.log("\nInstalling Prysm.");
      if (!fs.existsSync(prysmDir)) {
        console.log(`Creating '${prysmDir}'`);
        fs.mkdirSync(`${prysmDir}/database`, { recursive: true });
        fs.mkdirSync(`${prysmDir}/logs`, { recursive: true });
      }
      console.log("Downloading Prysm.");
      execSync(
        `cd "${prysmDir}" && curl -L -O -# https://raw.githubusercontent.com/prysmaticlabs/prysm/master/${prysmFileName}.sh && chmod +x prysm.sh`,
        { stdio: "inherit" }
      );
    } else {
      console.log("Prysm is already installed.");
    }
  } else if (consensusClient === "lighthouse") {
    const lighthouseDir = path.join(installDir, "bgnode", "lighthouse");
    const lighthouseScript = path.join(lighthouseDir, "lighthouse");
    if (!fs.existsSync(lighthouseScript)) {
      console.log("\nInstalling Lighthouse.");
      if (!fs.existsSync(lighthouseDir)) {
        console.log(`Creating '${lighthouseDir}'`);
        fs.mkdirSync(`${lighthouseDir}/database`, { recursive: true });
        fs.mkdirSync(`${lighthouseDir}/logs`, { recursive: true });
      }
      console.log("Downloading Lighthouse.");
      execSync(
        `cd "${lighthouseDir}" && curl -L -O -# https://github.com/sigp/lighthouse/releases/download/v${lighthouseVer}/${lighthouseFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Lighthouse.");
      execSync(
        `cd "${lighthouseDir}" && tar -xzvf ${lighthouseFileName}.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      console.log("Cleaning up Lighthouse directory.");
      execSync(`cd "${lighthouseDir}" && rm ${lighthouseFileName}.tar.gz`, {
        stdio: "inherit",
      });
    } else {
      console.log("Lighthouse is already installed.");
    }
  }
}

function installWindowsExecutionClient(executionClient) {
  if (executionClient === "geth") {
    const gethDir = path.join(installDir, "bgnode", "geth");
    const gethScript = path.join(gethDir, "geth.exe");
    if (!fs.existsSync(gethScript)) {
      console.log("\nInstalling Geth.");
      if (!fs.existsSync(gethDir)) {
        console.log(`Creating '${gethDir}'`);
        fs.mkdirSync(`${gethDir}/database`, { recursive: true });
        fs.mkdirSync(`${gethDir}/logs`, { recursive: true });
      }
      execSync(
        `cd "${gethDir}" && curl https://gethstore.blob.core.windows.net/builds/geth-windows-amd64-1.14.3-ab48ba42.zip --output geth.zip`,
        { stdio: "inherit" }
      );
      execSync(`cd "${gethDir}" && tar -xf geth.zip`, {
        stdio: "inherit",
      });
      execSync(
        `cd "${gethDir}/geth-windows-amd64-1.14.3-ab48ba42" && move geth.exe ..`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd "${gethDir}" && del geth.zip && rd /S /Q geth-windows-amd64-1.14.3-ab48ba42`,
        { stdio: "inherit" }
      );
    } else {
      console.log("Geth is already installed.");
    }
  } else if (executionClient === "reth") {
    const rethDir = path.join(installDir, "bgnode", "reth");
    const rethScript = path.join(rethDir, "reth.exe");
    if (!fs.existsSync(rethScript)) {
      console.log("\nInstalling Reth.");
      if (!fs.existsSync(rethDir)) {
        console.log(`Creating '${rethDir}'`);
        fs.mkdirSync(`${rethDir}/database`, { recursive: true });
        fs.mkdirSync(`${rethDir}/logs`, { recursive: true });
      }
      execSync(
        `cd "${rethDir}" && curl -LO https://github.com/paradigmxyz/reth/releases/download/v0.2.0-beta.6/reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        { stdio: "inherit" }
      );
      execSync(
        `cd "${rethDir}" && tar -xzf reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd "${rethDir}" && del reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        {
          stdio: "inherit",
        }
      );
    } else {
      console.log("Reth is already installed.");
    }
  }
}

function installWindowsConsensusClient(consensusClient) {
  if (consensusClient === "prysm") {
    const prysmDir = path.join(installDir, "bgnode", "prysm");
    const prysmScript = path.join(prysmDir, "prysm.bat");
    if (!fs.existsSync(prysmScript)) {
      console.log("Installing Prysm.");
      if (!fs.existsSync(prysmDir)) {
        console.log(`Creating '${prysmDir}'`);
        fs.mkdirSync(`${prysmDir}/database`, { recursive: true });
        fs.mkdirSync(`${prysmDir}/logs`, { recursive: true });
      }
      execSync(
        `cd "${prysmDir}" && curl https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.bat --output prysm.bat`,
        { stdio: "inherit" }
      );
      execSync(
        "reg add HKCU\\Console /v VirtualTerminalLevel /t REG_DWORD /d 1",
        { stdio: "inherit" }
      );
    } else {
      console.log("Prysm is already installed.");
    }
  } else if (consensusClient === "lighthouse") {
    const lighthouseDir = path.join(installDir, "bgnode", "lighthouse");
    const lighthouseScript = path.join(lighthouseDir, "lighthouse.exe");
    if (!fs.existsSync(lighthouseScript)) {
      console.log("Installing Lighthouse.");
      if (!fs.existsSync(lighthouseDir)) {
        console.log(`Creating '${lighthouseDir}'`);
        fs.mkdirSync(`${lighthouseDir}/database`, { recursive: true });
        fs.mkdirSync(`${lighthouseDir}/logs`, { recursive: true });
      }
      execSync(
        `cd "${lighthouseDir}" && curl -LO https://github.com/sigp/lighthouse/releases/download/v5.1.3/lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        { stdio: "inherit" }
      );
      execSync(
        `cd "${lighthouseDir}" && tar -xzf lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd "${lighthouseDir}" && del lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        {
          stdio: "inherit",
        }
      );
    } else {
      console.log("Lighthouse is already installed.");
    }
  }
}

function parseConsensusLogs(line) {
  line = stripAnsiCodes(line);

  if (line.includes("Latest Prysm version is")) {
    const prysmVerMatch = line.match(/version is v(\d+\.\d+\.\d+)/);
    const prysmVer = prysmVerMatch[1];
    consensusLog.setLabel(`Prysm v${prysmVer}`);
    screen.render();
  }
}

let executionChild;
let consensusChild;

let executionExited = false;
let consensusExited = false;

function handleExit(signal) {
  if (executionChild) {
    executionChild.kill("SIGINT");
  }

  if (consensusChild) {
    consensusChild.kill("SIGINT");
  }

  // Check if both child processes have exited
  const checkExit = () => {
    if (executionExited && consensusExited) {
      process.exit(0);
    }
  };

  // Listen for exit events
  if (executionChild) {
    executionChild.on("exit", (code) => {
      executionExited = true;
      checkExit();
    });
  } else {
    executionExited = true;
  }

  if (consensusChild) {
    consensusChild.on("exit", (code) => {
      consensusExited = true;
      checkExit();
    });
  } else {
    consensusExited = true;
  }

  // Initial check in case both children are already not running
  checkExit();
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);

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

  // child.stdout.on("data", (data) => {
  //   logBox.log(data.toString());

  //   if (clientName === "geth") {
  //     parseExecutionLogs(data.toString());
  //   } else if (clientName === "prysm") {
  //     parseConsensusLogs(data.toString());
  //   }
  // });

  // child.on("exit", (code) => {
  //   logBox.log(`${clientName} process exited with code ${code}`);
  // });

  // child.on("error", (err) => {
  //   logBox.log(`Error: ${err.message}`);
  // });
}

module.exports = { startClient };

let lastStats = {
  totalSent: 0,
  totalReceived: 0,
  timestamp: Date.now(),
};

function getNetworkStats() {
  return new Promise((resolve, reject) => {
    si.networkStats()
      .then((interfaces) => {
        let currentTotalSent = 0;
        let currentTotalReceived = 0;

        interfaces.forEach((iface) => {
          currentTotalSent += iface.tx_bytes;
          currentTotalReceived += iface.rx_bytes;
        });

        // Calculate time difference in seconds
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastStats.timestamp) / 1000;

        // Calculate bytes per second
        const sentPerSecond =
          (currentTotalSent - lastStats.totalSent) / timeDiff;
        const receivedPerSecond =
          (currentTotalReceived - lastStats.totalReceived) / timeDiff;

        // Update last stats for next calculation
        lastStats = {
          totalSent: currentTotalSent,
          totalReceived: currentTotalReceived,
          timestamp: currentTime,
        };

        resolve({
          sentPerSecond: sentPerSecond / 1000000,
          receivedPerSecond: receivedPerSecond / 1000000,
        });
      })
      .catch((error) => {
        debugToFile(
          `getNetworkStats() Error fetching network stats: ${error}`,
          () => {}
        );
        reject(error);
      });
  });
}

getNetworkStats();

const jwtDir = path.join(installDir, "bgnode", "jwt");
const platform = os.platform();

if (["darwin", "linux"].includes(platform)) {
  installMacLinuxExecutionClient(executionClient, platform, gethVer, rethVer);
  installMacLinuxConsensusClient(consensusClient, platform, lighthouseVer);
} else if (platform === "win32") {
  installWindowsExecutionClient(executionClient);
  installWindowsConsensusClient(consensusClient);
}

createJwtSecret(jwtDir);

initializeMonitoring();

startClient(executionClient, installDir);
startClient(consensusClient, installDir);
