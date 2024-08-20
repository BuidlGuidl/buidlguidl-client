import blessed from "blessed";

import { debugToFile } from "../helpers.js";
import { layoutHeightThresh } from "./helperFunctions.js";
import { localClient } from "./viemClients.js";
let peerCountGauge;

export function createPeerCountGauge(grid, screen) {
  peerCountGauge = grid.set(2, 9, 1.05, 1, blessed.box, {
    label: "Peer Count",
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
    tags: true,
  });

  populatePeerCountGauge();
  setInterval(() => populatePeerCountGauge(), 5000);

  return peerCountGauge;
}

async function getExecutionPeers() {
  try {
    const peerCountHex = await localClient.request({
      method: "net_peerCount",
    });
    // Convert the result from hexadecimal to a decimal number
    const peerCount = parseInt(peerCountHex, 16);

    return peerCount;
  } catch (error) {
    debugToFile(`getExecutionPeers(): ${error}`, () => {});
  }
}

let peerCounts = [0, 0];

async function populatePeerCountGauge() {
  try {
    const gaugeNames = ["EXECUTION", "CONSENSUS"];
    const gaugeColors = ["{cyan-fg}", "{green-fg}"];
    const maxPeers = [150, 2];

    peerCounts[0] = await getExecutionPeers();
    peerCounts[1] = await getExecutionPeers();

    const boxWidth = peerCountGauge.width - 8; // Subtracting 9 for padding/border
    let content = "";

    // Iterate over each stage's percentage and name
    peerCounts.forEach((peerCount, index) => {
      // Create the percentage string
      const peerCountString = `${peerCount}`;

      if (peerCount > maxPeers[index]) {
        peerCount = maxPeers[index];
      }

      // Calculate the number of filled bars for this stage
      const filledBars = Math.floor(boxWidth * (peerCount / maxPeers[index]));

      // Create the bar string
      const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);

      // Append the custom stage title, progress bar, and percentage to the content
      content += `${gaugeColors[index]}${gaugeNames[index]}\n[${bar}] ${peerCountString}{/}\n`;
    });

    peerCountGauge.setContent(content.trim());

    peerCountGauge.screen.render();
  } catch (error) {
    debugToFile(`populatePeerCountGauge(): ${error}`, () => {});
  }
}
