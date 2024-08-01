import fs from "fs";
import path from "path";
import os from "os";
import { debugToFile } from "../helpers.js";

const installDir = os.homedir();
const progressFilePath = path.join(
  installDir,
  "bgnode",
  "progressMonitor.json"
);

export function getLatestLogFile(dir, client) {
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
  return logFiles[0];
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
  console.log("progress not loaded");
  return {
    headerDlProgress: 0,
    chainDlProgress: 0,
    stateDlProgress: 0,
    peerCount: 0,
  };
}

export function highlightWords(line) {
  // Define words which should be highlighted in exec and consensus logs
  const highlightRules = [
    { word: "INFO", style: "{bold}{green-fg}" },
    { word: "WARN", style: "{bold}{yellow-fg}" },
    { word: "ERROR", style: "{bold}{red-fg}" },
    { word: "updated", style: "{bold}{yellow-fg}" },
    { word: " backfill:", style: "{bold}{blue-fg}" },
    { word: " blockchain:", style: "{bold}{blue-fg}" },
    { word: " db:", style: "{bold}{blue-fg}" },
    { word: " execution:", style: "{bold}{blue-fg}" },
    { word: " flags:", style: "{bold}{blue-fg}" },
    { word: " filesystem:", style: "{bold}{blue-fg}" },
    { word: " gateway:", style: "{bold}{blue-fg}" },
    { word: " genesis:", style: "{bold}{blue-fg}" },
    { word: " initial-sync:", style: "{bold}{blue-fg}" },
    { word: " node:", style: "{bold}{blue-fg}" },
    { word: " p2p:", style: "{bold}{blue-fg}" },
    { word: " rpc:", style: "{bold}{blue-fg}" },
    { word: " state-gen:", style: "{bold}{blue-fg}" },
    { word: " sync:", style: "{bold}{blue-fg}" },
    { word: " Syncing:", style: "{bold}{blue-fg}" },
  ];

  // Apply styles to the words
  highlightRules.forEach((rule) => {
    const regex = new RegExp(`(${rule.word})`, "g");
    line = line.replace(regex, `${rule.style}$1{/}`);
  });

  // Highlight words followed by "=" in green
  line = line.replace(/\b(\w+)(?==)/g, "{bold}{green-fg}$1{/}");

  return line;
}
