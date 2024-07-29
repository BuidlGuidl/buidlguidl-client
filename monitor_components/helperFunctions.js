import fs from "fs";
import path from "path";
import os from "os";

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
  } else if (client === "prysm") {
    logFiles = files.filter(
      (file) => file.startsWith("prysm_") && file.endsWith(".log")
    );
  } else {
    console.log("Invalid client specified. Must be 'geth' or 'prysm'");
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
    { word: "number", style: "{bold}{green-fg}" },
    { word: "root", style: "{bold}{green-fg}" },
    { word: "elapsed", style: "{bold}{green-fg}" },
    { word: "hash", style: "{bold}{green-fg}" },
    { word: "epoch", style: "{bold}{green-fg}" },
    { word: "slot", style: "{bold}{green-fg}" },
    { word: "finalizedEpoch", style: "{bold}{green-fg}" },
    { word: "finalizedRoot", style: "{bold}{green-fg}" },
    { word: "attestations", style: "{bold}{green-fg}" },
    { word: "payloadHash", style: "{bold}{green-fg}" },
    { word: "kzgCommitmentCount", style: "{bold}{green-fg}" },
    { word: "inboundTCP", style: "{bold}{green-fg}" },
    { word: "outboundTCP", style: "{bold}{green-fg}" },
    { word: "total", style: "{bold}{green-fg}" },
    { word: "updated", style: "{bold}{yellow-fg}" },
    { word: "WARN", style: "{bold}{yellow-fg}" },
    { word: "ERROR", style: "{bold}{red-fg}" },
    { word: "blockchain:", style: "{bold}{blue-fg}" },
    { word: "p2p:", style: "{bold}{blue-fg}" },
  ];

  // Apply styles to the words
  highlightRules.forEach((rule) => {
    const regex = new RegExp(`(${rule.word})`, "g");
    line = line.replace(regex, `${rule.style}$1{/}`);
  });

  return line;
}
