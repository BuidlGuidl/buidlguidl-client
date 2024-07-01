const contrib = require("blessed-contrib");
const si = require("systeminformation");

let storageGauge;

function getDiskUsage() {
  return new Promise((resolve, reject) => {
    si.fsSize()
      .then((drives) => {
        let diskUsagePercent = 0;

        const osDrive = drives.find((drive) => {
          return drive.mount === "/" || drive.mount === "C:/";
        });

        if (osDrive) {
          diskUsagePercent = 100 - (osDrive.available / osDrive.size) * 100;
        } else {
          console.error("OS Drive not found.");
        }

        resolve(diskUsagePercent.toFixed(1));
      })
      .catch((error) => {
        console.error("Error fetching disk usage stats:", error);
        reject(error);
      });
  });
}

async function updateDiskGauge(screen) {
  try {
    const diskUsagePercent = await getDiskUsage();
    storageGauge.setPercent(diskUsagePercent);
    screen.render();
  } catch (error) {
    console.error("Failed to update disk usage donut:", error);
  }
}

function createDiskGauge(grid, screen) {
  storageGauge = grid.set(8, 9, 1, 1, contrib.gauge, {
    label: "Storage",
    stroke: "blue",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  setInterval(() => updateDiskGauge(screen), 10000);

  return storageGauge;
}

module.exports = { createDiskGauge };
