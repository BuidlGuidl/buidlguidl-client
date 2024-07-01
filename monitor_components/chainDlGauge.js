const contrib = require("blessed-contrib");
const fs = require("fs");
const path = require("path");

function createChainDlGauge(grid) {
  const chainDlGauge = grid.set(8, 8, 1, 1, contrib.gauge, {
    label: "Chain DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return chainDlGauge;
}

module.exports = {
  createChainDlGauge,
};
