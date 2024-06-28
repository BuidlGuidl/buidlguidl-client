const fs = require("fs");
const path = require("path");
const os = require("os");
const blessed = require("blessed");
const contrib = require("blessed-contrib");
const si = require("systeminformation");

const {
  loadProgress,
  getLatestLogFile,
} = require("./monitor_components/helperFunctions");

const { createDiskGauge } = require("./monitor_components/diskGauge");
const { createMemGauge } = require("./monitor_components/memGauge");
const { createCpuLine } = require("./monitor_components/cpuLine");
const { createNetworkLine } = require("./monitor_components/networkLine");
const { createStateDlGauge } = require("./monitor_components/stateDlGauge");
const { createHeaderDlGauge } = require("./monitor_components/headerDlGauge");
const { createChainDlGauge } = require("./monitor_components/chainDlGauge");
const { createPeerCountLcd } = require("./monitor_components/peerCountLcd");

const { createExecutionLog } = require("./monitor_components/executionLog");

const {
  setupLogStreaming,
} = require("./monitor_components/updateLogicExecution");

const {
  createConsensusLog,
  setupLogStreamingConsensus,
} = require("./monitor_components/consensusLog");

function initializeMonitoring() {
  const installDir = os.homedir();
  const logDir = path.join(installDir, "bgnode", "geth", "logs");
  const logDirConsensus = path.join(installDir, "bgnode", "prysm", "logs");

  const logFilePath = path.join(logDir, getLatestLogFile(logDir, "geth"));
  const logFilePathConsensus = path.join(
    logDirConsensus,
    getLatestLogFile(logDirConsensus, "prysm")
  );

  const debugLogPath = path.join(installDir, "bgnode", "debugMonitor.log");

  if (fs.existsSync(debugLogPath)) {
    fs.unlinkSync(debugLogPath);
  }

  function logDebug(message) {
    if (typeof message === "object") {
      message = JSON.stringify(message, null, 2);
    }
    fs.appendFileSync(
      debugLogPath,
      `[${new Date().toISOString()}] ${message}\n`
    );
  }

  // Override console.log to write to debug log file
  console.log = function (message, ...optionalParams) {
    if (optionalParams.length > 0) {
      message +=
        " " +
        optionalParams
          .map((param) =>
            typeof param === "object" ? JSON.stringify(param, null, 2) : param
          )
          .join(" ");
    }
    logDebug(message);
  };

  console.log(`Monitoring Geth logs from: ${logFilePath}`);
  console.log(`Monitoring Prysm logs from: ${logFilePathConsensus}`);

  const progress = loadProgress();

  console.log("progress", progress.headerDlProgress);

  let headerDlGauge;
  let stateDlGauge;
  let chainDlGauge;
  let peerCountGauge;

  function handleBlessedContrib(executionClient, consensusClient) {
    const now = new Date();

    const screen = blessed.screen();
    // suppressMouseOutput(screen);
    const grid = new contrib.grid({ rows: 8, cols: 10, screen: screen });

    const executionLog = createExecutionLog(grid);
    const consensusLog = createConsensusLog(grid);
    peerCountGauge = createPeerCountLcd(grid, screen);
    const storageGauge = createDiskGauge(grid, screen);
    const memGauge = createMemGauge(grid, screen);
    const cpuLine = createCpuLine(grid, screen);
    const networkLine = createNetworkLine(grid, screen);
    headerDlGauge = createHeaderDlGauge(grid);
    stateDlGauge = createStateDlGauge(grid);
    chainDlGauge = createChainDlGauge(grid);

    screen.append(executionLog);
    screen.append(consensusLog);
    screen.append(peerCountGauge);
    screen.append(cpuLine);
    screen.append(networkLine);
    screen.append(memGauge);
    screen.append(storageGauge);
    screen.append(headerDlGauge);
    screen.append(stateDlGauge);
    screen.append(chainDlGauge);

    peerCountGauge.setDisplay("0");

    if (progress) {
      headerDlGauge.setPercent(progress.headerDlProgress);
      stateDlGauge.setPercent(progress.stateDlProgress);
      chainDlGauge.setPercent(progress.chainDlProgress);
    }

    screen.render();

    // Quit on Escape, q, or Control-C.
    screen.key(["escape", "q", "C-c"], function (ch, key) {
      process.exit(0);
    });

    return { executionLog, consensusLog, screen };
  }

  const { executionLog, consensusLog, screen } = handleBlessedContrib(
    "geth",
    "prysm"
  );

  setupLogStreaming(
    logFilePath,
    executionLog,
    screen,
    headerDlGauge,
    stateDlGauge,
    chainDlGauge,
    peerCountGauge
  );
  setupLogStreamingConsensus(logFilePathConsensus, consensusLog, screen);
}

module.exports = { initializeMonitoring };

// function suppressMouseOutput(screen) {
//   screen.on("element mouse", (el, data) => {
//     if (data.button === "mouseup" || data.button === "mousedown") {
//       return false; // Suppress mouse up/down events
//     }
//   });

//   screen.on("keypress", (ch, key) => {
//     if (
//       key.name === "up" ||
//       key.name === "down" ||
//       key.name === "left" ||
//       key.name === "right"
//     ) {
//       if (!key.ctrl && !key.meta && !key.shift) {
//         return false; // Suppress arrow key events unless combined with Ctrl, Meta, or Shift
//       }
//     }
//   });
// }
