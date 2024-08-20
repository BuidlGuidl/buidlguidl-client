import path from "path";
import os from "os";
import blessed from "blessed";
import contrib from "blessed-contrib";
import { debugToFile } from "./helpers.js";

import {
  loadProgress,
  getLatestLogFile,
} from "./monitor_components/helperFunctions.js";

import { createSystemStatsGauge } from "./monitor_components/systemStatsGauge.js";
import { createPeerCountGauge } from "./monitor_components/peerCountGauge.js";
import { createCpuLine } from "./monitor_components/cpuLine.js";
import { createNetworkLine } from "./monitor_components/networkLine.js";
import { createGethStateDlGauge } from "./monitor_components/gethStateDlGauge.js";
import { createGethHeaderDlGauge } from "./monitor_components/gethHeaderDlGauge.js";
import { createGethChainDlGauge } from "./monitor_components/gethChainDlGauge.js";
import { createRethStageGauge } from "./monitor_components/rethStageGauge.js";
import { createChainInfoBox } from "./monitor_components/chainInfoBox.js";
import { createExecutionLog } from "./monitor_components/executionLog.js";
import { createStatusBox } from "./monitor_components/statusBox.js";
import {
  createBandwidthBox,
  setBandwidthBox,
  startBandwidthMonitoring,
  updateBandwidthBox,
} from "./monitor_components/bandwidthGauge.js";

import {
  setupLogStreaming,
  showHideRethWidgets,
} from "./monitor_components/updateLogicExecution.js";

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
    let progress;

    if (executionClient == "geth") {
      progress = loadProgress();
    }

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
      components.gethHeaderDlGauge,
      components.gethStateDlGauge,
      components.gethChainDlGauge,
      components.rethStageGauge,
      components.chainInfoBox
    );

    setInterval(() => {
      showHideRethWidgets(
        screen,
        components.rethStageGauge,
        components.chainInfoBox
      );
    }, 5000);
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
  // const grid = new contrib.grid({ rows: 9, cols: 9, screen: screen });
  const grid = new contrib.grid({ rows: 9, cols: 10, screen: screen });

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

  const executionLog = createExecutionLog(grid, screen, executionClientLabel);
  const consensusLog = createConsensusLog(grid, screen, consensusClientLabel);
  const systemStatsGauge = createSystemStatsGauge(grid, screen);
  const peerCountGauge = createPeerCountGauge(grid, screen);
  const cpuLine = createCpuLine(grid, screen);
  const networkLine = createNetworkLine(grid, screen);
  const statusBox = createStatusBox(grid, screen);
  const bandwidthBox = createBandwidthBox(grid, screen);

  let gethHeaderDlGauge,
    gethStateDlGauge,
    gethChainDlGauge,
    rethStageGauge,
    chainInfoBox;
  // rethOverallSyncGauge;

  if (executionClientGlobal == "geth") {
    gethHeaderDlGauge = createGethHeaderDlGauge(grid, screen);
    gethStateDlGauge = createGethStateDlGauge(grid, screen);
    gethChainDlGauge = createGethChainDlGauge(grid, screen);
  } else if (executionClientGlobal == "reth") {
    rethStageGauge = createRethStageGauge(grid, screen);
    chainInfoBox = createChainInfoBox(grid, screen);
  }

  createHeader(grid, screen, messageForHeader);

  screen.append(executionLog);
  screen.append(consensusLog);
  screen.append(cpuLine);
  screen.append(networkLine);
  screen.append(systemStatsGauge);
  screen.append(peerCountGauge);
  screen.append(statusBox);
  screen.append(bandwidthBox);
  if (executionClientGlobal == "geth") {
    screen.append(gethHeaderDlGauge);
    screen.append(gethStateDlGauge);
    screen.append(gethChainDlGauge);
  } else if (executionClientGlobal == "reth") {
    screen.append(rethStageGauge);
  }

  setBandwidthBox(bandwidthBox);
  startBandwidthMonitoring(screen);

  setInterval(() => updateBandwidthBox(screen), 2000);

  if (executionClientGlobal == "geth" && progress) {
    gethHeaderDlGauge.setPercent(progress.headerDlProgress);
    gethStateDlGauge.setPercent(progress.stateDlProgress);
    gethChainDlGauge.setPercent(progress.chainDlProgress);
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
      gethHeaderDlGauge,
      gethStateDlGauge,
      gethChainDlGauge,
      rethStageGauge,
      chainInfoBox,
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
