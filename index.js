const { exec, execSync, spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const si = require("systeminformation");
const blessed = require("blessed");
const contrib = require("blessed-contrib");
const minimist = require("minimist");
const pty = require("node-pty");
const WebSocket = require("ws");
const { createPublicClient, http } = require("viem");
const { mainnet } = require("viem/chains");

// Set default command line option values
let executionClient = "geth";
let consensusClient = "prysm";
let installDir = os.homedir();

// Set client versions. Note: Prsym version works differently and is parsed from logs
const gethVer = "1.14.3";
const rethVer = "1.0.0";
let prysmVer = "";
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

// if (argv.e) {
//   executionClient = argv.e;
//   if (executionClient !== "geth" && executionClient !== "reth") {
//     console.log("Invalid option for -e. Use 'geth' or 'reth'.");
//     process.exit(1);
//   }
// }
//
// if (argv.c) {
//   consensusClient = argv.c;
//   if (consensusClient !== "prysm" && consensusClient !== "lighthouse") {
//     console.log("Invalid option for -c. Use 'prysm' or 'lighthouse'.");
//     process.exit(1);
//   }
// }

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

function stripAnsiCodes(input) {
  return input.replace(
    /[\u001b\u009b][[()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nq-uy=><~])/g,
    ""
  );
}

function parseExecutionLogs(line) {
  line = stripAnsiCodes(line);

  if (line.includes("Looking for peers")) {
    const peerCountMatch = line.match(/peercount=(\d+)/);
    const peerCount = parseInt(peerCountMatch[1], 10);
    updatePeerCountLcd(peerCount);
  } else if (line.includes("Syncing beacon headers")) {
    const headerDlMatch = line.match(
      /downloaded=([\d,]+)\s+left=([\d,]+)\s+eta=([^\s]+)/
    );

    const headerDlDownloaded = parseInt(headerDlMatch[1].replace(/,/g, ""), 10);
    const headerDlLeft = parseInt(headerDlMatch[2].replace(/,/g, ""), 10);
    const headerDlEta = headerDlMatch[3];

    const headerDlProgress =
      headerDlDownloaded / (headerDlDownloaded + headerDlLeft);

    updateHeaderDlGauge(headerDlProgress);
  } else if (line.includes("Syncing: chain download in progress")) {
    const chainSyncMatch = line.match(/synced=([\d.]+)%/);
    const chainDlProgress = parseFloat(chainSyncMatch[1]) / 100;

    updateChainDlGauge(chainDlProgress);
  } else if (line.includes("Syncing: state download in progress")) {
    const stateSyncMatch = line.match(/synced=([\d.]+)%/);
    const stateDlProgress = parseFloat(stateSyncMatch[1]) / 100;

    updateStateDlGauge(stateDlProgress);
  }
}

function parseConsensusLogs(line) {
  line = stripAnsiCodes(line);

  if (line.includes("Latest Prysm version is")) {
    const prysmVerMatch = line.match(/version is v(\d+\.\d+\.\d+)/);
    prysmVer = prysmVerMatch[1];
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

function startClient(clientName, installDir, logBox) {
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

  child.stdout.on("data", (data) => {
    logBox.log(data.toString());

    if (clientName === "geth") {
      parseExecutionLogs(data.toString());
    } else if (clientName === "prysm") {
      parseConsensusLogs(data.toString());
    }
  });

  child.on("exit", (code) => {
    logBox.log(`${clientName} process exited with code ${code}`);
  });

  child.on("error", (err) => {
    logBox.log(`Error: ${err.message}`);
  });
}

module.exports = { startClient };

let lastStats = {
  totalSent: 0,
  totalReceived: 0,
  timestamp: Date.now(),
};
let screen;
let networkLine;
let networkDataX = [];
let dataSentY = [];
let dataReceivedY = [];
let cpuLine;
let cpuDataX = [];
let dataCpuUsage;
let headerDlGauge;
let stateDlGauge;
let chainDlGauge;
let peerCountLcd;
let memGauge;
let storageGauge;

function getCpuUsage() {
  return new Promise((resolve, reject) => {
    si.currentLoad()
      .then((load) => {
        const currentLoad = load.currentLoad;
        resolve(currentLoad);
      })
      .catch((error) => {
        debugToFile(
          `getCpuUsage() Error fetching CPU usage stats: ${error}`,
          () => {}
        );
        reject(error);
      });
  });
}

async function updateCpuLinePlot() {
  try {
    const currentLoad = await getCpuUsage(); // Get the overall CPU load

    if (currentLoad === undefined || currentLoad === null) {
      throw new Error("Failed to fetch CPU usage data or data is empty");
    }

    const now = new Date();
    const timeLabel = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

    if (!Array.isArray(cpuDataX)) {
      cpuDataX = [];
    }
    if (!Array.isArray(dataCpuUsage)) {
      dataCpuUsage = [];
    }

    cpuDataX.push(timeLabel);
    dataCpuUsage.push(currentLoad);

    // Prepare series data for the overall CPU load
    const series = [
      {
        title: "", // Use an empty string for the title
        x: cpuDataX,
        y: dataCpuUsage,
        style: { line: "cyan" }, // Use the first color
      },
    ];

    cpuLine.setData(series);
    screen.render();

    // Limit data history to the last 60 points
    if (cpuDataX.length > 60) {
      cpuDataX.shift();
      dataCpuUsage.shift();
    }
  } catch (error) {
    debugToFile(
      `updateCpuLineChart() Failed to update CPU usage line chart: ${error}`,
      () => {}
    );
  }
}

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

async function updateNetworkLinePlot() {
  try {
    const stats = await getNetworkStats();
    const now = new Date();
    networkDataX.push(
      now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds()
    );
    dataSentY.push(stats.sentPerSecond);
    dataReceivedY.push(stats.receivedPerSecond);

    var seriesNetworkSent = {
      title: "Sent",
      x: networkDataX,
      y: dataSentY,
      style: { line: "red" },
    };
    var seriesNetworkReceived = {
      title: "Received",
      x: networkDataX,
      y: dataReceivedY,
      style: { line: "blue" },
    };

    networkLine.setData([seriesNetworkSent, seriesNetworkReceived]);
    screen.render();

    // Keep the data arrays from growing indefinitely
    if (networkDataX.length > 60) {
      networkDataX.shift();
      dataSentY.shift();
      dataReceivedY.shift();
    }
  } catch (error) {
    debugToFile(`updateNetworkPlot(): ${error}`, () => {});
  }
}

async function updatePeerCountLcd(peerCount) {
  try {
    if (peerCountLcd) {
      peerCountLcd.setDisplay(peerCount.toString());
      screen.render();
    }
  } catch (error) {
    debugToFile(`updatePeerCountLcd(): ${error}`, () => {});
  }
}

const progressFilePath = path.join(installDir, "bgnode", "progress.json");

function saveProgress(progress) {
  fs.writeFileSync(
    progressFilePath,
    JSON.stringify(progress, null, 2),
    "utf-8"
  );
}

function loadProgress() {
  if (fs.existsSync(progressFilePath)) {
    const data = fs.readFileSync(progressFilePath, "utf-8");
    return JSON.parse(data);
  }
  return {
    headerDlProgress: 0,
    chainDlProgress: 0,
    stateDlProgress: 0,
  };
}

const progress = loadProgress();

async function updateHeaderDlGauge(headerDlProgress) {
  try {
    if (headerDlGauge) {
      headerDlGauge.setPercent(headerDlProgress);
      progress.headerDlProgress = headerDlProgress;
      saveProgress(progress);
      screen.render();
    }
  } catch (error) {
    debugToFile(`updateHeaderDlGauge(): ${error}`, () => {});
  }
}

async function updateChainDlGauge(chainDlProgress) {
  try {
    if (chainDlGauge) {
      chainDlGauge.setPercent(chainDlProgress);
      progress.chainDlProgress = chainDlProgress;
      saveProgress(progress);
      screen.render();
    }
  } catch (error) {
    debugToFile(`updateChainDlGauge(): ${error}`, () => {});
  }
}

async function updateStateDlGauge(stateDlProgress) {
  try {
    if (stateDlGauge) {
      stateDlGauge.setPercent(stateDlProgress);
      progress.stateDlProgress = stateDlProgress;
      saveProgress(progress);
      screen.render();
    }
  } catch (error) {
    debugToFile(`updateStateDlGauge(): ${error}`, () => {});
  }
}

// async function updateSyncProgressGauge(client, gauge) {
//   try {
//     const syncingStatus = await isSyncing(client);

//     if (syncingStatus) {
//       const currentBlock = parseInt(syncingStatus.currentBlock, 16);
//       const highestBlock = parseInt(syncingStatus.highestBlock, 16);
//       if (highestBlock > 0) {
//         const progress = ((currentBlock / highestBlock) * 100).toFixed(1); // Calculate sync progress
//         gauge.setPercent(progress);
//       }
//     } else {
//       gauge.setPercent(100); // If not syncing, assume fully synced
//     }

//     screen.render();
//   } catch (error) {
//     console.error();
//     debugToFile(
//       `updateSyncProgressGauge() Failed to update sync progress gauge: ${error}`,
//       () => {}
//     );
//   }
// }

function getDiskUsage(installDir) {
  return new Promise((resolve, reject) => {
    si.fsSize()
      .then((drives) => {
        let diskUsagePercent = 0;

        // Find the drive where the OS is installed. This is often the drive mounted at "/".
        const osDrive = drives.find((drive) => {
          return drive.mount === "/" || drive.mount === "C:/";
        });

        if (osDrive) {
          diskFreePercent = 100 - (osDrive.available / osDrive.size) * 100;
        } else {
          debugToFile(`OS Drive not found.`, () => {});
        }

        resolve(diskFreePercent.toFixed(1));
      })
      .catch((error) => {
        debugToFile(
          `getDiskUsage() Error fetching disk usage stats: ${error}`,
          () => {}
        );
        reject(error);
      });
  });
}

async function updateDiskGauge(installDir) {
  try {
    const diskUsagePercent = await getDiskUsage(installDir); // Wait for disk usage stats

    // storageGauge.setData([{ label: "% Used", percent: diskUsagePercent }]);
    storageGauge.setPercent(diskUsagePercent);

    screen.render();
  } catch (error) {
    debugToFile(
      `updateDiskGauge() Failed to update disk usage donut: ${error}`,
      () => {}
    );
  }
}

function getMemoryUsage() {
  return new Promise((resolve, reject) => {
    si.mem()
      .then((memory) => {
        const totalMemory = memory.total;
        const usedMemory = memory.active; // 'active' is usually what's actually used
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;

        resolve(memoryUsagePercent.toFixed(1)); // Return memory usage as a percentage
      })
      .catch((error) => {
        debugToFile(
          `getMemoryUsage() Error fetching memory stats: ${error}`,
          () => {}
        );
        reject(error);
      });
  });
}

async function updateMemoryGauge() {
  try {
    const memoryUsagePercent = await getMemoryUsage(); // Wait for memory usage stats
    // memGauge.setData([{ label: " ", percent: memoryUsagePercent }]);
    memGauge.setPercent(memoryUsagePercent);
    screen.render();
  } catch (error) {
    debugToFile(
      `updateMemoryGauge() Failed to update memory gauge: ${error}`,
      () => {}
    );
  }
}

function suppressMouseOutput(screen) {
  screen.on("element mouse", (el, data) => {
    if (data.button === "mouseup" || data.button === "mousedown") {
      return false; // Suppress mouse up/down events
    }
  });

  // Optionally, you can suppress keypress events like arrow keys as well
  screen.on("keypress", (ch, key) => {
    if (
      key.name === "up" ||
      key.name === "down" ||
      key.name === "left" ||
      key.name === "right"
    ) {
      if (!key.ctrl && !key.meta && !key.shift) {
        return false; // Suppress arrow key events unless combined with Ctrl, Meta, or Shift
      }
    }
  });
}

function handleBlessedContrib(
  executionClient,
  consensusClient,
  gethVer,
  rethVer,
  lighthouseVer
) {
  const now = new Date();

  screen = blessed.screen();
  suppressMouseOutput(screen);

  const grid = new contrib.grid({ rows: 8, cols: 10, screen: screen });

  var logo = contrib.picture({
    top: 0,
    left: 0,
    type: "overlay",
    preserveAspectRatio: true,
    width: "20%",
    height: "20%",
    file: "bgLogo.png",
  });

  // const bgLogo = contrib.picture({
  //   file: "bgLogo.png",
  //   top: 0,
  //   left: "80%",
  //   width: "20%",
  //   height: "20%",
  //   type: "ansi",
  // });

  let executionClientLabel;
  if (executionClient === "geth") {
    executionClientLabel = `Geth v${gethVer}`;
  } else if (executionClient === "reth") {
    executionClientLabel = `Reth v${rethVer}`;
  }

  const executionLog = grid.set(0, 0, 2, 10, contrib.log, {
    label: `${executionClientLabel}`,
    border: {
      type: "line",
      fg: "cyan",
    },
    // scrollable: true,
    // scrollbar: { ch: " ", inverse: true },
  });

  let consensusClientLabel;
  if (consensusClient === "prysm") {
    consensusClientLabel = "Prysm";
  } else if (consensusClient === "lighthouse") {
    consensusClientLabel = `Lighthouse v${lighthouseVer}`;
  }

  const consensusLog = grid.set(2, 0, 2, 10, contrib.log, {
    label: `${consensusClientLabel}`,
    border: {
      type: "line",
      fg: "cyan",
    },
    // scrollable: true,
    // scrollbar: { ch: " ", inverse: true },
  });

  cpuLine = grid.set(4, 0, 2, 8, contrib.line, {
    style: { line: "blue", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: "CPU Load (%)",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  networkLine = grid.set(6, 0, 2, 8, contrib.line, {
    style: { line: "yellow", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: "Network Traffic (MB/sec)",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  if (progress.chainDlProgress !== 1) {
    peerCountLcd = contrib.lcd({
      segmentWidth: 0.06, // how wide are the segments in % so 50% = 0.5
      segmentInterval: 0.11, // spacing between the segments in % so 50% = 0.550% = 0.5
      strokeWidth: 0.11, // spacing between the segments in % so 50% = 0.5
      elements: 3, // how many elements in the display. or how many characters can be displayed.
      display: 0, // what should be displayed before first call to setDisplay
      elementSpacing: 4, // spacing between each element
      elementPadding: 2, // how far away from the edges to put the elements
      color: "green", // color for the segments
      label: "Peer Count",
      top: "50%",
      height: "12%",
      left: "80%",
      width: "10%",
      border: {
        type: "line",
        fg: "cyan",
      },
    });
  }

  // peerCountLcd = grid.set(4, 8, 1, 1, blessed.bigtext, {
  //   label: "Peer Count",
  //   content: "Hello, World!",
  //   border: {
  //     type: "line",
  //     fg: "cyan",
  //   },
  //   style: {
  //     fg: "blue",
  //   },
  //   shrink: true,
  //   width: "100%",
  //   height: "100%",
  //   align: "center",
  //   valign: "middle",
  // });

  if (progress.chainDlProgress !== 1) {
    headerDlGauge = grid.set(5, 8, 1, 1, contrib.gauge, {
      label: "Header DL Progress",
      stroke: "cyan",
      fill: "white",
      border: {
        type: "line",
        fg: "cyan",
      },
    });
  }

  if (progress.chainDlProgress !== 1) {
    stateDlGauge = grid.set(6, 8, 1, 1, contrib.gauge, {
      label: "State DL Progress",
      stroke: "cyan",
      fill: "white",
      border: {
        type: "line",
        fg: "cyan",
      },
    });
  }

  if (progress.chainDlProgress !== 1) {
    chainDlGauge = grid.set(7, 8, 1, 1, contrib.gauge, {
      label: "Chain DL Progress",
      stroke: "cyan",
      fill: "white",
      border: {
        type: "line",
        fg: "cyan",
      },
    });
  }

  memGauge = grid.set(6, 9, 1, 1, contrib.gauge, {
    label: "Memory",
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  storageGauge = grid.set(7, 9, 1, 1, contrib.gauge, {
    label: "Storage",
    stroke: "blue",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  screen.append(executionLog);
  screen.append(consensusLog);
  screen.append(cpuLine);
  screen.append(networkLine);
  if (headerDlGauge) screen.append(headerDlGauge);
  if (stateDlGauge) screen.append(stateDlGauge);
  if (chainDlGauge) screen.append(chainDlGauge);
  if (chainDlGauge) screen.append(peerCountLcd);
  screen.append(memGauge);
  screen.append(storageGauge);
  // screen.append(logo);

  setInterval(updateCpuLinePlot, 1000);
  setInterval(updateNetworkLinePlot, 1000);
  setInterval(updateMemoryGauge, 1000);
  updateDiskGauge(installDir);
  setInterval(updateDiskGauge, 10000);

  if (progress.chainDlProgress !== 1) {
    headerDlGauge.setPercent(progress.headerDlProgress);
  }
  if (chainDlGauge && progress.chainDlProgress !== 1) {
    chainDlGauge.setPercent(progress.chainDlProgress);
  }
  if (progress.chainDlProgress !== 1) {
    stateDlGauge.setPercent(progress.stateDlProgress);
  }

  screen.on("resize", () => {
    cpuLine.emit("attach");
    networkLine.emit("attach");

    screen.render();
  });

  screen.render();

  screen.key(["escape", "q", "C-c"], function (ch, key) {
    handleExit("SIGINT");
  });

  return { executionLog, consensusLog };
}

console.log(`\nExecution client selected: ${executionClient}`);
console.log(`Consensus client selected: ${consensusClient}\n`);

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
const { executionLog, consensusLog } = handleBlessedContrib(
  executionClient,
  consensusClient,
  gethVer,
  rethVer,
  lighthouseVer
);
startClient(executionClient, installDir, executionLog);
startClient(consensusClient, installDir, consensusLog);

// const localClient = createPublicClient({
//   name: "localClient",
//   chain: mainnet,
//   transport: http("http://localhost:8545"),
// });

// async function isSyncing(client) {
//   try {
//     const syncingStatus = await client.request({
//       method: "eth_syncing",
//       params: [],
//     });

//     return syncingStatus;
//   } catch (error) {
//     throw new Error(`Failed to fetch syncing status: ${error.message}`);
//   }
// }

const ws = new WebSocket("ws://rpc.buidlguidl.com:8080");

ws.on("open", function open() {
  checkIn();
});

async function checkIn() {
  let executionClientResponse = executionClient;
  let consensusClientResponse = consensusClient;

  if (executionClient === "geth") {
    executionClientResponse = executionClientResponse + " v" + gethVer;
  } else if (executionClient === "reth") {
    executionClientResponse = executionClientResponse + " v" + rethVer;
  }

  if (consensusClient === "prysm") {
    consensusClientResponse = consensusClientResponse + " v" + prysmVer;
  } else if (consensusClient === "lighthouse") {
    consensusClientResponse = consensusClientResponse + " v" + lighthouseVer;
  }

  try {
    const cpuUsage = await getCpuUsage();
    const memoryUsage = await getMemoryUsage();
    const diskUsage = await getDiskUsage(installDir);

    let stringToSend = JSON.stringify({
      os: platform,
      nodeVersion: `${process.version}`,
      executionClient: executionClientResponse,
      consensusClient: consensusClientResponse,
      cpu: `${cpuUsage.toFixed(1)}`,
      mem: `${memoryUsage}`, // Ensure it's a string
      storage: `${diskUsage}`, // Ensure it's a string
    });
    ws.send(stringToSend);
  } catch (error) {
    debugToFile(`checkIn() Error: ${error}`, () => {});
  }
}

setInterval(checkIn, 25000); // Ask every client about their machine every 25 secs

ws.on("close", function close() {
  console.log("Disconnected from server");
});

ws.on("error", function error(err) {
  console.error("WebSocket error:", err);
});
