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

export async function initializeMonitoring(
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
      "ethereum_clients",
      executionClient,
      "logs"
    );

    const consensusLogsPath = path.join(
      installDir,
      "ethereum_clients",
      consensusClient,
      "logs"
    );

    const logFilePathExecution = path.join(
      executionLogsPath,
      await getLatestLogFile(executionLogsPath, executionClient)
    );
    const logFilePathConsensus = path.join(
      consensusLogsPath,
      await getLatestLogFile(consensusLogsPath, consensusClient)
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
  const systemStatsGauge = createSystemStatsGauge(grid, screen, installDir);
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

  const { pic, bigText, ipAddressBox } = createHeader(
    grid,
    screen,
    messageForHeader
  );

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

  function fixBottomMargins(screen) {
    try {
      let executionLogBottom = executionLog.top + executionLog.height - 1;
      let executionLogGap = consensusLog.top - executionLogBottom - 1;
      if (executionLogGap != 0) {
        executionLog.height = executionLog.height + executionLogGap;
      }

      let statusBoxBottom = statusBox.top + statusBox.height - 1;
      let statusBoxGap = peerCountGauge.top - statusBoxBottom - 1;
      if (statusBoxGap != 0) {
        statusBox.height = statusBox.height + statusBoxGap;
      }

      let peerCountGaugeBottom = peerCountGauge.top + peerCountGauge.height - 1;
      let peerCountGaugeGap = bandwidthBox.top - peerCountGaugeBottom - 1;
      if (peerCountGaugeGap != 0) {
        peerCountGauge.height = peerCountGauge.height + peerCountGaugeGap;
      }

      let bandwidthBoxBottom = bandwidthBox.top + bandwidthBox.height - 1;
      let bandwidthBoxGap = systemStatsGauge.top - bandwidthBoxBottom - 1;
      if (bandwidthBoxGap != 0) {
        bandwidthBox.height = bandwidthBox.height + bandwidthBoxGap;
      }

      let consensusLogBottom = consensusLog.top + consensusLog.height - 1;
      let consensusLogGap = cpuLine.top - consensusLogBottom - 1;
      if (consensusLogGap != 0) {
        consensusLog.height = consensusLog.height + consensusLogGap;
      }

      if (screen.children.includes(rethStageGauge)) {
        let rethStageGaugeBottom =
          rethStageGauge.top + rethStageGauge.height - 1;
        let rethStageGaugeGap = cpuLine.top - rethStageGaugeBottom - 1;
        if (rethStageGaugeGap != 0) {
          rethStageGauge.height = rethStageGauge.height + rethStageGaugeGap;
        }
      }

      if (screen.children.includes(gethStageGauge)) {
        let gethStageGaugeBottom =
          gethStageGauge.top + gethStageGauge.height - 1;
        let gethStageGaugeGap = cpuLine.top - gethStageGaugeBottom - 1;
        if (gethStageGaugeGap != 0) {
          gethStageGauge.height = gethStageGauge.height + gethStageGaugeGap;
        }
      }

      if (screen.children.includes(chainInfoBox)) {
        let chainInfoBoxBottom = chainInfoBox.top + chainInfoBox.height - 1;
        let chainInfoBoxGap = cpuLine.top - chainInfoBoxBottom - 1;
        if (chainInfoBoxGap != 0) {
          chainInfoBox.height = chainInfoBox.height + chainInfoBoxGap;
        }
      }

      let systemStatsGaugeBottom =
        systemStatsGauge.top + systemStatsGauge.height - 1;
      let systemStatsGaugeGap = cpuLine.top - systemStatsGaugeBottom - 1;
      if (systemStatsGaugeGap != 0) {
        systemStatsGauge.height = systemStatsGauge.height + systemStatsGaugeGap;
      }

      let cpuLineBottom = cpuLine.top + cpuLine.height - 1;
      let cpuLineGap = screen.height - cpuLineBottom - 1;
      if (cpuLineGap != 0) {
        cpuLine.height = cpuLine.height + cpuLineGap;
      }

      let networkLineBottom = networkLine.top + networkLine.height - 1;
      let networkLineGap = screen.height - networkLineBottom - 1;
      if (networkLineGap != 0) {
        networkLine.height = networkLine.height + networkLineGap;
      }
    } catch (error) {
      debugToFile(`fixBottomMargins(): ${error}`, () => {});
    }
  }

  function fixRightMargins(screen) {
    try {
      // let bigTextRight = bigText.left + bigText.width - 1;
      // let bigTextGap = ipAddressBox.left - bigTextRight - 1;
      // if (bigTextGap != 0) {
      //   bigTextGap.width = bigTextGap.width + bigTextGap;
      // }

      let ipAddressBoxRight = ipAddressBox.left + ipAddressBox.width - 1;
      let ipAddressBoxGap = screen.width - ipAddressBoxRight - 1;
      if (ipAddressBoxGap != 0) {
        ipAddressBox.width = ipAddressBox.width + ipAddressBoxGap;
      }

      let statusBoxRight = statusBox.left + statusBox.width - 1;
      let statusBoxGap = screen.width - statusBoxRight - 1;
      if (statusBoxGap != 0) {
        statusBox.width = statusBox.width + statusBoxGap;
      }

      let peerCountGaugeRight = peerCountGauge.left + peerCountGauge.width - 1;
      let peerCountGaugeGap = screen.width - peerCountGaugeRight - 1;
      if (peerCountGaugeGap != 0) {
        peerCountGauge.width = peerCountGauge.width + peerCountGaugeGap;
      }

      let bandwidthBoxRight = bandwidthBox.left + bandwidthBox.width - 1;
      let bandwidthBoxGap = screen.width - bandwidthBoxRight - 1;
      if (bandwidthBoxGap != 0) {
        bandwidthBox.width = bandwidthBox.width + bandwidthBoxGap;
      }

      let systemStatsGaugeRight =
        systemStatsGauge.left + systemStatsGauge.width - 1;
      let systemStatsGaugeGap = screen.width - systemStatsGaugeRight - 1;
      if (systemStatsGaugeGap != 0) {
        systemStatsGauge.width = systemStatsGauge.width + systemStatsGaugeGap;
      }

      let networkLineRight = networkLine.left + networkLine.width - 1;
      let networkLineGap = screen.width - networkLineRight - 1;
      if (networkLineGap != 0) {
        networkLine.width = networkLine.width + networkLineGap;
      }

      // let networkLineRight = networkLine.left + networkLine.width - 1;
      // let networkLineGap = screen.width - networkLineRight - 1;

      // if (networkLineGap !== 1) {
      //   // Adjust the width to ensure the right margin is exactly 1 character
      //   networkLine.width = networkLine.width + (networkLineGap - 1);
      // }
    } catch (error) {
      debugToFile(`fixRightMargins(): ${error}`, () => {});
    }
  }

  fixBottomMargins(screen);
  fixRightMargins(screen);

  screen.render();

  screen.on("resize", () => {
    fixBottomMargins(screen);
    fixRightMargins(screen);

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
