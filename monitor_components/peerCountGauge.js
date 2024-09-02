import blessed from "blessed";
import { exec } from "child_process";
import { debugToFile } from "../helpers.js";
import { localClient } from "./viemClients.js";
import { executionClient, consensusClient } from "../commandLineOptions.js";

let peerCountGauge;

export function createPeerCountGauge(grid, screen) {
  peerCountGauge = grid.set(2, 9, 1, 1, blessed.box, {
    label: "Peer Count",
    content: `INITIALIZING...`,
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
    tags: true,
  });

  populatePeerCountGauge(executionClient, consensusClient);
  setInterval(
    () => populatePeerCountGauge(executionClient, consensusClient),
    5000
  );

  return peerCountGauge;
}

//

export async function getExecutionPeers() {
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

export async function getConsensusPeers(consensusClient) {
  let searchString;
  if (consensusClient == "prysm") {
    searchString = 'p2p_peer_count{state="Connected"}';
  } else if (consensusClient == "lighthouse") {
    searchString = "libp2p_peers";
  }
  return new Promise((resolve) => {
    exec(
      `curl -s http://localhost:5054/metrics | grep -E '^${searchString} '`,
      (error, stdout, stderr) => {
        if (error || stderr) {
          // debugToFile(`getConsensusPeers(): ${error || stderr}`, () => {});
          return resolve(null);
        }

        const parts = stdout.trim().split(" ");
        if (parts.length === 2 && parts[0] === searchString) {
          const peerCount = parseInt(parts[1], 10);
          resolve(peerCount);
        } else {
          resolve(null);
        }
      }
    );
  });
}

let peerCounts = [0, 0];

async function populatePeerCountGauge(executionClient, consensusClient) {
  try {
    const gaugeNames = [
      executionClient.toUpperCase(),
      consensusClient.toUpperCase(),
    ];
    const gaugeColors = ["{cyan-fg}", "{green-fg}"];
    const maxPeers = [150, 150];

    // Get the execution peers count
    peerCounts[0] = await getExecutionPeers();

    // Try to get the consensus peers count, but handle the failure case
    try {
      peerCounts[1] = await getConsensusPeers(consensusClient);
    } catch {
      peerCounts[1] = null; // If there's an error, set it to null
    }

    const boxWidth = peerCountGauge.width - 8; // Subtracting 8 for padding/border
    if (boxWidth > 0) {
      let content = "";

      // Only display the first gauge (Execution) if the second one (Consensus) is null
      peerCounts.forEach((peerCount, index) => {
        if (index === 1 && peerCounts[1] === null) return; // Skip Consensus if it's null

        // Create the peer count string
        const peerCountString = `${peerCount !== null ? peerCount : "N/A"}`;

        if (peerCount > maxPeers[index]) {
          peerCount = maxPeers[index];
        }

        // Calculate the number of filled bars for this stage
        const filledBars = Math.floor(boxWidth * (peerCount / maxPeers[index]));

        // Create the bar string
        const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);

        // Append the custom stage title, progress bar, and peer count to the content
        content += `${gaugeColors[index]}${gaugeNames[index]}\n[${bar}] ${peerCountString}{/}\n`;
      });

      peerCountGauge.setContent(content.trim());

      peerCountGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populatePeerCountGauge(): ${error}`, () => {});
  }
}
