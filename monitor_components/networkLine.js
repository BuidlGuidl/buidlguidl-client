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
        const sentPerSecond =
          (currentTotalSent - lastStats.totalSent) / timeDiff;
        const receivedPerSecond =
          (currentTotalReceived - lastStats.totalReceived) / timeDiff;

        // Update last stats for next calculation
        lastStats = {
          totalSent: currentTotalSent,
          totalReceived: currentTotalReceived,
          timestamp: currentTime,
        };

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
  const networkLine = grid.set(7, 0, 2, 7, contrib.line, {
    style: { line: "yellow", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: "Network Traffic (MB/sec)",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  setInterval(() => updateNetworkLinePlot(networkLine, screen), 1000);

  return networkLine;
}
