const fs = require("fs");
const path = require("path");
const os = require("os");

const installDir = os.homedir();
const progressFilePath = path.join(
  installDir,
  "bgnode",
  "progressMonitor.json"
);

function getLatestLogFile(dir, client) {
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

function saveProgress(progress) {
  //   console.log("Saving progress:", progress);
  fs.writeFileSync(
    progressFilePath,
    JSON.stringify(progress, null, 2),
    "utf-8"
  );
}

function loadProgress() {
  if (fs.existsSync(progressFilePath)) {
    const data = fs.readFileSync(progressFilePath, "utf-8");
    return JSON.parse(data);
  }
  console.log("progress not loaded");
  return {
    headerDlProgress: 0,
    chainDlProgress: 0,
    stateDlProgress: 0,
  };
}

module.exports = {
  loadProgress,
  saveProgress,
  getLatestLogFile,
};
