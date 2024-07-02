const path = require("path");
const os = require("os");
const blessed = require("blessed");
const contrib = require("blessed-contrib");
const si = require("systeminformation");
const {setupDebugLogging} = require("./helpers")

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
  updateConsensusClientInfo,
} = require("./monitor_components/consensusLog");
const { createHeader } = require("./monitor_components/header");


const CONFIG = {
  installDir: os.homedir(),
  executionClient: 'geth',
  consensusClient: 'prysm',
  logDirs: {
    geth: path.join(os.homedir(), "bgnode", "geth", "logs"),
    prysm: path.join(os.homedir(), "bgnode", "prysm", "logs"),
  },
  debugLogPath: path.join(os.homedir(), "bgnode", "debugMonitor.log"),
};

// /// to prevent showing console.logs in the terminal when blessed screen is running
// const originalConsoleLog = console.log;
// const originalConsoleError = console.error;

// function suppressLogs() {
//   console.log = () => {};
//   console.error = () => {};
// }

// function restoreLogs() {
//   console.log = originalConsoleLog;
//   console.error = originalConsoleError;
// }

function initializeMonitoring() {
  try {    
    const progress = loadProgress();

    setupDebugLogging(CONFIG.debugLogPath);

    // suppressLogs();

    const { screen, components } = setupUI(progress);

    const logFilePath = path.join(CONFIG.logDirs.geth, getLatestLogFile(CONFIG.logDirs.geth, CONFIG.executionClient));
    const logFilePathConsensus = path.join(CONFIG.logDirs.prysm, getLatestLogFile(CONFIG.logDirs.prysm, CONFIG.consensusClient));

    console.log(`Monitoring ${CONFIG.executionClient} logs from: ${logFilePath}`);
    console.log(`Monitoring ${CONFIG.consensusClient} logs from: ${logFilePathConsensus}`);

    setupLogStreaming(
      logFilePath,
      components.executionLog,
      screen,
      components.headerDlGauge,
      components.stateDlGauge,
      components.chainDlGauge,
      components.peerCountGauge
    );

    updateConsensusClientInfo(logFilePathConsensus, components.consensusLog, screen);
  } catch (error) {
    console.error("Error initializing monitoring:", error);
  }
}

function setupUI(progress) {
  const screen = blessed.screen();
  suppressMouseOutput(screen);
  const grid = new contrib.grid({ rows: 9, cols: 9, screen: screen });

  const executionLog = createExecutionLog(grid);
  const consensusLog = createConsensusLog(grid);
  const peerCountGauge = createPeerCountLcd(grid, screen);
  const storageGauge = createDiskGauge(grid, screen);
  const memGauge = createMemGauge(grid, screen);
  const cpuLine = createCpuLine(grid, screen);
  const networkLine = createNetworkLine(grid, screen);
  const headerDlGauge = createHeaderDlGauge(grid);
  const stateDlGauge = createStateDlGauge(grid);
  const chainDlGauge = createChainDlGauge(grid);
  const header = createHeader(grid, screen);

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
  // screen.append(header);

  peerCountGauge.setDisplay("0");

  if (progress) {
    headerDlGauge.setPercent(progress.headerDlProgress);
    stateDlGauge.setPercent(progress.stateDlProgress);
    chainDlGauge.setPercent(progress.chainDlProgress);
  }

  screen.render();

  screen.key(["escape", "q", "C-c"], function (ch, key) {
    process.kill(process.pid, 'SIGUSR2');
    // screen.destroy();
    // restoreLogs();
  });

  return {
    screen,
    components: {
      executionLog,
      consensusLog,
      peerCountGauge,
      headerDlGauge,
      stateDlGauge,
      chainDlGauge
    },
  };
}

module.exports = { initializeMonitoring };

function suppressMouseOutput(screen) {
  screen.on("element mouse", (el, data) => {
    if (data.button === "mouseup" || data.button === "mousedown") {
      return false; // Suppress mouse up/down events
    }
  });

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

initializeMonitoring();
