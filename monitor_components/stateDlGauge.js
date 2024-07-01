const contrib = require("blessed-contrib");
const fs = require("fs");
const path = require("path");

function createStateDlGauge(grid) {
  let stateDlGauge = grid.set(7, 8, 1, 1, contrib.gauge, {
    label: "State DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return stateDlGauge;
}

module.exports = {
  createStateDlGauge,
};
