import fs from "fs";
import readline from "readline";
import {
  loadProgress,
  saveProgress,
  highlightWords,
} from "./helperFunctions.js";
import { debugToFile } from "../helpers.js";
import { executionClient } from "../index.js";

const progress = loadProgress();

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

        // executionLog.log(highlightWords(line));
        executionLog.setContent(logBuffer.join("\n"));

        if (executionClient == "geth") {
          saveHeaderDlProgress(line);
          saveStateDlProgress(line);
          saveChainDlProgress(line);

          // debugToFile(`line ${line}`, () => {});
          // debugToFile(`progress From stream ${progress}`, () => {});

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
          parseRethLog(line);

          rethStageGauge.setPercent(stagePercentComplete);
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

let rethStatusMessage = "INITIALIZING...";
let largestToBlock = 0;
let stagePercentComplete = 0;

function parseRethLog(line) {
  try {
    if (line.includes("Received headers") && line.includes("to_block=")) {
      const toBlock = parseInt(line.match(/to_block=(\d+)/)[1], 10);

      if (toBlock > largestToBlock) {
        largestToBlock = toBlock;
      }

      stagePercentComplete = (largestToBlock - toBlock) / largestToBlock;

      rethStatusMessage = `[SYNC STAGE: 1/12] SYNCING HEADERS\nBlocks Remaining: ${toBlock}\nLargest Block:    ${largestToBlock}`;
    } else if (
      line.includes("stage=Bodies" && line.includes("stage_progress="))
    ) {
      const currentBlock = parseInt(line.match(/checkpoint=(\d+)/)[1], 10);
      const largestBlock = parseInt(line.match(/target=(\d+)/)[1], 10);
      stagePercentComplete = parseFloat(
        line.match(/stage_progress=([\d.]+)%/)[1]
      );

      rethStatusMessage = `[SYNC STAGE: 2/12] SYNCING BODIES\nCurrent Block: ${currentBlock}\nLargest Block: ${largestBlock}`;
    }
  } catch (error) {
    debugToFile(`parseRethLog(): ${error}`, () => {});
  }
}

export async function passRethStatus() {
  try {
    return rethStatusMessage;
  } catch (error) {
    debugToFile(`passRethStatus(): ${error}`, () => {});
    return "";
  }
}

// /// if want to have old logs showing when you start to process again
// const stream = fs.createReadStream(logFilePath, {
//   encoding: "utf8",
//   flags: "r",
// });

// const rl = readline.createInterface({
//   input: stream,
//   output: process.stdout,
//   terminal: false,
// });

// rl.on("line", (line) => {
//   executionLog.log(highlightWords(line));
//   screen.render();

//   const peerCount = getPeerCount(line);
//   if (peerCount !== null) {
//     updatePeerCountLcd(peerCountGauge, peerCount, screen);
//   }

//   saveHeaderDlProgress(line);
//   saveStateDlProgress(line);
//   saveChainDlProgress(line);

//   screen.render();
// });

// rl.on("close", () => {
// debugToFile(`Log file stream ended`, () => {});
// });

// rl.on("error", (err) => {
// debugToFile(`Error reading log file: ${err}`, () => {});
// });
