import path from "path";
import os from "os";
import blessed from "blessed";
import contrib from "blessed-contrib";
// import { setupDebugLogging } from "./helpers.js";
import { debugToFile } from "./helpers.js";

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
  updateBandwidthBox,
} from "./monitor_components/bandwidthGauge.js";

import { setupLogStreaming } from "./monitor_components/updateLogicExecution.js";

import {
  createConsensusLog,
  updateConsensusClientInfo,
} from "./monitor_components/consensusLog.js";
import { createHeader } from "./monitor_components/header.js";

let executionClientGlobal;
let consensusClientGlobal;

export function initializeMonitoring(
  messageForHeader,
  executionClient,
  consensusClient,
  gethVer,
  rethVer,
  prysmVer,
  lighthouseVer,
  runsClient
) {
  try {
    executionClientGlobal = executionClient;
    consensusClientGlobal = consensusClient;

    const progress = loadProgress();

    // setupDebugLogging(CONFIG.debugLogPath);

    const { screen, components } = setupUI(
      progress,
      messageForHeader,
      gethVer,
      rethVer,
      prysmVer,
      lighthouseVer,
      runsClient
    );

    const executionLogsPath = path.join(
      os.homedir(),
      "bgnode",
      executionClient,
      "logs"
    );

    const consensusLogsPath = path.join(
      os.homedir(),
      "bgnode",
      consensusClient,
      "logs"
    );

    const logFilePathExecution = path.join(
      executionLogsPath,
      getLatestLogFile(executionLogsPath, executionClient)
    );
    const logFilePathConsensus = path.join(
      consensusLogsPath,
      getLatestLogFile(consensusLogsPath, consensusClient)
    );

    debugToFile(
      `Monitoring ${executionClient} logs from: ${logFilePathExecution}`,
      () => {}
    );
    debugToFile(
      `Monitoring ${consensusClient} logs from: ${logFilePathConsensus}`,
      () => {}
    );

    updateConsensusClientInfo(
      logFilePathConsensus,
      components.consensusLog,
      screen
    );

    setupLogStreaming(
      logFilePathExecution,
      components.executionLog,
      screen,
      components.headerDlGauge,
      components.stateDlGauge,
      components.chainDlGauge
    );
  } catch (error) {
    debugToFile(`Error initializing monitoring: ${error}`, () => {});
  }
}

function setupUI(
  progress,
  messageForHeader,
  gethVer,
  rethVer,
  prysmVer,
  lighthouseVer,
  runsClient
) {
  const screen = blessed.screen();
  suppressMouseOutput(screen);
  const grid = new contrib.grid({ rows: 9, cols: 9, screen: screen });

  let executionClientLabel;
  let consensusClientLabel;

  if (executionClientGlobal == "geth") {
    executionClientLabel = `Geth v${gethVer}`;
  } else if (executionClientGlobal == "reth") {
    executionClientLabel = `Reth v${rethVer}`;
  }

  if (consensusClientGlobal == "prysm") {
    consensusClientLabel = `Prysm v${prysmVer}`;
  } else if (consensusClientGlobal == "lighthouse") {
    consensusClientLabel = `Lighthouse v${lighthouseVer}`;
  }

  const executionLog = createExecutionLog(grid, executionClientLabel);
  const consensusLog = createConsensusLog(grid, consensusClientLabel);
  const storageGauge = createDiskGauge(grid, screen);
  const memGauge = createMemGauge(grid, screen);
  const cpuLine = createCpuLine(grid, screen);
  const networkLine = createNetworkLine(grid, screen);
  const headerDlGauge = createHeaderDlGauge(grid);
  const stateDlGauge = createStateDlGauge(grid);
  const chainDlGauge = createChainDlGauge(grid);
  const statusBox = createStatusBox(grid, screen);
  const bandwidthBox = createBandwidthBox(grid);

  createHeader(grid, screen, messageForHeader);

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

  setInterval(() => updateBandwidthBox(screen), 2000);

  if (progress) {
    headerDlGauge.setPercent(progress.headerDlProgress);
    stateDlGauge.setPercent(progress.stateDlProgress);
    chainDlGauge.setPercent(progress.chainDlProgress);
  }

  screen.render();

  screen.on("resize", () => {
    cpuLine.emit("attach");
    networkLine.emit("attach");

    screen.render();
  });

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
