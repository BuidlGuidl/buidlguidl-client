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
import { createDiskLine } from "./monitor_components/diskLine.js";
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
      components.gethStageGauge
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
    debugToFile(`Error initializing monitoring: ${error}`);
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
  // const grid = new contrib.grid({ rows: 9, cols: 10, screen: screen });
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

  const executionLog = createExecutionLog(grid, executionClientLabel, screen);
  const consensusLog = createConsensusLog(grid, consensusClientLabel, screen);
  const systemStatsGauge = createSystemStatsGauge(grid, installDir);
  const peerCountGauge = createPeerCountGauge(grid);
  const cpuLine = createCpuLine(grid, screen);
  const networkLine = createNetworkLine(grid, screen);
  const diskLine = createDiskLine(grid, screen, installDir);
  const statusBox = createStatusBox(grid);
  const bandwidthBox = createBandwidthBox(grid);
  const chainInfoBox = createChainInfoBox(grid);

  let gethStageGauge, rethStageGauge;

  if (executionClientGlobal == "geth") {
    gethStageGauge = createGethStageGauge(grid);
  } else if (executionClientGlobal == "reth") {
    rethStageGauge = createRethStageGauge(grid);
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
  screen.append(diskLine);
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

  async function updateChainWidgets(statusBox, chainInfoBox, screen) {
    try {
      // Run both update functions concurrently
      await Promise.all([
        updateStatusBox(statusBox),
        updateChainInfoBox(chainInfoBox, screen),
      ]);

      // Render the screen after both updates are complete
      screen.render();
    } catch (error) {
      debugToFile(`updateWidgets(): ${error}`);
    }
  }

  setInterval(() => updateBandwidthBox(screen), 2000);
  setInterval(() => updateChainWidgets(statusBox, chainInfoBox, screen), 5000);

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

      let diskLineBottom = diskLine.top + diskLine.height - 1;
      let diskLineGap = screen.height - diskLineBottom - 1;
      if (diskLineGap != 0) {
        diskLine.height = diskLine.height + diskLineGap;
      }
    } catch (error) {
      debugToFile(`fixBottomMargins(): ${error}`);
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

      if (screen.children.includes(rethStageGauge)) {
        let rethStageGaugeRight =
          rethStageGauge.left + rethStageGauge.width - 1;
        let rethStageGaugeGap = peerCountGauge.left - rethStageGaugeRight - 1;
        if (rethStageGaugeGap != 0) {
          rethStageGauge.width = rethStageGauge.width + rethStageGaugeGap;
        }
      }

      if (screen.children.includes(gethStageGauge)) {
        let gethStageGaugeRight =
          gethStageGauge.left + gethStageGauge.width - 1;
        let gethStageGaugeGap = peerCountGauge.left - gethStageGaugeRight - 1;
        if (gethStageGaugeGap != 0) {
          gethStageGauge.width = gethStageGauge.width + gethStageGaugeGap;
        }
      }

      if (screen.children.includes(chainInfoBox)) {
        let chainInfoBoxRight = chainInfoBox.left + chainInfoBox.width - 1;
        let chainInfoBoxGap = peerCountGauge.left - chainInfoBoxRight - 1;
        if (chainInfoBoxGap != 0) {
          chainInfoBox.width = chainInfoBox.width + chainInfoBoxGap;
        }
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

      let cpuLineRight = cpuLine.left + cpuLine.width - 1;
      let cpuLineGap = networkLine.left - cpuLineRight - 1;
      if (cpuLineGap != 0) {
        cpuLine.width = cpuLine.width + cpuLineGap;
      }

      let networkLineRight = networkLine.left + networkLine.width - 1;
      let networkLineGap = diskLine.left - networkLineRight - 1;
      if (networkLineGap != 0) {
        networkLine.width = networkLine.width + networkLineGap;
      }

      let diskLineRight = diskLine.left + diskLine.width - 1;
      let diskLineGap = screen.width - diskLineRight - 1;
      if (diskLineGap != 0) {
        diskLine.width = diskLine.width + diskLineGap;
      }
    } catch (error) {
      debugToFile(`fixRightMargins(): ${error}`);
    }
  }

  screen.render();

  setTimeout(() => {
    fixBottomMargins(screen);
    fixRightMargins(screen);

    cpuLine.emit("attach");
    networkLine.emit("attach");
    diskLine.emit("attach");

    screen.render();
  }, 250);

  screen.on("resize", () => {
    fixBottomMargins(screen);
    fixRightMargins(screen);

    cpuLine.emit("attach");
    networkLine.emit("attach");
    diskLine.emit("attach");
    executionLog.emit("attach");
    consensusLog.emit("attach");

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

async function updateChainInfoBox(chainInfoBox, screen) {
  try {
    if (screen.children.includes(chainInfoBox)) {
      await populateChainInfoBox();
    }
  } catch (error) {
    debugToFile(`updateChainInfoBox(): ${error}`);
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
