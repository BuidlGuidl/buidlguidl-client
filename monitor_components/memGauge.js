const contrib = require("blessed-contrib");
const si = require("systeminformation");

let memGauge;

function getMemoryUsage() {
  return new Promise((resolve, reject) => {
    si.mem()
      .then((memory) => {
        const totalMemory = memory.total;
        const usedMemory = memory.active; // 'active' is usually what's actually used
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;
        resolve(memoryUsagePercent.toFixed(1)); // Return memory usage as a percentage
      })
      .catch((error) => {
        console.error("Error fetching memory stats:", error);
        reject(error);
      });
  });
}

async function updateMemoryGauge(screen) {
  try {
    const memoryUsagePercent = await getMemoryUsage(); // Wait for memory usage stats
    memGauge.setPercent(memoryUsagePercent);
    screen.render();
  } catch (error) {
    console.error("Failed to update memory gauge:", error);
  }
}

function createMemGauge(grid, screen) {
  memGauge = grid.set(7, 8, 1, 1, contrib.gauge, {
    label: "Memory",
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  setInterval(() => updateMemoryGauge(screen), 10000);

  return memGauge;
}

module.exports = { createMemGauge };
