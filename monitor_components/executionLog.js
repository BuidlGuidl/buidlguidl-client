const fs = require("fs");
const path = require("path");
const contrib = require("blessed-contrib");

function createExecutionLog(grid, gethVer, rethVer) {
  const executionLog = grid.set(1, 0, 2, 9, contrib.log, {
    label: `Geth v${gethVer}`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    shrink: true,
  });

  // executionLog.buffer = [];

  // executionLog.log = function (line) {
  //   if (this.buffer.length >= 8) {
  //     this.buffer.shift(); // Remove the oldest line if buffer is full
  //   }
  //   const highlightedLine = highlightWords(line);
  //   this.buffer.push(highlightedLine); // Add the new line to the buffer
  //   this.setContent(this.buffer.join("\n")); // Update the displayed content
  // };

  return executionLog;
}

module.exports = { createExecutionLog };
