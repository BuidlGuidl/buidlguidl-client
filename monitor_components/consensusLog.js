const fs = require("fs");
const readline = require("readline");
const contrib = require("blessed-contrib");
const blessed = require("blessed");
const { highlightWords } = require("./helperFunctions");

function createConsensusLog(grid, prysmVer) {
  const consensusLog = grid.set(3, 0, 2, 9, contrib.log, {
    label: `Prysm v${prysmVer}`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    scrollable: true,
    shrink: true,
    alwaysScroll: true,
    scrollOnInput: true,
    wrap: true,
  });

  return consensusLog;
}

function updateConsensusClientInfo(logFilePath, log, screen) {
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
        log.log(highlightWords(line));
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

module.exports = {
  createConsensusLog,
  updateConsensusClientInfo,
  highlightWords,
};