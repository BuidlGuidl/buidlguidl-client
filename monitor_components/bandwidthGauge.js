import si from 'systeminformation';
import blessed from 'blessed';

let bandwidthBox;
const interval = 60 * 1000; // 1 minute in milliseconds
const hours24 = 24 * 60; // 24 hours in minutes
const days7 = 7 * 24 * 60 * 60; // 7 days in minutes

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
        console.error("Failed to get network stats:", error);
        return { timestamp: Date.now(), sent: 0, received: 0 };
    }
}

function updateHistory(stats) {
    const currentTime = Date.now();

    if (previousStats) {
        const sentDiff = stats.sent - previousStats.sent;
        const receivedDiff = stats.received - previousStats.received;

        // Add new entry with timestamp
        history24.push({ timestamp: currentTime, sent: sentDiff, received: receivedDiff });
        history7.push({ timestamp: currentTime, sent: sentDiff, received: receivedDiff });

        // Remove old entries
        history24 = history24.filter(entry => currentTime - entry.timestamp <= 24 * 60 * 60 * 1000);
        history7 = history7.filter(entry => currentTime - entry.timestamp <= 7 * 24 * 60 * 60 * 1000);
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

        const formattedText = `▲ 1D: ${formatBytes(dailyStats.sent)}\n▽ 1D: ${formatBytes(dailyStats.received)}\n▲ 7D: ${formatBytes(weeklyStats.sent)}\n▽ 7D: ${formatBytes(weeklyStats.received)}`;

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
    const box = grid.set(6, 8, 1, 1, blessed.box, {
        label: "Bandwidth Usage",
        style: {
            fg: "blue",
        },
        border: {
            type: "line",
            fg: "cyan",
        },
        content: "Calculating...",
    });
    return box;
}

export { updateBandwidthBox };
