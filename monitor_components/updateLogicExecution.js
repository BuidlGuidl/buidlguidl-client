import fs from "fs";
import readline from "readline";
import {
  loadProgress,
  saveProgress,
  highlightWords,
} from "./helperFunctions.js";
import { debugToFile } from "../helpers.js";
import { executionClient } from "../index.js";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { localClient } from "./localClient.js";

const progress = loadProgress();

// const mainnetClient = createPublicClient({
//   name: "mainnetClient",
//   chain: mainnet,
//   transport: http("https://eth-mainnet.g.alchemy.com/v2/demo"),
// });

const mainnetClient = createPublicClient({
  name: "mainnetClient",
  chain: mainnet,
  transport: http(),
});

async function isSyncing() {
  try {
    const syncingStatus = await localClient.request({
      method: "eth_syncing",
      params: [],
    });

    return syncingStatus;
  } catch (error) {
    // throw new Error(`Failed to fetch syncing status: ${error.message}`);
    debugToFile(`isSyncing(): ${error}`, () => {});
  }
}

/// Peer Count
function getPeerCount(line) {
  const peerCountMatch = line.match(/peercount=(\d+)/);
  return peerCountMatch ? parseInt(peerCountMatch[1], 10) : null;
}

function updatePeerCountLcd(peerCountGauge, peerCount, screen) {
  try {
    peerCountGauge.setDisplay(peerCount.toString());
    screen.render();
  } catch (error) {
    debugToFile(`updatePeerCountLcd(): ${error}`, () => {});
  }
}

function stripAnsiCodes(input) {
  return input.replace(
    /[\u001b\u009b][[()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nq-uy=><~])/g,
    ""
  );
}

/// Header Download Progress
function saveHeaderDlProgress(line) {
  line = stripAnsiCodes(line);

  if (line.includes("Syncing beacon headers")) {
    const headerDlMatch = line.match(
      /downloaded=([\d,]+)\s+left=([\d,]+)\s+eta=([^\s]+)/
    );

    debugToFile(`HEADER DL updated!!!!!!!!!!`, () => {});
    debugToFile(`headerDlMatch: ${headerDlMatch}`, () => {});

    const headerDlDownloaded = parseInt(headerDlMatch[1].replace(/,/g, ""), 10);
    debugToFile(`headerDlDownloaded: ${headerDlDownloaded}`, () => {});
    const headerDlLeft = parseInt(headerDlMatch[2].replace(/,/g, ""), 10);
    debugToFile(`headerDlLeft: ${headerDlLeft}`, () => {});
    const headerDlProgress =
      headerDlDownloaded / (headerDlDownloaded + headerDlLeft);

    debugToFile(`headerDlProgress: ${headerDlProgress}`, () => {});
    progress.headerDlProgress = headerDlProgress;
    saveProgress(progress);
    debugToFile(`Progress from getHeaderDlProgress: ${progress}`, () => {});
  }
}

/// State Download Progress
function saveStateDlProgress(line) {
  if (line.includes("Syncing: chain download in progress")) {
    const chainSyncMatch = line.match(/synced=([\d.]+)%/);
    const chainDlProgress = parseFloat(chainSyncMatch[1]) / 100;
    progress.chainDlProgress = chainDlProgress;
    saveProgress(progress);
  }
}

/// Chain Download Progress
function saveChainDlProgress(line) {
  if (line.includes("Syncing: state download in progress")) {
    const stateSyncMatch = line.match(/synced=([\d.]+)%/);
    const stateDlProgress = parseFloat(stateSyncMatch[1]) / 100;
    progress.stateDlProgress = stateDlProgress;
    saveProgress(progress);
  }
}

export function setupLogStreaming(
  logFilePath,
  executionLog,
  screen,
  gethHeaderDlGauge,
  gethStateDlGauge,
  gethChainDlGauge,
  rethStageGauge,
  rethOverallSyncGauge
  // peerCountGauge
) {
  // const progress = loadProgress();
  let logBuffer = [];

  fs.watchFile(logFilePath, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      const newStream = fs.createReadStream(logFilePath, {
        encoding: "utf8",
        start: prev.size,
      });

      const newRl = readline.createInterface({
        input: newStream,
        output: process.stdout,
        terminal: false,
      });

      newRl.on("line", (line) => {
        logBuffer.push(highlightWords(line));

        if (logBuffer.length > executionLog.height - 2) {
          logBuffer.shift();
        }

        executionLog.setContent(logBuffer.join("\n"));

        if (executionClient == "geth") {
          createGethMessage();

          saveHeaderDlProgress(line);
          saveStateDlProgress(line);
          saveChainDlProgress(line);

          if (gethHeaderDlGauge) {
            gethHeaderDlGauge.setPercent(progress.headerDlProgress);
          }
          if (gethStateDlGauge) {
            gethStateDlGauge.setPercent(progress.stateDlProgress);
          }
          if (gethChainDlGauge) {
            gethChainDlGauge.setPercent(progress.chainDlProgress);
          }
        } else if (executionClient == "reth") {
          createRethMessage(line);

          rethStageGauge.setPercent(
            Math.floor(stagePercentComplete * 100) / 100
          );
          rethOverallSyncGauge.setPercent(
            Math.floor(overallPercentComplete * 100) / 100
          );
        }

        screen.render();
      });

      newRl.on("close", () => {
        // debugToFile(`New log file stream ended`, () => {});
      });

      newRl.on("error", (err) => {
        debugToFile(`Error reading new log file stream: ${err}`, () => {});
      });
    }
  });
}

let statusMessage = "INITIALIZING...";

async function createGethMessage() {
  const syncingStatus = await isSyncing();

  if (syncingStatus) {
    const currentBlock = parseInt(syncingStatus.currentBlock, 16);
    const highestBlock = parseInt(syncingStatus.highestBlock, 16);

    statusMessage = `SYNC IN PROGRESS\nCurrent Block: ${currentBlock}\nHighest Block: ${highestBlock}`;
  } else {
    const blockNumber = await localClient.getBlockNumber();
    const latestBlock = await mainnetClient.getBlockNumber();

    if (
      blockNumber === latestBlock ||
      blockNumber === latestBlock + BigInt(1) ||
      blockNumber === latestBlock - BigInt(1)
    ) {
      statusMessage = `FOLLOWING CHAIN HEAD\nCurrent Block: ${blockNumber}`;
    } else {
      statusMessage = `CATCHING UP TO HEAD\nLocal Block:   ${blockNumber}\nMainnet Block: ${latestBlock}`;
    }
  }
}

let largestToBlock = 0;
let stagePercentComplete = 0;
let overallPercentComplete = 0;

async function createRethMessage(line) {
  try {
    const syncingStatus = await isSyncing();

    if (syncingStatus) {
      if (line.includes("Received headers") && line.includes("to_block=")) {
        const toBlock = parseInt(line.match(/to_block=(\d+)/)[1], 10);

        if (toBlock > largestToBlock) {
          largestToBlock = toBlock;
        }

        stagePercentComplete = (largestToBlock - toBlock) / largestToBlock;
        overallPercentComplete = (stagePercentComplete * 100) / 1200;

        statusMessage = `[SYNC STAGE: 1/12] HEADERS\nBlocks Remaining: ${toBlock}\nLargest Block:    ${largestToBlock}`;
      } else if (
        line.includes("stage=Bodies") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 100) / 1200;

        statusMessage = `[SYNC STAGE: 2/12] BODIES\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=SenderRecovery") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 200) / 1200;

        statusMessage = `[SYNC STAGE: 3/12] SENDER RECOVERY\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=Execution") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 300) / 1200;

        statusMessage = `[SYNC STAGE: 4/12] EXECUTION\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=AccountHashing") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 400) / 1200;

        statusMessage = `[SYNC STAGE: 5/12] ACCOUNT HASHING\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=StorageHashing") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 500) / 1200;

        statusMessage = `[SYNC STAGE: 6/12] STORAGE HASHING\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=Merkle") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 600) / 1200;

        statusMessage = `[SYNC STAGE: 7/12] MERKLE\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=TransactionLookup") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 700) / 1200;

        statusMessage = `[SYNC STAGE: 8/12] TRANSACTION LOOKUP\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=IndexAccountHistory") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 800) / 1200;

        statusMessage = `[SYNC STAGE: 9/12] INDEX ACCOUNT HISTORY\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=IndexStorageHistory") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 900) / 1200;

        statusMessage = `[SYNC STAGE: 10/12] INDEX STORAGE HISTORY\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=ETL") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 1000) / 1200;

        statusMessage = `[SYNC STAGE: 11/12] ETL\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      } else if (
        line.includes("stage=Finalization") &&
        line.includes("stage_progress=")
      ) {
        const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
        const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
        stagePercentComplete =
          parseFloat(line.match(/stage_progress=([\d.]+)%/)[1]) / 100;

        overallPercentComplete = (stagePercentComplete * 100 + 1100) / 1200;

        statusMessage = `[SYNC STAGE: 12/12] FINALIZATION\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
      }
    } else {
      const blockNumber = await localClient.getBlockNumber();
      const latestBlock = await mainnetClient.getBlockNumber();

      if (
        blockNumber === latestBlock ||
        blockNumber === latestBlock + BigInt(1) ||
        blockNumber === latestBlock - BigInt(1)
      ) {
        statusMessage = `FOLLOWING CHAIN HEAD\nCurrent Block: ${blockNumber}`;
      } else {
        statusMessage = `CATCHING UP TO HEAD\nLocal Block:   ${blockNumber}\nMainnet Block: ${latestBlock}`;
      }
    }
  } catch (error) {
    debugToFile(`createRethMessage(): ${error}`, () => {});
  }
}

export async function passStatusMessage() {
  try {
    return statusMessage;
  } catch (error) {
    debugToFile(`passRethStatus(): ${error}`, () => {});
    return "";
  }
}
