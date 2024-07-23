import si from "systeminformation";

let bandwidthBox;
const interval = 60 * 1000; // 1 minute in milliseconds
const hours24 = 24 * 60; // 24 hours in minutes
const days7 = 7 * 24 * 60; // 7 days in minutes

let history24 = new Array(hours24).fill({ sent: 0, received: 0 });
let history7 = new Array(days7).fill({ sent: 0, received: 0 });

let currentIndex24 = 0;
let currentIndex7 = 0;
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
    return { sent: totalSent, received: totalReceived };
  } catch (error) {
    console.error("Failed to get network stats:", error);
    return { sent: 0, received: 0 };
  }
}

function updateHistory(stats) {
  if (previousStats) {
    const sentDiff = stats.sent - previousStats.sent;
    const receivedDiff = stats.received - previousStats.received;

    history24[currentIndex24] = { sent: sentDiff, received: receivedDiff };
    history7[currentIndex7] = { sent: sentDiff, received: receivedDiff };

    currentIndex24 = (currentIndex24 + 1) % hours24;
    currentIndex7 = (currentIndex7 + 1) % days7;
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

export async function updateBandwidthBox(screen) {
  try {
    const stats = await getNetworkStats();
    updateHistory(stats);

    const dailyStats = calculateStatsForPeriod(history24);
    const weeklyStats = calculateStatsForPeriod(history7);

    const formattedText = `\x1b[34m⬆\x1b[0m \x1b[37m1D:\x1b[0m ${formatBytes(
      dailyStats.sent
    )}\n\x1b[32m⬇\x1b[0m \x1b[37m1D:\x1b[0m ${formatBytes(
      dailyStats.received
    )}\n\x1b[34m⬆\x1b[0m \x1b[37m7D:\x1b[0m ${formatBytes(
      weeklyStats.sent
    )}\n\x1b[32m⬇\x1b[0m \x1b[37m7D:\x1b[0m ${formatBytes(
      weeklyStats.received
    )}`;

    bandwidthBox.setContent(formattedText);
    screen.render();
  } catch (error) {
    console.error("Failed to update bandwidth box:", error);
  }
}

export function setBandwidthBox(box) {
  bandwidthBox = box;
}

export function startBandwidthMonitoring(screen) {
  setInterval(() => updateBandwidthBox(screen), interval);
}
