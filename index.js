const { exec, execSync, spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const si = require("systeminformation");
const blessed = require("blessed");
const contrib = require("blessed-contrib");
const minimist = require("minimist");

// TODO: Make reth snapshot dl. Figure out how to make it get the latest snapshot. Remember it downloads as db/file
// valid dates found so far: 2024-05-14, 2024-04-30, 2024-04-17
// TODO: Make sure snapshot dl works on linux (and windows). This line works on mac
// TODO: Figure out where to put the snapshot dl
// TODO: Figure out how to get most recent snapshot
// TODO: Figure out if lighthouse can start syncing while reth snapshot downloads (might be a pain)
// TODO: Fix reth and lighthouse logging (match geth or prsym)
// TODO: Fix reth and lighthouse custom -d directory path (match geth or prysm)

// Set default values
let executionClient = "geth";
let consensusClient = "prysm";
let installDir = os.homedir();

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

function installMacLinuxExecutionClient(executionClient, platform) {
  const arch = os.arch();

  const configs = {
    darwin: {
      x64: {
        gethFileName: "geth-darwin-amd64-1.14.3-ab48ba42",
        rethFileName: "reth-v0.2.0-beta.6-x86_64-apple-darwin",
      },
      arm64: {
        gethFileName: "geth-darwin-arm64-1.14.3-ab48ba42",
        rethFileName: "reth-v0.2.0-beta.6-aarch64-apple-darwin",
      },
    },
    linux: {
      x64: {
        gethFileName: "geth-linux-amd64-1.14.3-ab48ba42",
        rethFileName: "reth-v0.2.0-beta.6-x86_64-unknown-linux-gnu",
      },
      arm64: {
        gethFileName: "geth-linux-arm64-1.14.3-ab48ba42",
        rethFileName: "reth-v0.2.0-beta.6-aarch64-unknown-linux-gnu",
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
        `cd "${rethDir}" && curl -L -O -# https://github.com/paradigmxyz/reth/releases/download/v0.2.0-beta.6/${rethFileName}.tar.gz`,
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

      downloadRethSnapshot(rethDir, platform);
    } else {
      console.log("Reth is already installed.");
    }
  }
}

function installMacLinuxConsensusClient(consensusClient, platform) {
  const arch = os.arch();

  const configs = {
    darwin: {
      x64: {
        lighthouseFileName: "lighthouse-v5.1.3-x86_64-apple-darwin",
      },
      arm64: {
        lighthouseFileName: "lighthouse-v5.1.3-x86_64-apple-darwin-portable",
      },
    },
    linux: {
      x64: {
        lighthouseFileName: "lighthouse-v5.1.3-x86_64-unknown-linux-gnu",
      },
      arm64: {
        lighthouseFileName: "lighthouse-v5.1.3-aarch64-unknown-linux-gnu",
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
        `cd "${lighthouseDir}" && curl -L -O -# https://github.com/sigp/lighthouse/releases/download/v5.1.3/${lighthouseFileName}.tar.gz`,
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
let memDonut;
let storageDonut;

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
    debugToFile(
      `updateNetworkPlot() Failed to update plot: ${error}`,
      () => {}
    );
  }
}

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

        resolve(diskFreePercent);
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

async function updateDiskDonut(installDir) {
  try {
    const diskUsagePercent = await getDiskUsage(installDir); // Wait for disk usage stats

    storageDonut.setData([
      { label: "% Used", percent: diskUsagePercent, color: "green" },
    ]);

    screen.render();
  } catch (error) {
    debugToFile(
      `updateDiskDonut() Failed to update disk usage donut: ${error}`,
      () => {}
    );
  }
}

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

function getMemoryUsage() {
  return new Promise((resolve, reject) => {
    si.mem()
      .then((memory) => {
        const totalMemory = memory.total;
        const usedMemory = memory.active; // 'active' is usually what's actually used
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;

        resolve(memoryUsagePercent.toFixed(2)); // Return memory usage as a percentage
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
    memDonut.setData([
      { label: " ", percent: memoryUsagePercent, color: "red" },
    ]);
    screen.render();
  } catch (error) {
    debugToFile(
      `updateMemoryGauge() Failed to update memory gauge: ${error}`,
      () => {}
    );
  }
}

function startClient(clientName, installDir) {
  try {
    const pm2Out = execSync(`pm2 describe ${clientName} | grep "status"`, {
      encoding: "utf8",
    });

    if (pm2Out.includes("stopped")) {
      execSync(`pm2 start ${clientName}`, {
        env: { ...process.env, INSTALL_DIR: installDir },
        stdio: ["ignore", "ignore", "ignore"],
      });
    }
  } catch (error) {
    if (error.message.includes("doesn't exist")) {
      execSync(`pm2 start ${clientName}.js`, {
        env: { ...process.env, INSTALL_DIR: installDir },
        stdio: ["ignore", "ignore", "ignore"],
      });
    }
  }
}

module.exports = { startClient };

function handlePM2Logs(clientName, logBox) {
  const tail = spawn("pm2", ["logs", clientName, "--raw"]);

  tail.stdout.on("data", (data) => {
    logBox.log(data.toString());
  });

  tail.stderr.on("data", (data) => {
    logBox.log(data.toString());
  });

  tail.on("close", (code) => {
    logBox.log(`${clientName} logs stream closed with code ${code}`);
  });
}

function startBlessedContrib(executionClient, consensusClient) {
  const now = new Date();

  screen = blessed.screen();

  // Create two log boxes
  const executionLog = contrib.log({
    label: "Execution Logs",
    top: "0%",
    height: "25%",
    width: "100%",
  });

  const consensusLog = contrib.log({
    label: "Consensus Logs",
    top: "25%",
    height: "25%",
    width: "100%",
  });

  cpuLine = contrib.line({
    style: { line: "blue", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: "CPU Load (%)",
    top: "50%",
    height: "25%",
    width: "90%",
  });

  memDonut = contrib.donut({
    label: "Memory",
    radius: 10,
    arcWidth: 4,
    remainColor: "white",
    yPadding: 0,
    top: "70%",
    height: "15%",
    left: "90%",
    width: "10%",
  });

  networkLine = contrib.line({
    style: { line: "yellow", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: "Network Traffic (MB/sec)",
    top: "75%",
    height: "25%",
    width: "90%",
  });

  storageDonut = contrib.donut({
    label: "Storage",
    radius: 10,
    arcWidth: 4,
    remainColor: "white",
    yPadding: 0,
    top: "85%",
    height: "15%",
    left: "90%",
    width: "10%",
  });

  screen.append(executionLog);
  screen.append(consensusLog);
  screen.append(cpuLine);
  screen.append(memDonut);
  screen.append(networkLine);
  screen.append(storageDonut);

  setInterval(updateCpuLinePlot, 1000);
  setInterval(updateNetworkLinePlot, 1000);
  setInterval(updateMemoryGauge, 1000);
  updateDiskDonut(installDir);
  setInterval(updateDiskDonut, 10000);

  handlePM2Logs(executionClient, executionLog);
  handlePM2Logs(consensusClient, consensusLog);

  // Quit on Escape, q, or Control-C.
  screen.key(["escape", "q", "C-c"], function (ch, key) {
    return process.exit(0);
  });

  screen.render();
}

console.log(`Execution client selected: ${executionClient}`);
console.log(`Consensus client selected: ${consensusClient}\n`);

getNetworkStats();

const jwtDir = path.join(installDir, "bgnode", "jwt");
const platform = os.platform();

if (["darwin", "linux"].includes(platform)) {
  installMacLinuxExecutionClient(executionClient, platform);
  installMacLinuxConsensusClient(consensusClient, platform);
} else if (platform === "win32") {
  installWindowsExecutionClient(executionClient);
  installWindowsConsensusClient(consensusClient);
}

createJwtSecret(jwtDir);
startBlessedContrib(executionClient, consensusClient);
startClient(executionClient, installDir);
startClient(consensusClient, installDir);
