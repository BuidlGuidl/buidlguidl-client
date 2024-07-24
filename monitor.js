import path from "path";
import os from "os";
import blessed from "blessed";
import contrib from "blessed-contrib";
// import { setupDebugLogging } from "./helpers.js";

import {
  loadProgress,
  getLatestLogFile,
} from "./monitor_components/helperFunctions.js";

import { createDiskGauge } from "./monitor_components/diskGauge.js";
import { createMemGauge } from "./monitor_components/memGauge.js";
import { createCpuLine } from "./monitor_components/cpuLine.js";
import { createNetworkLine } from "./monitor_components/networkLine.js";
import { createStateDlGauge } from "./monitor_components/stateDlGauge.js";
import { createHeaderDlGauge } from "./monitor_components/headerDlGauge.js";
import { createChainDlGauge } from "./monitor_components/chainDlGauge.js";
import { createExecutionLog } from "./monitor_components/executionLog.js";
import { createStatusBox } from "./monitor_components/statusBox.js";
import {
  createBandwidthBox,
  setBandwidthBox,
  startBandwidthMonitoring,
} from "./monitor_components/bandwidthGauge.js";

import { setupLogStreaming } from "./monitor_components/updateLogicExecution.js";

import {
  createConsensusLog,
  updateConsensusClientInfo,
} from "./monitor_components/consensusLog.js";
import { createHeader } from "./monitor_components/header.js";

const CONFIG = {
  installDir: os.homedir(),
  executionClient: "geth",
  consensusClient: "prysm",
  logDirs: {
    geth: path.join(os.homedir(), "bgnode", "geth", "logs"),
    prysm: path.join(os.homedir(), "bgnode", "prysm", "logs"),
  },
  debugLogPath: path.join(os.homedir(), "bgnode", "debugMonitor.log"),
};

export function initializeMonitoring(
  messageForHeader,
  gethVer,
  rethVer,
  prysmVer,
  runsClient
) {
  try {
    const progress = loadProgress();

    // setupDebugLogging(CONFIG.debugLogPath);

    const { screen, components } = setupUI(
      progress,
      messageForHeader,
      gethVer,
      rethVer,
      prysmVer,
      runsClient
    );

    const logFilePath = path.join(
      CONFIG.logDirs.geth,
      getLatestLogFile(CONFIG.logDirs.geth, CONFIG.executionClient)
    );
    const logFilePathConsensus = path.join(
      CONFIG.logDirs.prysm,
      getLatestLogFile(CONFIG.logDirs.prysm, CONFIG.consensusClient)
    );

    console.log(
      `Monitoring ${CONFIG.executionClient} logs from: ${logFilePath}`
    );
    console.log(
      `Monitoring ${CONFIG.consensusClient} logs from: ${logFilePathConsensus}`
    );

    updateConsensusClientInfo(
      logFilePathConsensus,
      components.consensusLog,
      screen
    );

    setupLogStreaming(
      logFilePath,
      components.executionLog,
      screen,
      components.headerDlGauge,
      components.stateDlGauge,
      components.chainDlGauge
    );
  } catch (error) {
    console.error("Error initializing monitoring:", error);
  }
}

function setupUI(
  progress,
  messageForHeader,
  gethVer,
  rethVer,
  prysmVer,
  runsClient
) {
  const screen = blessed.screen();
  suppressMouseOutput(screen);
  const grid = new contrib.grid({ rows: 9, cols: 9, screen: screen });

  const executionLog = createExecutionLog(grid, gethVer, rethVer);
  const consensusLog = createConsensusLog(grid, prysmVer);
  const storageGauge = createDiskGauge(grid, screen);
  const memGauge = createMemGauge(grid, screen);
  const cpuLine = createCpuLine(grid, screen);
  const networkLine = createNetworkLine(grid, screen);
  const headerDlGauge = createHeaderDlGauge(grid);
  const stateDlGauge = createStateDlGauge(grid);
  const chainDlGauge = createChainDlGauge(grid);
  const statusBox = createStatusBox(grid, screen);
  const bandwidthBox = createBandwidthBox(grid);
  const header = createHeader(grid, screen, messageForHeader);

  screen.append(executionLog);
  screen.append(consensusLog);
  screen.append(cpuLine);
  screen.append(networkLine);
  screen.append(memGauge);
  screen.append(storageGauge);
  screen.append(headerDlGauge);
  screen.append(stateDlGauge);
  screen.append(chainDlGauge);
  screen.append(statusBox);
  screen.append(bandwidthBox);

  setBandwidthBox(bandwidthBox);
  startBandwidthMonitoring(screen);

  if (progress) {
    headerDlGauge.setPercent(progress.headerDlProgress);
    stateDlGauge.setPercent(progress.stateDlProgress);
    chainDlGauge.setPercent(progress.chainDlProgress);
  }

  screen.render();

  screen.key(["escape", "q", "C-c"], function (ch, key) {
    if (runsClient) {
      process.kill(process.pid, "SIGUSR2");
      console.log("Clients exited from monitor");
    } else {
      console.log("not working", runsClient);
      process.exit(0);
    }
    screen.destroy();
  });

  return {
    screen,
    components: {
      executionLog,
      consensusLog,
      headerDlGauge,
      stateDlGauge,
      chainDlGauge,
    },
  };
}

function suppressMouseOutput(screen) {
  screen.on("element mouse", (el, data) => {
    if (data.button === "mouseup" || data.button === "mousedown") {
      return false;
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
        return false;
      }
    }
  });
}

// initializeMonitoring();
