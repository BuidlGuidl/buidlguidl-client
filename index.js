const { exec, execSync, spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const si = require("systeminformation");
const blessed = require("blessed");
const contrib = require("blessed-contrib");

// Set default values
let executionClient = "reth";
let consensusClient = "lighthouse";

function showHelp() {
  console.log("Usage: node script.js [options]");
  console.log("");
  console.log("Options:");
  console.log("  -e <client>  Specify the execution client ('geth' or 'reth')");
  console.log(
    "  -c <client>  Specify the consensus client ('prysm' or 'lighthouse')"
  );
  console.log("  -h           Display this help message and exit");
  console.log("");
}

function color(code, text) {
  // Usage: color "31;5" "string"
  // Some valid values for color:
  // - 5 blink, 1 strong, 4 underlined
  // - fg: 31 red,  32 green, 33 yellow, 34 blue, 35 purple, 36 cyan, 37 white
  // - bg: 40 black, 41 red, 44 blue, 45 purple
  console.log(`\x1b[${code}m${text}\x1b[0m`);
}

// Process command-line arguments
const args = process.argv.slice(2);
args.forEach((val, index) => {
  switch (val) {
    case "-e":
      executionClient = args[index + 1];
      if (!["geth", "reth"].includes(executionClient)) {
        color("31", "Invalid option for -e. Use 'geth' or 'reth'.");
        process.exit(1);
      }
      break;
    case "-c":
      consensusClient = args[index + 1];
      if (!["prysm", "lighthouse"].includes(consensusClient)) {
        color("31", "Invalid option for -c. Use 'prysm' or 'lighthouse'.");
        process.exit(1);
      }
      break;
    case "-h":
      showHelp();
      process.exit(0);
      break;
  }
});

function debugToFile(data, callback) {
  const filePath = path.join(os.homedir(), "bgnode", "debug.log");
  const now = new Date();
  const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  // Check if data is an object and stringify if so, otherwise directly use the data
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

function checkMacLinuxPrereqs(platform) {
  // All these are required to be installed for linux: node, npm, yarn
  if (platform === "linux") {
    try {
      execSync(`command -v curl`, { stdio: "ignore" });
      const version = execSync(`curl --version`).toString().trim();
      color("36", `\nCurl is already installed. Version:\n${version}`);
    } catch {
      color("1", `\nPlease install Curl by running this command:`);
      color("1", `sudo apt-get install curl`);
      process.exit(0);
    }
  }
}

function checkWindowsPrereqs() {
  try {
    const version = execSync(`choco -v`).toString().trim();
    color("36", `\nChocolatey is already installed. Version:\n${version}`);
  } catch {
    color(
      "1",
      `\nPlease install Chocolatey (https://community.chocolatey.org/).`
    );
    process.exit(0);
  }

  try {
    const version = execSync(`openssl -v`).toString().trim();
    color("36", `\nOpenssl is already installed. Version:\n${version}`);
  } catch {
    color("1", `\nPlease install openssl`);
    color(
      "1",
      `Open Command Prompt as Administrator and run 'choco install openssl'`
    );
    process.exit(0);
  }
}

function createJwtSecret(jwtDir) {
  if (!fs.existsSync(jwtDir)) {
    color("1", `\nCreating '${jwtDir}'`);
    fs.mkdirSync(jwtDir, { recursive: true });
  }

  if (!fs.existsSync(`${jwtDir}/jwt.hex`)) {
    color("1", "Generating JWT.hex file.");
    execSync(`cd ${jwtDir} && openssl rand -hex 32 > jwt.hex`, {
      stdio: "inherit",
    });
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
    const gethDir = path.join(os.homedir(), "bgnode", "geth");
    const gethScript = path.join(gethDir, "geth");
    if (!fs.existsSync(gethScript)) {
      color("1", "\nInstalling Geth.");
      if (!fs.existsSync(gethDir)) {
        console.log(`Creating '${gethDir}'`);
        fs.mkdirSync(`${gethDir}/database`, { recursive: true });
        fs.mkdirSync(`${gethDir}/logs`, { recursive: true });
      }
      console.log("Downloading Geth.");
      execSync(
        `cd ${gethDir} && curl -L -O -# https://gethstore.blob.core.windows.net/builds/${gethFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Geth.");
      execSync(`cd ${gethDir} && tar -xzvf ${gethDir}/${gethFileName}.tar.gz`, {
        stdio: "inherit",
      });
      execSync(`cd ${gethDir}/${gethFileName} && mv geth .. `, {
        stdio: "inherit",
      });
      console.log("Cleaning up Geth directory.");
      execSync(
        `cd ${gethDir} && rm -r ${gethFileName} && rm ${gethFileName}.tar.gz`,
        { stdio: "inherit" }
      );
    } else {
      color("36", "Geth is already installed.");
    }
  } else if (executionClient === "reth") {
    const rethDir = path.join(os.homedir(), "bgnode", "reth");
    const rethScript = path.join(rethDir, "reth");
    if (!fs.existsSync(rethScript)) {
      color("1", "\nInstalling Reth.");
      if (!fs.existsSync(rethDir)) {
        console.log(`Creating '${rethDir}'`);
        fs.mkdirSync(`${rethDir}/database`, { recursive: true });
        fs.mkdirSync(`${rethDir}/logs`, { recursive: true });
      }
      console.log("Downloading Reth.");
      execSync(
        `cd ${rethDir} && curl -L -O -# https://github.com/paradigmxyz/reth/releases/download/v0.2.0-beta.6/${rethFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Reth.");
      execSync(`cd ${rethDir} && tar -xzvf ${rethDir}/${rethFileName}.tar.gz`, {
        stdio: "inherit",
      });
      console.log("Cleaning up Reth directory.");
      execSync(`cd ${rethDir} && rm ${rethFileName}.tar.gz`, {
        stdio: "inherit",
      });
    } else {
      color("36", "Reth is already installed.");
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
    const prysmDir = path.join(os.homedir(), "bgnode", "prysm");
    const prysmScript = path.join(prysmDir, "prysm.sh");
    if (!fs.existsSync(prysmScript)) {
      color("1", "\nInstalling Prysm.");
      if (!fs.existsSync(prysmDir)) {
        console.log(`Creating '${prysmDir}'`);
        fs.mkdirSync(`${prysmDir}/database`, { recursive: true });
        fs.mkdirSync(`${prysmDir}/logs`, { recursive: true });
      }
      console.log("Downloading Prysm.");
      execSync(
        `cd ${prysmDir} && curl -L -O -# https://raw.githubusercontent.com/prysmaticlabs/prysm/master/${prysmFileName}.sh && chmod +x prysm.sh`,
        { stdio: "inherit" }
      );
    } else {
      color("36", "Prysm is already installed.");
    }
  } else if (consensusClient === "lighthouse") {
    const lighthouseDir = path.join(os.homedir(), "bgnode", "lighthouse");
    const lighthouseScript = path.join(lighthouseDir, "lighthouse");
    if (!fs.existsSync(lighthouseScript)) {
      color("1", "\nInstalling Lighthouse.");
      if (!fs.existsSync(lighthouseDir)) {
        console.log(`Creating '${lighthouseDir}'`);
        fs.mkdirSync(`${lighthouseDir}/database`, { recursive: true });
        fs.mkdirSync(`${lighthouseDir}/logs`, { recursive: true });
      }
      console.log("Downloading Lighthouse.");
      execSync(
        `cd ${lighthouseDir} && curl -L -O -# https://github.com/sigp/lighthouse/releases/download/v5.1.3/${lighthouseFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Lighthouse.");
      execSync(
        `cd ${lighthouseDir} && tar -xzvf ${lighthouseDir}/${lighthouseFileName}.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      console.log("Cleaning up Lighthouse directory.");
      execSync(`cd ${lighthouseDir} && rm ${lighthouseFileName}.tar.gz`, {
        stdio: "inherit",
      });
    } else {
      color("36", "Lighthouse is already installed.");
    }
  }
}

function installWindowsExecutionClient(executionClient) {
  if (executionClient === "geth") {
    const gethDir = path.join(os.homedir(), "bgnode", "geth");
    const gethScript = path.join(gethDir, "geth.exe");
    if (!fs.existsSync(gethScript)) {
      color("1", "\nInstalling Geth.");
      if (!fs.existsSync(gethDir)) {
        console.log(`Creating '${gethDir}'`);
        fs.mkdirSync(`${gethDir}/database`, { recursive: true });
        fs.mkdirSync(`${gethDir}/logs`, { recursive: true });
      }
      execSync(
        `cd ${gethDir} && curl https://gethstore.blob.core.windows.net/builds/geth-windows-amd64-1.14.3-ab48ba42.zip --output geth.zip`,
        { stdio: "inherit" }
      );
      execSync(`cd ${gethDir} && tar -xf ${gethDir}/geth.zip`, {
        stdio: "inherit",
      });
      execSync(
        `cd ${gethDir}/geth-windows-amd64-1.14.3-ab48ba42 && move geth.exe .. `,
        { stdio: "inherit" }
      );
      execSync(
        `cd ${gethDir} && del geth.zip && rd /S /Q geth-windows-amd64-1.14.3-ab48ba42`,
        { stdio: "inherit" }
      );
    } else {
      color("36", "Geth is already installed.");
    }
  } else if (executionClient === "reth") {
    const rethDir = path.join(os.homedir(), "bgnode", "reth");
    const rethScript = path.join(rethDir, "reth.exe");
    if (!fs.existsSync(rethScript)) {
      color("1", "\nInstalling Reth.");
      if (!fs.existsSync(rethDir)) {
        console.log(`Creating '${rethDir}'`);
        fs.mkdirSync(`${rethDir}/database`, { recursive: true });
        fs.mkdirSync(`${rethDir}/logs`, { recursive: true });
      }
      execSync(
        `cd ${rethDir} && curl -LO https://github.com/paradigmxyz/reth/releases/download/v0.2.0-beta.6/reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        { stdio: "inherit" }
      );
      execSync(
        `cd ${rethDir} && tar -xzf ${rethDir}/reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd ${rethDir} && del reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        { stdio: "inherit" }
      );
    } else {
      color("36", "Reth is already installed.");
    }
  }
}

function installWindowsConsensusClient(consensusClient) {
  if (consensusClient === "prysm") {
    const prysmDir = path.join(os.homedir(), "bgnode", "prysm");
    const prysmScript = path.join(prysmDir, "prysm.bat");
    if (!fs.existsSync(prysmScript)) {
      console.log("Installing Prysm.");
      if (!fs.existsSync(prysmDir)) {
        console.log(`Creating '${prysmDir}'`);
        fs.mkdirSync(`${prysmDir}/database`, { recursive: true });
        fs.mkdirSync(`${prysmDir}/logs`, { recursive: true });
      }
      execSync(
        `cd ${prysmDir} && curl https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.bat --output prysm.bat`,
        { stdio: "inherit" }
      );
      execSync(
        "reg add HKCU\\Console /v VirtualTerminalLevel /t REG_DWORD /d 1",
        { stdio: "inherit" }
      );
    } else {
      color("36", "Prysm is already installed.");
    }
  } else if (consensusClient === "lighthouse") {
    const lighthouseDir = path.join(os.homedir(), "bgnode", "lighthouse");
    const lighthouseScript = path.join(lighthouseDir, "lighthouse.exe");
    if (!fs.existsSync(lighthouseScript)) {
      console.log("Installing Lighthouse.");
      if (!fs.existsSync(lighthouseDir)) {
        console.log(`Creating '${lighthouseDir}'`);
        fs.mkdirSync(`${lighthouseDir}/database`, { recursive: true });
        fs.mkdirSync(`${lighthouseDir}/logs`, { recursive: true });
      }
      execSync(
        `cd ${lighthouseDir} && curl -LO https://github.com/sigp/lighthouse/releases/download/v5.1.3/lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        { stdio: "inherit" }
      );
      execSync(
        `cd ${lighthouseDir} && tar -xzf ${lighthouseDir}/lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd ${lighthouseDir} && del lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        { stdio: "inherit" }
      );
    } else {
      color("36", "Lighthouse is already installed.");
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
          sentPerSecond: sentPerSecond / 1000000, // Convert to megabytes if needed
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
    const stats = await getNetworkStats(); // Wait for network stats
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

function getDiskUsage() {
  return new Promise((resolve, reject) => {
    si.fsSize()
      .then((drives) => {
        let diskUsagePercent = 0;

        // Find the drive where the OS is installed. This is often the drive mounted at "/".
        const osDrive = drives.find((drive) => {
          return drive.mount === "/" || drive.mount === "C:/";
        });

        // debugToFile(`osDrive: ${JSON.stringify(osDrive, null, 2)}`, () => {});

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

async function updateDiskDonut() {
  try {
    const diskUsagePercent = await getDiskUsage(); // Wait for disk usage stats

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

// function getCpuUsage() {
//   return new Promise((resolve, reject) => {
//     si.currentLoad()
//       .then((load) => {
//         const cpuLoads = load.cpus.map((cpu) => cpu.load);
//         debugToFile(`load: ${JSON.stringify(load, null, 2)}`, () => {});
//         resolve(cpuLoads);
//       })
//       .catch((error) => {
//         debugToFile(
//           `getCpuUsage() Error fetching CPU usage stats: ${error}`,
//           () => {}
//         );
//         reject(error);
//       });
//   });
// }

function getCpuUsage() {
  return new Promise((resolve, reject) => {
    si.currentLoad()
      .then((load) => {
        const currentLoad = load.currentLoad;
        // debugToFile(`load: ${JSON.stringify(load, null, 2)}`, () => {});
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

// const colors = [
//   240, 255, 32, 48, 64, 208, 80, 192, 176, 96, 160, 112, 144, 128,
// ];

// function getColor(i) {
//   return colors[i % colors.length];
// }
//
// async function updateCpuLinePlot() {
//   try {
//     const cpuUsagePercentages = await getCpuUsage(); // Ensure this returns an array

//     // Check if cpuUsagePercentages is valid
//     if (
//       !Array.isArray(cpuUsagePercentages) ||
//       cpuUsagePercentages.length === 0
//     ) {
//       throw new Error("Failed to fetch CPU usage data or data is empty");
//     }

//     const now = new Date();
//     const timeLabel = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

//     // Initialize dataCpuUsage as an array of arrays if not already done
//     if (!Array.isArray(dataCpuUsage)) {
//       dataCpuUsage = cpuUsagePercentages.map(() => []);
//     }

//     // Ensure each core has a corresponding sub-array
//     cpuUsagePercentages.forEach((load, index) => {
//       if (!Array.isArray(dataCpuUsage[index])) {
//         dataCpuUsage[index] = [];
//       }
//       dataCpuUsage[index].push(load);
//     });

//     cpuDataX.push(timeLabel);

//     // Prepare series data for each CPU core
//     const series = cpuUsagePercentages.map((_, i) => ({
//       // title: `${i + 1}`,
//       title: "",
//       x: cpuDataX,
//       y: dataCpuUsage[i],
//       style: { line: getColor(i) }, // Consider varying colors for each core
//     }));

//     cpuLine.setData(series);
//     screen.render();

//     // Limit data history to the last 60 points
//     if (cpuDataX.length > 60) {
//       cpuDataX.shift();
//       dataCpuUsage.forEach((cpuData) => cpuData.shift());
//     }
//   } catch (error) {
//     debugToFile(
//       `updateCpuLineChart() Failed to update CPU usage line chart: ${error}`,
//       () => {}
//     );
//   }
// }

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

        // debugToFile(`memory: ${JSON.stringify(memory, null, 2)}`, () => {});

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

function startChain(executionClient, consensusClient, jwtDir, platform) {
  // TODO: CONFIGURE reth and lighthouse ports
  // TODO: Make reth and lighthouse default
  // TODO: Don't let uses switch clients?
  // TODO: Add PM2 or something to handle restarts
  // TODO: Use non-standard ports
  // TODO: Figure out what mem usage is actually displaying
  // TODO: Make the blessed-contrib view cooler - a BG logo and ...
  // TODO: Test blessed-contrib on windows and linux

  jwtPath = path.join(jwtDir, "jwt.hex");
  const now = new Date();

  screen = blessed.screen();

  // Create two log boxes
  const executionLog = contrib.log({
    fg: "green",
    selectedFg: "green",
    label: "Execution Logs",
    top: "0%",
    // height: "40%",
    height: "20%",
    width: "100%",
  });

  const consensusLog = contrib.log({
    fg: "yellow",
    selectedFg: "yellow",
    label: "Consensus Logs",
    // top: "40%",
    // height: "40%",
    top: "20%",
    height: "20%",
    width: "100%",
  });

  cpuLine = contrib.line({
    style: { line: "blue", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: "CPU Load (%)",
    // top: "80%",
    // height: "10%",
    top: "40%",
    height: "30%",
    width: "100%",
  });

  memDonut = contrib.donut({
    label: "Memory",
    radius: 10,
    arcWidth: 4,
    remainColor: "white",
    yPadding: 0,
    // top: "80%",
    // height: "10%",
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
    // top: "90%",
    // height: "10%",
    top: "70%",
    height: "30%",
    width: "90%",
  });

  storageDonut = contrib.donut({
    label: "Storage",
    radius: 10,
    arcWidth: 4,
    remainColor: "white",
    yPadding: 0,
    // top: "90%",
    // height: "10%",
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

  screen.render();

  setInterval(updateCpuLinePlot, 1000);
  setInterval(updateNetworkLinePlot, 1000);
  setInterval(updateMemoryGauge, 1000);
  updateDiskDonut();
  setInterval(updateDiskDonut, 10000);

  let execution;
  if (executionClient === "geth") {
    let gethCommand;
    if (["darwin", "linux"].includes(platform)) {
      gethCommand = path.join(os.homedir(), "bgnode", "geth", "geth");
    } else if (platform === "win32") {
      gethCommand = path.join(os.homedir(), "bgnode", "geth", "geth.exe");
    }

    const logFilePath = path.join(
      os.homedir(),
      "bgnode",
      "geth",
      "logs",
      `geth_${getFormattedDateTime()}.log`
    );

    execution = spawn(
      `${gethCommand}`,
      [
        "--mainnet",
        "--syncmode",
        "snap",
        "--http",
        "--http.api",
        "eth,net,engine,admin",
        "--http.addr",
        "0.0.0.0",
        "--datadir",
        path.join(os.homedir(), "bgnode", "geth", "database"),
        "--log.file",
        logFilePath,
        "--authrpc.jwtsecret",
        `${jwtPath}`,
      ],
      { shell: true }
    );
  } else if (executionClient === "reth") {
    let rethCommand;
    if (["darwin", "linux"].includes(platform)) {
      rethCommand = path.join(os.homedir(), "bgnode", "reth", "reth");
    } else if (platform === "win32") {
      rethCommand = path.join(os.homedir(), "bgnode", "reth", "reth.exe");
    }

    const logFilePath = path.join(
      os.homedir(),
      "bgnode",
      "reth",
      "logs",
      `reth_${getFormattedDateTime()}.log`
    );

    execution = spawn(
      `${rethCommand}`,
      [
        "node",
        "--full",
        "--http",
        "--http.api",
        "trace,web3,eth,debug",
        "--ws",
        "--ws.api",
        "trace,web3,eth,debug",
        "--authrpc.addr",
        "127.0.0.1",
        "--authrpc.port",
        "8551",
        "--datadir",
        path.join(os.homedir(), "bgnode", "reth", "database"),
        "--log.file.directory",
        logFilePath,
        "--authrpc.jwtsecret",
        `${jwtPath}`,
      ],
      { shell: true }
    );
  }

  execution.stdout.on("data", (data) => {
    executionLog.log(data.toString());
  });

  execution.stderr.on("data", (data) => {
    executionLog.log(data.toString());
  });

  let consensus;
  if (consensusClient === "prysm") {
    let prysmCommand;
    if (["darwin", "linux"].includes(platform)) {
      prysmCommand = path.join(os.homedir(), "bgnode", "prysm", "prysm.sh");
    } else if (platform === "win32") {
      prysmCommand = path.join(os.homedir(), "bgnode", "prysm", "prysm.bat");
    }

    const logFilePath = path.join(
      os.homedir(),
      "bgnode",
      "prysm",
      "logs",
      `prysm_${getFormattedDateTime()}.log`
    );

    consensus = spawn(
      `${prysmCommand}`,
      [
        "beacon-chain",
        "--mainnet",
        "--execution-endpoint",
        "http://localhost:8551",
        "--grpc-gateway-host=0.0.0.0",
        "--grpc-gateway-port=3500",
        "--checkpoint-sync-url=https://mainnet-checkpoint-sync.attestant.io/",
        "--genesis-beacon-api-url=https://mainnet-checkpoint-sync.attestant.io/",
        `--datadir=${path.join(os.homedir(), "bgnode", "prysm", "database")}`,
        `--log-file=${logFilePath}`,
        "--accept-terms-of-use=true",
        "--jwt-secret",
        `${jwtPath}`,
      ],
      { shell: true }
    );
  } else if (consensusClient === "lighthouse") {
    let lighthouseCommand;
    if (["darwin", "linux"].includes(platform)) {
      lighthouseCommand = path.join(
        os.homedir(),
        "bgnode",
        "lighthouse",
        "lighthouse"
      );
    } else if (platform === "win32") {
      lighthouseCommand = path.join(
        os.homedir(),
        "bgnode",
        "lighthouse",
        "lighthouse.exe"
      );
    }

    const logFilePath = path.join(
      os.homedir(),
      "bgnode",
      "lighthouse",
      "logs",
      `lighthouse_${getFormattedDateTime()}.log`
    );

    consensus = spawn(
      `${lighthouseCommand}`,
      [
        "bn",
        "--network",
        "mainnet",
        "--execution-endpoint",
        "http://localhost:8551",
        "--checkpoint-sync-url",
        "https://mainnet.checkpoint.sigp.io",
        "--disable-deposit-contract-sync",
        "--datadir",
        path.join(os.homedir(), "bgnode", "lighthouse", "database"),
        "--logfile",
        logFilePath,
        "--execution-jwt",
        `${jwtPath}`,
      ],
      { shell: true }
    );
  }

  consensus.stdout.on("data", (data) => {
    consensusLog.log(data.toString());
  });

  consensus.stderr.on("data", (data) => {
    consensusLog.log(data.toString());
  });

  // Handle close
  execution.on("close", (code) => {
    executionLog.log(`Geth process exited with code ${code}`);
  });

  consensus.on("close", (code) => {
    consensusLog.log(`Prysm process exited with code ${code}`);
  });

  // Quit on Escape, q, or Control-C.
  screen.key(["escape", "q", "C-c"], function (ch, key) {
    if (["darwin", "linux"].includes(platform)) {
      if (executionClient === "geth") {
        execSync("pkill -SIGINT geth", { stdio: "ignore" });
      } else if (executionClient === "reth") {
        execSync("pkill -SIGINT reth", { stdio: "ignore" });
      }

      if (consensusClient === "lighthouse") {
        execSync("pkill -SIGINT lighthouse", { stdio: "ignore" });
      }
    } else if (platform === "win32") {
      if (executionClient === "geth") {
        execSync(`powershell -Command "Get-Process geth | Stop-Process"`);
      } else if (executionClient === "reth") {
        execSync(`powershell -Command "Get-Process reth | Stop-Process"`);
      }

      if (consensusClient === "prysm") {
        execSync(
          `powershell -Command "Get-Process beacon-chain* | Stop-Process"`
        );
      } else if (consensusClient === "lighthouse") {
        execSync(
          `powershell -Command "Get-Process beacon-chain* | Stop-Process"`
        );
      }
    }

    return process.exit(0);
  });

  screen.render();
}

console.log(`Execution client selected: ${executionClient}`);
console.log(`Consensus client selected: ${consensusClient}\n`);

getNetworkStats();

const jwtDir = path.join(os.homedir(), "bgnode", "jwt");
const platform = os.platform();

if (["darwin", "linux"].includes(platform)) {
  checkMacLinuxPrereqs(platform);
  installMacLinuxExecutionClient(executionClient, platform);
  installMacLinuxConsensusClient(consensusClient, platform);
} else if (platform === "win32") {
  checkWindowsPrereqs();
  installWindowsExecutionClient(executionClient);
  installWindowsConsensusClient(consensusClient);
}

createJwtSecret(jwtDir);
startChain(executionClient, consensusClient, jwtDir, platform);
