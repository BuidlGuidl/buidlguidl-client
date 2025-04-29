import fs from "fs";
import readline from "readline";
import {
  loadProgress,
  saveProgress,
  formatLogLines,
} from "./helperFunctions.js";
import { debugToFile } from "../helpers.js";
import { executionClient, owner } from "../commandLineOptions.js";
import {
  mainnetClient,
  localClient,
  getEthSyncingStatus,
} from "./viemClients.js";
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
import { getVersionNumber } from "../ethereum_client_scripts/install.js";

const progress = loadProgress();
let gethStageProgress = [
  progress.headerDlProgress,
  progress.chainDlProgress,
  progress.stateDlProgress,
];

// Store Reth version at module level
let rethVersion = null;
// Add a counter to track block numbers
let blockCounter = 0;
let lastBlockNumber = null; // Track the last block we processed
let isFetchingLatestBlock = false; // Mutex flag to prevent parallel fetches
let cachedLatestBlock = null; // Cache for the latest block
let lastFetchTime = 0; // Track when we last fetched the latest block
let lastFetchedForBlock = null; // Track which block number we last fetched for
let lastFetchPromise = null; // Store the promise for the latest fetch

// Add these at the module level (top of file or before synchronizeAndUpdateWidgets)
let lastIsFollowingChainHead = true;
let lastLatestBlock = null;

// Function to initialize Reth version
function initRethVersion() {
  if (rethVersion === null) {
    rethVersion = getVersionNumber("reth");
  }
  return rethVersion;
}

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
  client,
  logFilePath,
  log,
  screen,
  gethStageGauge
) {
  let logBuffer = [];
  let lastSize = 0;
  let lastKnownBlockNumber = 0;

  const ensureBufferFillsWidget = () => {
    const visibleHeight = log.height - 2; // Account for border

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

          log.setContent(logBuffer.join("\n"));

          if (client == "geth") {
            if (screen.children.includes(gethStageGauge)) {
              populateGethStageGauge(gethStageProgress);
            }

            saveHeaderDlProgress(line);
            saveStateDlProgress(line);
            saveChainDlProgress(line);
          }

          // Check for new block
          if (client == "geth" || client == "reth") {
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

  // Initialize Reth version if not already done
  initRethVersion();

  // If metrics are empty (likely because Reth is shutting down), don't process further
  if (!rethSyncMetrics) {
    return;
  }

  // Helper function to round progress values > 0.99 to 1.0
  const roundProgress = (progress) => {
    return progress > 0.99 ? 1 : progress;
  };

  // Handle header progress [1/12 or 1/14]
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

        headersPercent = roundProgress(
          (largestToBlock - toBlock) / largestToBlock
        );
      }
    } else if (headersProcessed === headersTotal && headersTotal > 0) {
      headersPercent = 1;
    }
  }

  // Handle bodies progress [2/12 or 2/14]
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

    if (bodiesProcessed > 0 && bodiesTotal > 0) {
      bodiesPercent = roundProgress(bodiesProcessed / bodiesTotal);
    }
  }

  // Handle Sender Recovery progress [3/12 or 3/14]
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

    if (senderRecoveryProcessed > 0 && senderRecoveryTotal > 0) {
      senderRecoveryPercent = roundProgress(
        senderRecoveryProcessed / senderRecoveryTotal
      );
    }
  }

  // Handle Execution progress [4/12 or 4/14]
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

    if (executionProcessed > 0 && executionTotal > 0) {
      executionPercent = roundProgress(executionProcessed / executionTotal);
    }
  }

  // Handle Prune Sender Recovery progress [5/14] - Only for Reth v1.3.4+
  let pruneSenderRecoveryPercent = 0;
  if (rethVersion >= "1.3.4") {
    const pruneSenderRecoveryProcessedMatch = rethSyncMetrics.match(
      /reth_sync_entities_processed\{stage="PruneSenderRecovery"\} (\d+)/
    );
    const pruneSenderRecoveryTotalMatch = rethSyncMetrics.match(
      /reth_sync_entities_total\{stage="PruneSenderRecovery"\} (\d+)/
    );

    if (pruneSenderRecoveryProcessedMatch && pruneSenderRecoveryTotalMatch) {
      const pruneSenderRecoveryProcessed = parseInt(
        pruneSenderRecoveryProcessedMatch[1],
        10
      );
      const pruneSenderRecoveryTotal = parseInt(
        pruneSenderRecoveryTotalMatch[1],
        10
      );

      if (pruneSenderRecoveryProcessed > 0 && pruneSenderRecoveryTotal > 0) {
        pruneSenderRecoveryPercent = roundProgress(
          pruneSenderRecoveryProcessed / pruneSenderRecoveryTotal
        );
      }
    }
  }

  // Handle Merkle Unwind progress [5/12 or 6/14]
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

    if (merkleUnwindProcessed > 0 && merkleUnwindTotal > 0) {
      merkleUnwindPercent = roundProgress(
        merkleUnwindProcessed / merkleUnwindTotal
      );
    }
  }

  // Handle Account Hashing progress [6/12 or 7/14]
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

    if (accountHashingProcessed > 0 && accountHashingTotal > 0) {
      accountHashingPercent = roundProgress(
        accountHashingProcessed / accountHashingTotal
      );
    }
  }

  // Handle Storage Hashing progress [7/12 or 8/14]
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

    if (storageHashingProcessed > 0 && storageHashingTotal > 0) {
      storageHashingPercent = roundProgress(
        storageHashingProcessed / storageHashingTotal
      );
    }
  }

  // Handle Merkle Execute progress [8/12 or 9/14]
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

    if (merkleExecuteProcessed > 0 && merkleExecuteTotal > 0) {
      merkleExecutePercent = roundProgress(
        merkleExecuteProcessed / merkleExecuteTotal
      );
    }
  }

  // Handle Transaction Lookup progress [9/12 or 10/14]
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

    if (transactionLookupProcessed > 0 && transactionLookupTotal > 0) {
      transactionLookupPercent = roundProgress(
        transactionLookupProcessed / transactionLookupTotal
      );
    }
  }

  // Handle Index Storage History progress [10/12 or 11/14]
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

    if (indexStorageHistoryProcessed > 0 && indexStorageHistoryTotal > 0) {
      indexStorageHistoryPercent = roundProgress(
        indexStorageHistoryProcessed / indexStorageHistoryTotal
      );
    }
  }

  // Handle Index Account History progress [11/12 or 12/14]
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

    if (indexAccountHistoryProcessed > 0 && indexAccountHistoryTotal > 0) {
      indexAccountHistoryPercent = roundProgress(
        indexAccountHistoryProcessed / indexAccountHistoryTotal
      );
    }
  }

  // Handle Prune progress [13/14] - Only for Reth v1.3.4+
  let prunePercent = 0;
  if (rethVersion >= "1.3.4") {
    const pruneProcessedMatch = rethSyncMetrics.match(
      /reth_sync_entities_processed\{stage="Prune"\} (\d+)/
    );
    const pruneTotalMatch = rethSyncMetrics.match(
      /reth_sync_entities_total\{stage="Prune"\} (\d+)/
    );

    if (pruneProcessedMatch && pruneTotalMatch) {
      const pruneProcessed = parseInt(pruneProcessedMatch[1], 10);
      const pruneTotal = parseInt(pruneTotalMatch[1], 10);

      if (pruneProcessed > 0 && pruneTotal > 0) {
        prunePercent = roundProgress(pruneProcessed / pruneTotal);
      }
    }
  }

  // Handle Finish progress [12/12 or 14/14]
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

    if (finishProcessed > 0 && finishTotal > 0) {
      finishPercent = roundProgress(finishProcessed / finishTotal);
    }
  }

  // Update stagePercentages object based on Reth version
  if (rethVersion >= "1.3.4") {
    stagePercentages = {
      headersPercent,
      bodiesPercent,
      senderRecoveryPercent,
      executionPercent,
      pruneSenderRecoveryPercent,
      merkleUnwindPercent,
      accountHashingPercent,
      storageHashingPercent,
      merkleExecutePercent,
      transactionLookupPercent,
      indexStorageHistoryPercent,
      indexAccountHistoryPercent,
      prunePercent,
      finishPercent,
    };
  } else {
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
  }

  populateRethStageGauge(Object.values(stagePercentages));
}

function checkAllStagesComplete(percentages) {
  const values = Object.values(percentages);
  const allOnes = values.every((percent) => percent === 1);
  const allZeros = values.every((percent) => percent === 0);
  return allOnes || allZeros;
}

export async function showHideRethWidgets(
  screen,
  rethStageGauge,
  chainInfoBox,
  rpcInfoBox
) {
  try {
    const syncingStatus = await getEthSyncingStatus();

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
      if (!screen.children.includes(rpcInfoBox) && owner) {
        screen.append(rpcInfoBox);
      }
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
    const syncingStatus = await getEthSyncingStatus();

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
      if (!screen.children.includes(rpcInfoBox) && owner) {
        screen.append(rpcInfoBox);
      }
    }
  } catch (error) {
    debugToFile(`showHideGethWidgets(): ${error}`);
  }
}

async function calcSyncingStatus(executionClient) {
  try {
    const syncingStatus = await getEthSyncingStatus();
    let isSyncing = false; // Default value

    if (executionClient === "reth") {
      // Check if syncingStatus is an object (syncing) or false (not syncing)
      const isNodeSyncing = syncingStatus !== false;

      const allStagesComplete = checkAllStagesComplete(stagePercentages);
      const allStagesZero = Object.values(stagePercentages).every(
        (percent) => percent === 0
      );

      if (isNodeSyncing || allStagesZero) {
        isSyncing = true;
      } else if (allStagesComplete) {
        isSyncing = false;
      }
      // If none of the conditions are met, isSyncing remains false
    } else if (executionClient === "geth") {
      isSyncing = !!syncingStatus; // Convert to boolean
    }

    return { isSyncing, syncingStatus };
  } catch (error) {
    debugToFile(`calcSyncingStatus(): ${error}`);
    return { isSyncing: false, syncingStatus: null };
  }
}

let currentUpdateInterval = null;
let currentBlockWatcher = null;

async function setupUpdateMechanism() {
  const { isSyncing } = await calcSyncingStatus(executionClient);

  // Clean up existing update mechanism
  if (currentUpdateInterval) {
    clearInterval(currentUpdateInterval);
    currentUpdateInterval = null;
  }
  if (currentBlockWatcher) {
    try {
      // Remove the check for unsubscribe method since it will never exist
      debugToFile("Block watcher cleanup - no unsubscribe needed");
    } catch (error) {
      debugToFile(`Error cleaning up block watcher: ${error}`);
    }
    currentBlockWatcher = null;
  }

  if (isSyncing) {
    // When syncing, update every 5 seconds
    currentUpdateInterval = setInterval(
      () => updateChainWidgets(statusBox, chainInfoBox, screen),
      5000
    );
  } else {
    // When not syncing, update only on new blocks
    try {
      currentBlockWatcher = await localClient.watchBlocks(
        {
          onBlock: () => {
            updateChainWidgets(statusBox, chainInfoBox, screen);
          },
        },
        (error) => {
          debugToFile(`Error in block watcher: ${error}`);
        }
      );
    } catch (error) {
      debugToFile(`Error setting up block watcher: ${error}`);
    }
  }
}

// Initialize the update mechanism
setupUpdateMechanism();

// Check for syncing status changes every 30 seconds
setInterval(async () => {
  const { isSyncing } = await calcSyncingStatus(executionClient);
  const isCurrentlySyncing = currentUpdateInterval !== null;

  // Only update the mechanism if the syncing status has changed
  if (isSyncing !== isCurrentlySyncing) {
    setupUpdateMechanism();
  }
}, 30000);

setInterval(() => updateBandwidthBox(screen), 2000);

async function checkNetworkConnectivity() {
  try {
    await fetch("https://www.google.com", { mode: "no-cors", timeout: 5000 });
  } catch (error) {
    throw new Error("No network connection");
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

    const { isSyncing, syncingStatus } = await calcSyncingStatus(
      executionClient
    );

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
        const blockNumber = await localClient.getBlockNumber();

        // Only increment block counter once per block
        if (lastBlockNumber !== blockNumber) {
          blockCounter++;
          lastBlockNumber = blockNumber;
          debugToFile(`Updated blockCounter: ${blockCounter}`);
        }

        let isFollowingChainHead;
        let latestBlock;

        // Only use the 10-block optimization if we are following chain head
        let shouldCheckLatestBlock = lastIsFollowingChainHead
          ? blockCounter % 10 === 0
          : true;
        debugToFile(`shouldCheckLatestBlock: ${shouldCheckLatestBlock}`);

        if (shouldCheckLatestBlock) {
          try {
            latestBlock = await fetchLatestBlockWithMutex();
            isFollowingChainHead =
              latestBlock !== null &&
              (blockNumber >= latestBlock || blockNumber === latestBlock - 1n); // Use 1n for BigInt
            lastLatestBlock = latestBlock;
            lastIsFollowingChainHead = isFollowingChainHead;
          } catch (error) {
            debugToFile(`Error fetching latest block: ${error}`);
            isFollowingChainHead = true; // fallback
            lastIsFollowingChainHead = isFollowingChainHead;
            lastLatestBlock = null;
          }
        } else {
          // Use last known state
          isFollowingChainHead = lastIsFollowingChainHead;
          latestBlock = lastLatestBlock;
        }

        // Set status message
        debugToFile(
          `blockNumber: ${blockNumber}, latestBlock: ${latestBlock}, isFollowingChainHead: ${isFollowingChainHead}`
        );
        if (isFollowingChainHead) {
          statusMessage = `FOLLOWING CHAIN HEAD\nCurrent Block: ${blockNumber.toLocaleString()}`;
        } else {
          statusMessage = `CATCHING UP TO HEAD\nLocal Block:   ${blockNumber.toLocaleString()}\nMainnet Block: ${
            latestBlock ? latestBlock.toLocaleString() : "Unknown"
          }`;
        }
      }
    } else if (executionClient == "reth") {
      if (isSyncing) {
        statusMessage = `SYNC IN PROGRESS`;
        await parseAndPopulateRethMetrics();
      } else if (isSyncing === false) {
        const blockNumber = await localClient.getBlockNumber();

        // Only increment block counter once per block
        if (lastBlockNumber !== blockNumber) {
          blockCounter++;
          lastBlockNumber = blockNumber;
          debugToFile(`Updated blockCounter: ${blockCounter}`);
        }

        let isFollowingChainHead;
        let latestBlock;

        // Only use the 10-block optimization if we are following chain head
        let shouldCheckLatestBlock = lastIsFollowingChainHead
          ? blockCounter % 10 === 0
          : true;
        debugToFile(`shouldCheckLatestBlock: ${shouldCheckLatestBlock}`);

        if (shouldCheckLatestBlock) {
          try {
            latestBlock = await fetchLatestBlockWithMutex();
            isFollowingChainHead =
              latestBlock !== null &&
              (blockNumber >= latestBlock || blockNumber === latestBlock - 1n); // Use 1n for BigInt
            lastLatestBlock = latestBlock;
            lastIsFollowingChainHead = isFollowingChainHead;
          } catch (error) {
            debugToFile(`Error fetching latest block: ${error}`);
            isFollowingChainHead = true; // fallback
            lastIsFollowingChainHead = isFollowingChainHead;
            lastLatestBlock = null;
          }
        } else {
          // Use last known state
          isFollowingChainHead = lastIsFollowingChainHead;
          latestBlock = lastLatestBlock;
        }

        // Set status message
        debugToFile(
          `blockNumber: ${blockNumber}, latestBlock: ${latestBlock}, isFollowingChainHead: ${isFollowingChainHead}`
        );
        if (isFollowingChainHead) {
          statusMessage = `FOLLOWING CHAIN HEAD\nCurrent Block: ${blockNumber.toLocaleString()}`;
        } else {
          statusMessage = `CATCHING UP TO HEAD\nLocal Block:   ${blockNumber.toLocaleString()}\nMainnet Block: ${
            latestBlock ? latestBlock.toLocaleString() : "Unknown"
          }`;
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

// Function to fetch the latest block with mutex protection
async function fetchLatestBlockWithMutex() {
  // If there's already a fetch in progress, return that promise
  if (lastFetchPromise) {
    debugToFile(`Reusing existing fetch promise`);
    return lastFetchPromise;
  }

  // If we have a cached value that's less than 5 seconds old, use it
  const now = Date.now();
  if (cachedLatestBlock !== null && now - lastFetchTime < 5000) {
    debugToFile(`Using recent cached latestBlock: ${cachedLatestBlock}`);
    return cachedLatestBlock;
  }

  // Start a new fetch
  debugToFile(`Starting new fetch for latestBlock`);
  isFetchingLatestBlock = true;

  // Create a new promise for this fetch
  lastFetchPromise = (async () => {
    try {
      const latestBlock = await mainnetClient.getBlockNumber();
      debugToFile(`Got new latestBlock: ${latestBlock}`);
      cachedLatestBlock = latestBlock;
      lastFetchTime = now;
      lastFetchedForBlock = lastBlockNumber;
      return latestBlock;
    } catch (error) {
      debugToFile(`Error fetching latest block: ${error}`);
      // If we have a cached value, use it as fallback
      if (cachedLatestBlock !== null) {
        debugToFile(
          `Using cached latestBlock as fallback: ${cachedLatestBlock}`
        );
        return cachedLatestBlock;
      }
      return null;
    } finally {
      isFetchingLatestBlock = false;
      // Clear the promise after a short delay to allow other calls to reuse it
      setTimeout(() => {
        lastFetchPromise = null;
      }, 100);
    }
  })();

  return lastFetchPromise;
}

// Initialize the update mechanism
setupUpdateMechanism();

// Check for syncing status changes every 30 seconds
setInterval(async () => {
  const { isSyncing } = await calcSyncingStatus(executionClient);
  const isCurrentlySyncing = currentUpdateInterval !== null;

  // Only update the mechanism if the syncing status has changed
  if (isSyncing !== isCurrentlySyncing) {
    setupUpdateMechanism();
  }
}, 30000);

setInterval(() => updateBandwidthBox(screen), 2000);
