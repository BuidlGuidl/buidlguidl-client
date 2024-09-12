import contrib from "blessed-contrib";
import si from "systeminformation";
import { debugToFile } from "../helpers.js";

let networkDataX = [];
let dataSentY = [];
let dataReceivedY = [];
let lastStats = {
  totalSent: 0,
  totalReceived: 0,
  timestamp: Date.now(),
};
let firstTime = true;

function getNetworkStats() {
  return new Promise((resolve, reject) => {
    si.networkStats()
      .then((interfaces) => {
        let currentTotalSent = 0;
        let currentTotalReceived = 0;

        interfaces.forEach((iface) => {
          currentTotalSent += iface.tx_bytes;
          currentTotalReceived += iface.rx_bytes;
        });

        // Calculate time difference in seconds
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastStats.timestamp) / 1000;

        // Calculate bytes per second
        let sentPerSecond = (currentTotalSent - lastStats.totalSent) / timeDiff;
        let receivedPerSecond =
          (currentTotalReceived - lastStats.totalReceived) / timeDiff;

        // Update last stats for next calculation
        lastStats = {
          totalSent: currentTotalSent,
          totalReceived: currentTotalReceived,
          timestamp: currentTime,
        };

        if (sentPerSecond < 0 || sentPerSecond > 1000000000) {
          sentPerSecond = 0;
        }

        if (receivedPerSecond < 0 || receivedPerSecond > 1000000000) {
          receivedPerSecond = 0;
        }

        if (firstTime) {
          resolve({
            sentPerSecond: 0,
            receivedPerSecond: 0,
          });

          firstTime = false;
        } else {
          resolve({
            sentPerSecond: sentPerSecond / 1000000,
            receivedPerSecond: receivedPerSecond / 1000000,
          });
        }
      })
      .catch((error) => {
        debugToFile(
          `getNetworkStats() Error fetching network stats: ${error}`,
          () => {}
        );
        reject(error);
      });
  });
}

async function updateNetworkLinePlot(networkLine, screen) {
  try {
    const stats = await getNetworkStats();
    const now = new Date();
    networkDataX.push(
      now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds()
    );
    dataSentY.push(stats.sentPerSecond);
    dataReceivedY.push(stats.receivedPerSecond);

    var seriesNetworkSent = {
      title: "Sent",
      x: networkDataX,
      y: dataSentY,
      style: { line: "red" },
    };
    var seriesNetworkReceived = {
      title: "Received",
      x: networkDataX,
      y: dataReceivedY,
      style: { line: "blue" },
    };

    networkLine.setData([seriesNetworkSent, seriesNetworkReceived]);
    screen.render();

    // Keep the data arrays from growing indefinitely
    if (networkDataX.length > 60) {
      networkDataX.shift();
      dataSentY.shift();
      dataReceivedY.shift();
    }
  } catch (error) {
    debugToFile(`updateNetworkPlot(): ${error}`, () => {});
  }
}

export function createNetworkLine(grid, screen) {
  // const networkLine = grid.set(7, 5, 2, 5, contrib.line, {
  const networkLine = grid.set(7, 3, 2, 3, contrib.line, {
    style: { line: "yellow", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: false,
    wholeNumbersOnly: false,
    label:
      "Network Traffic (MB/sec) [{red-fg}Tx{/red-fg} {blue-fg}Rx{/blue-fg}]",
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
  });

  setInterval(() => updateNetworkLinePlot(networkLine, screen), 1000);

  return networkLine;
}
