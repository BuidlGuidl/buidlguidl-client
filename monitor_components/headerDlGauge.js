const contrib = require("blessed-contrib");
const fs = require("fs");
const path = require("path");
let headerDlGauge;

function createHeaderDlGauge(grid) {
  headerDlGauge = grid.set(6, 7, 1, 1, contrib.gauge, {
    label: "Header DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return headerDlGauge;
}

module.exports = {
  createHeaderDlGauge,
};
