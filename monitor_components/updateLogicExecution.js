import fs from "fs";
import readline from "readline";
import {
  loadProgress,
  saveProgress,
  highlightWords,
} from "./helperFunctions.js";

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
    console.log(`updatePeerCountLcd(): ${error}`, () => {});
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

    console.log("HEADER DL updated!!!!!!!!!!");
    console.log("headerDlMatch: ", headerDlMatch);

    const headerDlDownloaded = parseInt(headerDlMatch[1].replace(/,/g, ""), 10);
    console.log("headerDlDownloaded: ", headerDlDownloaded);
    const headerDlLeft = parseInt(headerDlMatch[2].replace(/,/g, ""), 10);
    console.log("headerDlLeft: ", headerDlLeft);
    const headerDlProgress =
      headerDlDownloaded / (headerDlDownloaded + headerDlLeft);

    console.log("headerDlProgress: ", headerDlProgress);
    progress.headerDlProgress = headerDlProgress;
    saveProgress(progress);
    console.log("Progress from getHeaderDlProgress: ", progress);
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
  headerDlGauge,
  stateDlGauge,
  chainDlGauge,
  peerCountGauge
) {
  // const progress = loadProgress();

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
        executionLog.log(highlightWords(line));
        screen.render();

        const peerCount = getPeerCount(line);
        if (peerCount !== null) {
          updatePeerCountLcd(peerCountGauge, peerCount, screen);
        }
        saveHeaderDlProgress(line);
        saveStateDlProgress(line);
        saveChainDlProgress(line);

        // console.log("line", line);
        // console.log("progress From stream", progress);

        if (headerDlGauge) {
          headerDlGauge.setPercent(progress.headerDlProgress);
        }
        if (stateDlGauge) {
          stateDlGauge.setPercent(progress.stateDlProgress);
        }
        if (chainDlGauge) {
          chainDlGauge.setPercent(progress.chainDlProgress);
        }

        screen.render();
      });

      newRl.on("close", () => {
        // console.log("New log file stream ended");
      });

      newRl.on("error", (err) => {
        console.error("Error reading new log file stream:", err);
      });
    }
  });
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
//   // console.log("Log file stream ended");
// });

// rl.on("error", (err) => {
//   console.error("Error reading log file:", err);
// });
