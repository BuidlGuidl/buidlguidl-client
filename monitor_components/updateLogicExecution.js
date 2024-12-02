import fs from "fs";
import readline from "readline";
import {
  loadProgress,
  saveProgress,
  formatLogLines,
} from "./helperFunctions.js";
import { debugToFile } from "../helpers.js";
import { executionClient, owner } from "../commandLineOptions.js";
import { mainnetClient, localClient, isSyncing } from "./viemClients.js";
import { exec } from "child_process";
import { populateRethStageGauge } from "./rethStageGauge.js";
import { populateGethStageGauge } from "./gethStageGauge.js";
import { checkIn } from "../web_socket_connection/webSocketConnection.js";
import fetch from "node-fetch";
import { getDiskUsage } from "../getSystemStats.js";
import { populateChainInfoBox } from "./chainInfoBox.js";
import { updateStatusBox } from "./statusBox.js";
import { screen, statusBox, chainInfoBox } from "../monitor.js";
import { updateBandwidthBox } from "./bandwidthGauge.js";

const progress = loadProgress();
let gethStageProgress = [
  progress.headerDlProgress,
  progress.chainDlProgress,
  progress.stateDlProgress,
];

function stripAnsiCodes(input) {
  return input.replace(
    /[\u001b\u009b][[()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nq-uy=><~])/g,
    ""
  );
}

function saveHeaderDlProgress(line) {
  line = stripAnsiCodes(line);

  if (line.includes("Syncing beacon headers")) {
    const headerDlMatch = line.match(
      /downloaded=([\d,]+)\s+left=([\d,]+)\s+eta=([^\s]+)/
    );

    const headerDlDownloaded = parseInt(headerDlMatch[1].replace(/,/g, ""), 10);
    const headerDlLeft = parseInt(headerDlMatch[2].replace(/,/g, ""), 10);
    const headerDlProgress =
      headerDlDownloaded / (headerDlDownloaded + headerDlLeft);

    gethStageProgress[0] = headerDlProgress;

    progress.headerDlProgress = headerDlProgress;
    saveProgress(progress);
  }
}

function saveStateDlProgress(line) {
  if (line.includes("Syncing: chain download in progress")) {
    const chainSyncMatch = line.match(/synced=([\d.]+)%/);
    const chainDlProgress = parseFloat(chainSyncMatch[1]) / 100;

    gethStageProgress[1] = chainDlProgress;

    progress.chainDlProgress = chainDlProgress;
    saveProgress(progress);
  }
}

function saveChainDlProgress(line) {
  if (line.includes("Syncing: state download in progress")) {
    const stateSyncMatch = line.match(/synced=([\d.]+)%/);
    const stateDlProgress = parseFloat(stateSyncMatch[1]) / 100;

    gethStageProgress[2] = stateDlProgress;

    progress.stateDlProgress = stateDlProgress;
    saveProgress(progress);
  }
}

let globalLine = "";

export function setupLogStreaming(
  logFilePath,
  executionLog,
  screen,
  gethStageGauge
) {
  let logBuffer = [];
  let lastSize = 0;
  let lastKnownBlockNumber = 0;

  const ensureBufferFillsWidget = () => {
    const visibleHeight = executionLog.height - 2; // Account for border

    // Only pad if the buffer is already full, otherwise, just ensure it doesn't exceed the height
    if (logBuffer.length >= visibleHeight) {
      while (logBuffer.length < visibleHeight) {
        logBuffer.unshift(""); // Add empty lines at the start if needed
      }
    }

    if (logBuffer.length > visibleHeight) {
      logBuffer = logBuffer.slice(-visibleHeight); // Trim buffer to fit
    }
  };

  const updateLogContent = async () => {
    try {
      const stats = fs.statSync(logFilePath);
      const newSize = stats.size;

      if (newSize > lastSize) {
        const newStream = fs.createReadStream(logFilePath, {
          encoding: "utf8",
          start: lastSize,
          end: newSize,
        });

        newStream.on("error", (err) => {
          debugToFile(`Error creating read stream: ${err}`);
          // Attempt to recover by resetting lastSize
          lastSize = 0;
        });

        const newRl = readline.createInterface({
          input: newStream,
          output: process.stdout,
          terminal: false,
        });

        newRl.on("line", async (line) => {
          globalLine = line;
          logBuffer.push(formatLogLines(line));

          ensureBufferFillsWidget();

          executionLog.setContent(logBuffer.join("\n"));

          if (executionClient == "geth") {
            if (screen.children.includes(gethStageGauge)) {
              populateGethStageGauge(gethStageProgress);
            }

            saveHeaderDlProgress(line);
            saveStateDlProgress(line);
            saveChainDlProgress(line);
          }

          // Check for new block
          const blockNumberMatch = line.match(/block=(\d+)/);
          if (blockNumberMatch) {
            const currentBlockNumber = parseInt(blockNumberMatch[1], 10);
            if (currentBlockNumber > lastKnownBlockNumber) {
              lastKnownBlockNumber = currentBlockNumber;
              try {
                await checkIn(); // Call checkIn when a new block is found
              } catch (error) {
                debugToFile(`Error calling checkIn: ${error}`);
              }
            }
          }

          screen.render();
        });

        newRl.on("close", () => {
          lastSize = newSize;
        });

        newRl.on("error", (err) => {
          debugToFile(`Error reading log file: ${err}`);
          // Attempt to recover by resetting lastSize
          lastSize = 0;
        });
      }
    } catch (error) {
      debugToFile(`Error accessing log file: ${error}`);
      // Attempt to recover by resetting lastSize
      lastSize = 0;
    }
  };

  // Initial read to load existing content
  updateLogContent();

  // Watch for file changes
  fs.watchFile(logFilePath, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      updateLogContent();
    }
  });
}

let statusMessage = "INITIALIZING...";

async function getRethSyncMetrics() {
  return new Promise((resolve) => {
    exec(
      "curl -s 127.0.0.1:9001 | grep -E '^reth_sync_entities_processed|^reth_sync_entities_total'",
      (error, stdout, stderr) => {
        if (error || stderr) {
          // If there's an error (likely because Reth is no longer running), return an empty string
          resolve("");
        } else {
          resolve(stdout.trim()); // Return the output as a string
        }
      }
    );
  });
}

let largestToBlock = 0;
let headersPercent = 0;

let stagePercentages = {
  headersPercent: 0,
  bodiesPercent: 0,
  senderRecoveryPercent: 0,
  executionPercent: 0,
  merkleUnwindPercent: 0,
  accountHashingPercent: 0,
  storageHashingPercent: 0,
  merkleExecutePercent: 0,
  transactionLookupPercent: 0,
  indexStorageHistoryPercent: 0,
  indexAccountHistoryPercent: 0,
  finishPercent: 0,
};

async function parseAndPopulateRethMetrics() {
  const rethSyncMetrics = await getRethSyncMetrics();

  // If metrics are empty (likely because Reth is shutting down), don't process further
  if (!rethSyncMetrics) {
    return;
  }

  // Handle header progress [1/12]
  const headersProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="Headers"\} (\d+)/
  );
  const headersTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="Headers"\} (\d+)/
  );

  if (headersProcessedMatch && headersTotalMatch) {
    const headersProcessed = parseInt(headersProcessedMatch[1], 10);
    const headersTotal = parseInt(headersTotalMatch[1], 10);

    if (headersProcessed === 0 && headersTotal === 0) {
      if (
        globalLine.includes("Received headers") &&
        globalLine.includes("to_block=")
      ) {
        const toBlock = parseInt(globalLine.match(/to_block=(\d+)/)[1], 10);

        // debugToFile(`toBlock: ${toBlock}`);

        if (toBlock > largestToBlock) {
          largestToBlock = toBlock;
        }

        // debugToFile(`largestToBlock: ${largestToBlock}`);

        headersPercent = (largestToBlock - toBlock) / largestToBlock;
      }
    } else if (headersProcessed === headersTotal && headersTotal > 0) {
      headersPercent = 1;
    }
  }

  // Handle bodies progress [2/12]
  const bodiesProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="Bodies"\} (\d+)/
  );
  const bodiesTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="Bodies"\} (\d+)/
  );

  let bodiesPercent = 0;
  if (bodiesProcessedMatch && bodiesTotalMatch) {
    const bodiesProcessed = parseInt(bodiesProcessedMatch[1], 10);
    const bodiesTotal = parseInt(bodiesTotalMatch[1], 10);

    if (bodiesProcessed > 0) {
      bodiesPercent = bodiesProcessed / bodiesTotal;
    }
  }

  // Handle Sender Recovery progress [3/12]
  const senderRecoveryProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="SenderRecovery"\} (\d+)/
  );
  const senderRecoveryTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="SenderRecovery"\} (\d+)/
  );

  let senderRecoveryPercent = 0;
  if (senderRecoveryProcessedMatch && senderRecoveryTotalMatch) {
    const senderRecoveryProcessed = parseInt(
      senderRecoveryProcessedMatch[1],
      10
    );
    const senderRecoveryTotal = parseInt(senderRecoveryTotalMatch[1], 10);

    if (senderRecoveryProcessed > 0) {
      senderRecoveryPercent = senderRecoveryProcessed / senderRecoveryTotal;
    }
  }

  // Handle Execution progress [4/12]
  const executionProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="Execution"\} (\d+)/
  );
  const executionTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="Execution"\} (\d+)/
  );

  let executionPercent = 0;
  if (executionProcessedMatch && executionTotalMatch) {
    const executionProcessed = parseInt(executionProcessedMatch[1], 10);
    const executionTotal = parseInt(executionTotalMatch[1], 10);

    if (executionProcessed > 0) {
      executionPercent = executionProcessed / executionTotal;
    }
  }

  // Handle Merkle Unwind progress [5/12]
  const merkleUnwindProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="MerkleUnwind"\} (\d+)/
  );
  const merkleUnwindTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="MerkleUnwind"\} (\d+)/
  );

  let merkleUnwindPercent = 0;
  if (merkleUnwindProcessedMatch && merkleUnwindTotalMatch) {
    const merkleUnwindProcessed = parseInt(merkleUnwindProcessedMatch[1], 10);
    const merkleUnwindTotal = parseInt(merkleUnwindTotalMatch[1], 10);

    if (merkleUnwindProcessed > 0) {
      merkleUnwindPercent = merkleUnwindProcessed / merkleUnwindTotal;
    }
  }

  // Handle Account Hashing progress [6/12]
  const accountHashingProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="AccountHashing"\} (\d+)/
  );
  const accountHashingTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="AccountHashing"\} (\d+)/
  );

  let accountHashingPercent = 0;
  if (accountHashingProcessedMatch && accountHashingTotalMatch) {
    const accountHashingProcessed = parseInt(
      accountHashingProcessedMatch[1],
      10
    );
    const accountHashingTotal = parseInt(accountHashingTotalMatch[1], 10);

    if (accountHashingProcessed > 0) {
      accountHashingPercent = accountHashingProcessed / accountHashingTotal;
    }
  }

  // Handle Storage Hashing progress [7/12]
  const storageHashingProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="StorageHashing"\} (\d+)/
  );
  const storageHashingTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="StorageHashing"\} (\d+)/
  );

  let storageHashingPercent = 0;
  if (storageHashingProcessedMatch && storageHashingTotalMatch) {
    const storageHashingProcessed = parseInt(
      storageHashingProcessedMatch[1],
      10
    );
    const storageHashingTotal = parseInt(storageHashingTotalMatch[1], 10);

    if (storageHashingProcessed > 0) {
      storageHashingPercent = storageHashingProcessed / storageHashingTotal;
    }
  }

  // Handle Merkle Execute progress [8/12]
  const merkleExecuteProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="MerkleExecute"\} (\d+)/
  );
  const merkleExecuteTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="MerkleExecute"\} (\d+)/
  );

  let merkleExecutePercent = 0;
  if (merkleExecuteProcessedMatch && merkleExecuteTotalMatch) {
    const merkleExecuteProcessed = parseInt(merkleExecuteProcessedMatch[1], 10);
    const merkleExecuteTotal = parseInt(merkleExecuteTotalMatch[1], 10);

    if (merkleExecuteProcessed > 0) {
      merkleExecutePercent = merkleExecuteProcessed / merkleExecuteTotal;
    }
  }

  // Handle Transaction Lookup progress [9/12]
  const transactionLookupProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="TransactionLookup"\} (\d+)/
  );
  const transactionLookupTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="TransactionLookup"\} (\d+)/
  );

  let transactionLookupPercent = 0;
  if (transactionLookupProcessedMatch && transactionLookupTotalMatch) {
    const transactionLookupProcessed = parseInt(
      transactionLookupProcessedMatch[1],
      10
    );
    const transactionLookupTotal = parseInt(transactionLookupTotalMatch[1], 10);

    if (transactionLookupProcessed > 0) {
      transactionLookupPercent =
        transactionLookupProcessed / transactionLookupTotal;
    }
  }

  // Handle Index Storage History progress [10/12]
  const indexStorageHistoryProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="IndexStorageHistory"\} (\d+)/
  );
  const indexStorageHistoryTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="IndexStorageHistory"\} (\d+)/
  );

  let indexStorageHistoryPercent = 0;
  if (indexStorageHistoryProcessedMatch && indexStorageHistoryTotalMatch) {
    const indexStorageHistoryProcessed = parseInt(
      indexStorageHistoryProcessedMatch[1],
      10
    );
    const indexStorageHistoryTotal = parseInt(
      indexStorageHistoryTotalMatch[1],
      10
    );

    if (indexStorageHistoryProcessed > 0) {
      indexStorageHistoryPercent =
        indexStorageHistoryProcessed / indexStorageHistoryTotal;
    }
  }

  // Handle Index Account History progress [11/12]
  const indexAccountHistoryProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="IndexAccountHistory"\} (\d+)/
  );
  const indexAccountHistoryTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="IndexAccountHistory"\} (\d+)/
  );

  let indexAccountHistoryPercent = 0;
  if (indexAccountHistoryProcessedMatch && indexAccountHistoryTotalMatch) {
    const indexAccountHistoryProcessed = parseInt(
      indexAccountHistoryProcessedMatch[1],
      10
    );
    const indexAccountHistoryTotal = parseInt(
      indexAccountHistoryTotalMatch[1],
      10
    );

    if (indexAccountHistoryProcessed > 0) {
      indexAccountHistoryPercent =
        indexAccountHistoryProcessed / indexAccountHistoryTotal;
    }
  }

  // Handle Finish progress [12/12]
  const finishProcessedMatch = rethSyncMetrics.match(
    /reth_sync_entities_processed\{stage="Finish"\} (\d+)/
  );
  const finishTotalMatch = rethSyncMetrics.match(
    /reth_sync_entities_total\{stage="Finish"\} (\d+)/
  );

  let finishPercent = 0;
  if (finishProcessedMatch && finishTotalMatch) {
    const finishProcessed = parseInt(finishProcessedMatch[1], 10);
    const finishTotal = parseInt(finishTotalMatch[1], 10);

    if (finishProcessed > 0) {
      finishPercent = finishProcessed / finishTotal;
    }
  }

  // Update stagePercentages object
  stagePercentages = {
    headersPercent,
    bodiesPercent,
    senderRecoveryPercent,
    executionPercent,
    merkleUnwindPercent,
    accountHashingPercent,
    storageHashingPercent,
    merkleExecutePercent,
    transactionLookupPercent,
    indexStorageHistoryPercent,
    indexAccountHistoryPercent,
    finishPercent,
  };

  populateRethStageGauge(Object.values(stagePercentages));
}

function checkAllStagesComplete(percentages) {
  const values = Object.values(percentages);
  const allOnes = values.every((percent) => percent === 1);
  const allZeros = values.every((percent) => percent === 0);
  return allOnes || allZeros;
}

debugToFile(`updateLogicExecution: owner: ${owner}`);
debugToFile(`updateLogicExecution: owner !== null: ${owner !== null}`);

export async function showHideRethWidgets(
  screen,
  rethStageGauge,
  chainInfoBox,
  rpcInfoBox
) {
  try {
    const syncingStatus = await isSyncing();

    // debugToFile(`syncingStatus: ${JSON.stringify(syncingStatus, null, 2)}`);

    const allStagesComplete = checkAllStagesComplete(stagePercentages);

    if (syncingStatus && !allStagesComplete) {
      if (!screen.children.includes(rethStageGauge)) {
        screen.append(rethStageGauge);
      }
      if (screen.children.includes(chainInfoBox)) {
        screen.remove(chainInfoBox);
      }
      if (screen.children.includes(rpcInfoBox)) {
        screen.remove(rpcInfoBox);
      }
    } else {
      if (screen.children.includes(rethStageGauge)) {
        screen.remove(rethStageGauge);
      }
      if (!screen.children.includes(chainInfoBox)) {
        screen.append(chainInfoBox);
      }
      debugToFile(
        `Attempting to append rpcInfoBox. owner value: ${owner}, type: ${typeof owner}`
      );
      // if (!screen.children.includes(rpcInfoBox) && owner != null) {
      //   screen.append(rpcInfoBox);
      // }
    }
  } catch (error) {
    debugToFile(`showHideRethWidgets(): ${error}`);
  }
}

export async function showHideGethWidgets(
  screen,
  gethStageGauge,
  chainInfoBox,
  rpcInfoBox
) {
  try {
    const syncingStatus = await isSyncing();

    if (syncingStatus) {
      if (!screen.children.includes(gethStageGauge)) {
        screen.append(gethStageGauge);
      }
      if (screen.children.includes(chainInfoBox)) {
        screen.remove(chainInfoBox);
      }
      if (screen.children.includes(rpcInfoBox)) {
        screen.remove(rpcInfoBox);
      }
    } else {
      if (screen.children.includes(gethStageGauge)) {
        screen.remove(gethStageGauge);
      }
      if (!screen.children.includes(chainInfoBox)) {
        screen.append(chainInfoBox);
      }
      debugToFile(
        `Attempting to append rpcInfoBox. owner value: ${owner}, type: ${typeof owner}`
      );
      // if (!screen.children.includes(rpcInfoBox) && owner != null) {
      //   screen.append(rpcInfoBox);
      // }
    }
  } catch (error) {
    debugToFile(`showHideGethWidgets(): ${error}`);
  }
}

export async function synchronizeAndUpdateWidgets(installDir) {
  try {
    // Check for network connectivity
    await checkNetworkConnectivity();

    // Get disk usage
    const diskUsagePercent = await getDiskUsage(installDir);

    // Check if disk usage is critical
    if (diskUsagePercent >= 97) {
      return "{red-fg}DISK SPACE LOW{/red-fg}";
    }

    const syncingStatus = await isSyncing();
    const blockNumber = await localClient.getBlockNumber();
    const latestBlock = await mainnetClient.getBlockNumber();

    if (executionClient == "geth") {
      if (syncingStatus) {
        const currentBlock = parseInt(syncingStatus.currentBlock, 16);
        const highestBlock = parseInt(syncingStatus.highestBlock, 16);

        if (currentBlock === 0 && highestBlock === 0) {
          statusMessage = `SYNC IN PROGRESS`;
        } else {
          statusMessage = `SYNC IN PROGRESS\nCurrent Block: ${currentBlock.toLocaleString()}\nHighest Block: ${highestBlock.toLocaleString()}`;
        }
      } else {
        if (
          blockNumber >= latestBlock ||
          blockNumber === latestBlock - BigInt(1)
        ) {
          statusMessage = `FOLLOWING CHAIN HEAD\nCurrent Block: ${blockNumber.toLocaleString()}`;
        } else {
          statusMessage = `CATCHING UP TO HEAD\nLocal Block:   ${blockNumber.toLocaleString()}\nMainnet Block: ${latestBlock.toLocaleString()}`;
        }
      }
    } else if (executionClient == "reth") {
      const allStagesComplete = checkAllStagesComplete(stagePercentages);
      const allStagesZero = Object.values(stagePercentages).every(
        (percent) => percent === 0
      );

      if (syncingStatus || allStagesZero) {
        statusMessage = `SYNC IN PROGRESS`;
        await parseAndPopulateRethMetrics();
      } else if (allStagesComplete) {
        if (
          blockNumber >= latestBlock ||
          blockNumber === latestBlock - BigInt(1)
        ) {
          statusMessage = `FOLLOWING CHAIN HEAD\nCurrent Block: ${blockNumber.toLocaleString()}`;
        } else {
          statusMessage = `CATCHING UP TO HEAD\nLocal Block:   ${blockNumber.toLocaleString()}\nMainnet Block: ${latestBlock.toLocaleString()}`;
        }
      }
    }

    return statusMessage;
  } catch (error) {
    debugToFile(`synchronizeAndUpdateWidgets error: ${error}`);
    if (error.message === "No network connection") {
      return "{red-fg}NO NETWORK CONNECTION{/red-fg}";
    }
    return "";
  }
}

async function updateChainWidgets(statusBox, chainInfoBox, screen) {
  try {
    await Promise.all([
      updateStatusBox(statusBox),
      updateChainInfoBox(chainInfoBox, screen),
    ]);

    screen.render();
  } catch (error) {
    debugToFile(`updateWidgets(): ${error}`);
  }
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

setInterval(() => updateChainWidgets(statusBox, chainInfoBox, screen), 5000);
setInterval(() => updateBandwidthBox(screen), 2000);

async function checkNetworkConnectivity() {
  try {
    await fetch("https://www.google.com", { mode: "no-cors", timeout: 5000 });
  } catch (error) {
    throw new Error("No network connection");
  }
}
