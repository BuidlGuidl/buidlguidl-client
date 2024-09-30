import blessed from "blessed";
import { exec } from "child_process";
import { debugToFile } from "../helpers.js";
import { localClient } from "./viemClients.js";
import { executionClient, consensusClient } from "../commandLineOptions.js";
import { bgExecutionPeers, bgConsensusPeers } from "../index.js";

let peerCountGauge;

export function createPeerCountGauge(grid) {
  // peerCountGauge = grid.set(2, 9, 1, 1, blessed.box, {
  peerCountGauge = grid.set(2, 8, 2, 1, blessed.box, {
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
    debugToFile(`getExecutionPeers(): ${error}`);
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
          // debugToFile(`getConsensusPeers(): ${error || stderr}`);
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

export async function getBGExecutionPeers() {
  try {
    const curlCommand = `curl -s -X POST --data '{"jsonrpc":"2.0","method":"admin_peers","params":[],"id":1}' -H "Content-Type: application/json" http://localhost:8545`;

    const response = await new Promise((resolve, reject) => {
      exec(curlCommand, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    const parsedResponse = JSON.parse(response);
    const peerIds = parsedResponse.result.map((peer) =>
      peer.id.replace(/^0x/, "")
    );

    // debugToFile(`getBGExecutionPeers(): peerIds: ${peerIds}\n`);

    // Parse bgPeerIds correctly
    const bgPeerIds = bgExecutionPeers
      .map((peer) => {
        const match = peer.match(/^enode:\/\/([^@]+)@/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    // debugToFile(`getBGExecutionPeers(): bgExecutionPeers: ${bgExecutionPeers}\n`);
    // debugToFile(`getBGExecutionPeers(): bgPeerIds: ${bgPeerIds}\n`);

    const matchingPeers = peerIds.filter((id) => bgPeerIds.includes(id));

    return matchingPeers.length;
  } catch (error) {
    debugToFile(`getBGExecutionPeers(): ${error}`);
    return 0;
  }
}

export async function getBGConsensusPeers() {
  try {
    // debugToFile(
    //   `getBGConsensusPeers(): bgConsensusPeers: ${bgConsensusPeers}\n`
    // );

    const curlCommand = `curl -s http://localhost:5052/eth/v1/node/peers`;

    const response = await new Promise((resolve, reject) => {
      exec(curlCommand, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    const parsedResponse = JSON.parse(response);
    const connectedPeers = parsedResponse.data
      .filter((peer) => peer.state === "connected")
      .map((peer) => peer.peer_id);

    // debugToFile(`getBGConsensusPeers(): connectedPeers: ${connectedPeers}\n`);

    // Remove duplicates
    const uniqueConnectedPeers = [...new Set(connectedPeers)];
    // debugToFile(
    //   `getBGConsensusPeers(): uniqueConnectedPeers: ${uniqueConnectedPeers}\n`
    // );

    // Compare with bgConsensusPeers
    const matchingPeers = uniqueConnectedPeers.filter((peerId) =>
      bgConsensusPeers.includes(peerId)
    );

    // debugToFile(`getBGConsensusPeers(): matchingPeers: ${matchingPeers}\n\n\n`);

    return matchingPeers.length;
  } catch (error) {
    // debugToFile(`getBGConsensusPeers(): ${error}`);
    return 0;
  }
}

let peerCounts = [0, 0, 0, 0];

async function populatePeerCountGauge(executionClient, consensusClient) {
  try {
    const gaugeNames = [
      `${executionClient.toUpperCase()} All`,
      `${executionClient.toUpperCase()} BG`,
      `${consensusClient.toUpperCase()} All`,
      `${consensusClient.toUpperCase()} BG`,
    ];
    const gaugeColors = ["{cyan-fg}", "{cyan-fg}", "{green-fg}", "{green-fg}"];
    const maxPeers = [130, 130, 130, 130];

    // Get the execution peers count
    peerCounts[0] = await getExecutionPeers();

    // Try to get the consensus peers count, but handle the failure case
    try {
      peerCounts[1] = await getBGExecutionPeers();
    } catch {
      peerCounts[1] = null; // If there's an error, set it to null
    }

    try {
      peerCounts[2] = await getConsensusPeers(consensusClient);
    } catch {
      peerCounts[2] = 0; // If there's an error, set it to null
    }

    try {
      peerCounts[3] = await getBGConsensusPeers();
    } catch {
      peerCounts[3] = 0; // If there's an error, set it to null
    }

    const boxWidth = peerCountGauge.width - 8; // Subtracting 8 for padding/border
    if (boxWidth > 0) {
      let content = "";

      // Only display the first gauge (Execution) if the second one (Consensus) is null
      peerCounts.forEach((peerCount, index) => {
        // Create the peer count string
        const peerCountString = `${peerCount !== null ? peerCount : "0"}`;

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
    debugToFile(`populatePeerCountGauge(): ${error}`);
  }
}
