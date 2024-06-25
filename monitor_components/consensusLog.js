const fs = require("fs");
const readline = require("readline");
const contrib = require("blessed-contrib");
const blessed = require("blessed");

function highlightWords(line) {
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
    { word: "WARN", style: "{bold}{red-fg}" },
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

function createConsensusLog(grid) {
  const consensusLog = grid.set(2, 0, 2, 10, contrib.log, {
    label: `Consensus Client Logs`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    scrollable: true,
    shrink: true,
    alwaysScroll: true,
    scrollOnInput: true,
  });

  // Reduce lines shown to prevent overflow
  consensusLog.buffer = [];

  consensusLog.log = function (line) {
    const maxWidth = this.width;
    if (this.buffer.length >= 8) {
      this.buffer.shift();
    }
    const highlightedLine = highlightWords(line);
    this.buffer.push(highlightedLine);
    this.setContent(this.buffer.join("\n"));
  };

  return consensusLog;
}

function setupLogStreamingConsensus(logFilePath, log, screen) {
  const stream = fs.createReadStream(logFilePath, {
    encoding: "utf8",
    flags: "r",
  });

  const rl = readline.createInterface({
    input: stream,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", (line) => {
    log.log(line);
    screen.render();
  });

  rl.on("close", () => {
    // console.log("Log file stream ended");
  });

  rl.on("error", (err) => {
    console.error("Error reading log file:", err);
  });

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
        log.log(line);
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
  setupLogStreamingConsensus,
  highlightWords,
};
