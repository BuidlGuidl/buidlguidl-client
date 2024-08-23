import path from "path";
import blessed from "blessed";
import contrib from "blessed-contrib";
import { debugToFile } from "./helpers.js";
import { populateChainInfoBox } from "./monitor_components/chainInfoBox.js";
import { updateStatusBox } from "./monitor_components/statusBox.js";
import { createSystemStatsGauge } from "./monitor_components/systemStatsGauge.js";
import { createPeerCountGauge } from "./monitor_components/peerCountGauge.js";
import { createCpuLine } from "./monitor_components/cpuLine.js";
import { createNetworkLine } from "./monitor_components/networkLine.js";
import { createRethStageGauge } from "./monitor_components/rethStageGauge.js";
import { createGethStageGauge } from "./monitor_components/gethStageGauge.js";
import { createChainInfoBox } from "./monitor_components/chainInfoBox.js";
import { createExecutionLog } from "./monitor_components/executionLog.js";
import { createStatusBox } from "./monitor_components/statusBox.js";
import { installDir } from "./commandLineOptions.js";

import {
  loadProgress,
  getLatestLogFile,
} from "./monitor_components/helperFunctions.js";

import {
  createBandwidthBox,
  setBandwidthBox,
  startBandwidthMonitoring,
  updateBandwidthBox,
} from "./monitor_components/bandwidthGauge.js";

import {
  setupLogStreaming,
  showHideRethWidgets,
  showHideGethWidgets,
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
      installDir,
      "bgnode",
      executionClient,
      "logs"
    );

    const consensusLogsPath = path.join(
      installDir,
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
      components.rethStageGauge,
      components.gethStageGauge,
      components.chainInfoBox
    );

    if (executionClient == "reth") {
      setInterval(() => {
        showHideRethWidgets(
          screen,
          components.rethStageGauge,
          components.chainInfoBox
        );
      }, 5000);
    } else if (executionClient == "geth") {
      setInterval(() => {
        showHideGethWidgets(
          screen,
          components.gethStageGauge,
          components.chainInfoBox
        );
      }, 5000);
    }
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
  const chainInfoBox = createChainInfoBox(grid, screen);

  let gethStageGauge, rethStageGauge;

  if (executionClientGlobal == "geth") {
    gethStageGauge = createGethStageGauge(grid, screen);
  } else if (executionClientGlobal == "reth") {
    rethStageGauge = createRethStageGauge(grid, screen);
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
    screen.append(gethStageGauge);
  } else if (executionClientGlobal == "reth") {
    screen.append(rethStageGauge);
  }

  setBandwidthBox(bandwidthBox);
  startBandwidthMonitoring(screen);

  setInterval(() => updateBandwidthBox(screen), 2000);
  setInterval(() => updateStatusBox(statusBox, screen), 5000);
  setInterval(() => updateChainInfoBox(chainInfoBox, screen), 5000);

  screen.render();

  screen.on("resize", () => {
    cpuLine.emit("attach");
    networkLine.emit("attach");

    screen.render();
  });

  // screen.on("resize", () => {
  //   // debugToFile(`screen.height: ${screen.height}`, () => {});

  //   // debugToFile(`executionLog.height: ${executionLog.height}`, () => {});
  //   // debugToFile(`executionLog.top: ${executionLog.top}`, () => {});
  //   // debugToFile(`executionLog.bottom: ${executionLog.bottom}`, () => {});

  //   // debugToFile(
  //   //   `consensusLog.top - executionLog.bottom: ${
  //   //     consensusLog.top - executionLog.bottom
  //   //   }`,
  //   //   () => {}
  //   // );

  //   debugToFile(
  //     `executionLog.bottom - consensusLog.top: ${
  //       executionLog.bottom - consensusLog.top
  //     }`,
  //     () => {}
  //   );
  // });

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
      gethStageGauge,
      rethStageGauge,
      chainInfoBox,
    },
  };
}

function updateChainInfoBox(chainInfoBox, screen) {
  try {
    if (screen.children.includes(chainInfoBox)) {
      populateChainInfoBox();
      screen.render();
    }
  } catch (error) {
    debugToFile(`updateChainInfoBox(): ${error}`, () => {});
  }
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
