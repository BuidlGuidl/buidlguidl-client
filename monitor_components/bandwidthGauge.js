import si from "systeminformation";
import blessed from "blessed";
import { debugToFile } from "../helpers.js";

let bandwidthBox;
const interval = 60 * 1000; // 1 minute in milliseconds

let history24 = [];
let history7 = [];

let previousStats = null;

async function getNetworkStats() {
  try {
    const networkStats = await si.networkStats();
    const totalSent = networkStats.reduce(
      (sum, iface) => sum + iface.tx_bytes,
      0
    );
    const totalReceived = networkStats.reduce(
      (sum, iface) => sum + iface.rx_bytes,
      0
    );
    return { timestamp: Date.now(), sent: totalSent, received: totalReceived };
  } catch (error) {
    debugToFile(`Failed to get network stats: ${error}`, () => {});
    return { timestamp: Date.now(), sent: 0, received: 0 };
  }
}

function updateHistory(stats) {
  const currentTime = Date.now();

  if (previousStats) {
    const sentDiff = stats.sent - previousStats.sent;
    const receivedDiff = stats.received - previousStats.received;

    // Add new entry with timestamp
    history24.push({
      timestamp: currentTime,
      sent: sentDiff,
      received: receivedDiff,
    });
    history7.push({
      timestamp: currentTime,
      sent: sentDiff,
      received: receivedDiff,
    });

    // Remove old entries
    history24 = history24.filter(
      (entry) => currentTime - entry.timestamp <= 24 * 60 * 60 * 1000
    );
    history7 = history7.filter(
      (entry) => currentTime - entry.timestamp <= 7 * 24 * 60 * 60 * 1000
    );
  }
  previousStats = stats;
}

function calculateStatsForPeriod(history) {
  return history.reduce(
    (acc, entry) => ({
      sent: acc.sent + entry.sent,
      received: acc.received + entry.received,
    }),
    { sent: 0, received: 0 }
  );
}

function formatBytes(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

async function updateBandwidthBox(screen) {
  try {
    const stats = await getNetworkStats();
    updateHistory(stats);

    const dailyStats = calculateStatsForPeriod(history24);
    const weeklyStats = calculateStatsForPeriod(history7);

    const formattedText = `{red-fg}▲ 1D: ${formatBytes(
      dailyStats.sent
    )}\n{blue-fg}▼ 1D: ${formatBytes(
      dailyStats.received
    )}\n\n{red-fg}▲ 7D: ${formatBytes(
      weeklyStats.sent
    )}\n{blue-fg}▼ 7D: ${formatBytes(weeklyStats.received)}`;

    bandwidthBox.setContent(formattedText);
    screen.render();
  } catch (error) {
    debugToFile(`Failed to update bandwidth box: ${error}`, () => {});
  }
}

export function setBandwidthBox(box) {
  bandwidthBox = box;
}

export function startBandwidthMonitoring(screen) {
  async function scheduleNextUpdate() {
    const startTime = Date.now();
    await updateBandwidthBox(screen);
    const endTime = Date.now();
    const elapsedTime = endTime - startTime;
    const nextInterval = Math.max(interval - elapsedTime, 0);
    setTimeout(scheduleNextUpdate, nextInterval);
  }

  scheduleNextUpdate();
}

export function createBandwidthBox(grid) {
  // const row = screen.height < layoutHeightThresh ? 3 : 6;
  // const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;

  // const box = grid.set(3, 9, 2, 1, blessed.box, {
  const box = grid.set(3, 8, 2, 1, blessed.box, {
    label: "Bandwidth Usage",
    style: {
      fg: "blue",
    },
    border: {
      type: "line",
      fg: "cyan",
    },
    content: "Calculating...",
    tags: true,
  });
  return box;
}

export { updateBandwidthBox };
