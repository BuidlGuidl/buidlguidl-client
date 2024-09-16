import fs from "fs";
import path from "path";
import os from "os";
import { debugToFile } from "../helpers.js";
import { installDir } from "../commandLineOptions.js";

const progressFilePath = path.join(
  installDir,
  "ethereum_clients",
  "progressMonitor.json"
);

// The cutoff (in terminal lines) for switching the widget layout style
// If screen is < thesh, layout is compact
let layoutHeightThresh;
if (os.platform() == "darwin") {
  layoutHeightThresh = 55;
} else if (os.platform() == "linux") {
  layoutHeightThresh = 77;
}
export { layoutHeightThresh };

// export function getLatestLogFile(dir, client) {
//   try {
//     const files = fs.readdirSync(dir);
//     let logFiles;
//     if (client === "geth") {
//       logFiles = files.filter(
//         (file) => file.startsWith("geth_") && file.endsWith(".log")
//       );
//     } else if (client === "reth") {
//       logFiles = files.filter(
//         (file) => file.startsWith("reth_") && file.endsWith(".log")
//       );
//     } else if (client === "prysm") {
//       logFiles = files.filter(
//         (file) => file.startsWith("prysm_") && file.endsWith(".log")
//       );
//     } else if (client === "lighthouse") {
//       logFiles = files.filter(
//         (file) => file.startsWith("lighthouse_") && file.endsWith(".log")
//       );
//     } else {
//       debugToFile(
//         `getLatestLogFile(): Invalid client specified. Must be 'geth', 'reth', 'prysm', or 'lighthouse'.`,
//         () => {}
//       );
//     }
//     logFiles.sort(
//       (a, b) =>
//         fs.statSync(path.join(dir, b)).mtime -
//         fs.statSync(path.join(dir, a)).mtime
//     );
//     return logFiles[0];
//   } catch (error) {
//     debugToFile(`getLatestLogFile(): ${error}`);
//   }
// }

export function getLatestLogFile(dir, client) {
  try {
    const files = fs.readdirSync(dir);
    let logFiles;
    if (client === "geth") {
      logFiles = files.filter(
        (file) => file.startsWith("geth_") && file.endsWith(".log")
      );
    } else if (client === "reth") {
      logFiles = files.filter(
        (file) => file.startsWith("reth_") && file.endsWith(".log")
      );
    } else if (client === "prysm") {
      logFiles = files.filter(
        (file) => file.startsWith("prysm_") && file.endsWith(".log")
      );
    } else if (client === "lighthouse") {
      logFiles = files.filter(
        (file) => file.startsWith("lighthouse_") && file.endsWith(".log")
      );
    } else {
      debugToFile(
        `getLatestLogFile(): Invalid client specified. Must be 'geth', 'reth', 'prysm', or 'lighthouse'.`,
        () => {}
      );
    }
    logFiles.sort(
      (a, b) =>
        fs.statSync(path.join(dir, b)).mtime -
        fs.statSync(path.join(dir, a)).mtime
    );

    if (logFiles[0]) {
      return logFiles[0];
    } else {
      debugToFile(
        `getLatestLogFile(): No log file found, retrying in 1 second...`,
        () => {}
      );
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(getLatestLogFile(dir, client));
        }, 1000);
      });
    }
  } catch (error) {
    debugToFile(`getLatestLogFile(): ${error}`);
    return undefined;
  }
}

export function saveProgress(progress) {
  //   console.log("Saving progress:", progress);
  fs.writeFileSync(
    progressFilePath,
    JSON.stringify(progress, null, 2),
    "utf-8"
  );
}

export function loadProgress() {
  if (fs.existsSync(progressFilePath)) {
    const data = fs.readFileSync(progressFilePath, "utf-8");
    return JSON.parse(data);
  }
  return {
    headerDlProgress: 0,
    chainDlProgress: 0,
    stateDlProgress: 0,
  };
}

export function formatLogLines(line) {
  // Define words which should be highlighted in exec and consensus logs
  const highlightRules = [
    { word: "INFO", style: "{bold}{green-fg}" },
    { word: "WARN", style: "{bold}{yellow-fg}" },
    { word: "ERROR", style: "{bold}{red-fg}" },
    { word: "updated", style: "{bold}{yellow-fg}" },
    { word: "latestProcessedSlot", style: "{bold}{green-fg}" },
    // { word: " backfill:", style: "{bold}{blue-fg}" },
    // { word: " blockchain:", style: "{bold}{blue-fg}" },
    // { word: " db:", style: "{bold}{blue-fg}" },
    // { word: " execution:", style: "{bold}{blue-fg}" },
    // { word: " flags:", style: "{bold}{blue-fg}" },
    // { word: " filesystem:", style: "{bold}{blue-fg}" },
    // { word: " gateway:", style: "{bold}{blue-fg}" },
    // { word: " genesis:", style: "{bold}{blue-fg}" },
    // { word: " initial-sync:", style: "{bold}{blue-fg}" },
    // { word: " node:", style: "{bold}{blue-fg}" },
    // { word: " p2p:", style: "{bold}{blue-fg}" },
    // { word: " rpc:", style: "{bold}{blue-fg}" },
    // { word: " state-gen:", style: "{bold}{blue-fg}" },
    // { word: " sync:", style: "{bold}{blue-fg}" },
    // { word: " Syncing:", style: "{bold}{blue-fg}" },
  ];

  // Apply styles to the words
  highlightRules.forEach((rule) => {
    const regex = new RegExp(`(${rule.word})`, "g");
    line = line.replace(regex, `${rule.style}$1{/}`);
  });

  // Highlight words followed by "=" in green
  line = line.replace(/\b(\w+)(?==)/g, "{bold}{green-fg}$1{/}");

  // Highlight words followed by ":" and surrounded by spaces in bold blue
  line = line.replace(/\s(\w+):\s/g, " {bold}{blue-fg}$1:{/} ");

  // Replace three or more consecutive spaces with two spaces
  line = line.replace(/\s{3,}/g, "  ");

  return line;
}
