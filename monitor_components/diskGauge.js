import contrib from "blessed-contrib";
import si from "systeminformation";
import { debugToFile } from "../helpers.js";
import { layoutHeightThresh } from "./helperFunctions.js";

let storageGauge;

export function getDiskUsage() {
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
          debugToFile(`getDiskUsage(): OS Drive not found.`, () => {});
        }

        resolve(diskUsagePercent.toFixed(1));
      })
      .catch((error) => {
        debugToFile(
          `getDiskUsage(): Error fetching disk usage stats: ${error}`,
          () => {}
        );
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
    debugToFile(`Failed to update disk usage donut: ${error}`, () => {});
  }
}

export function createDiskGauge(grid, screen) {
  const row = screen.height < layoutHeightThresh ? 7 : 8;
  const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;

  storageGauge = grid.set(row, 8, rowSpan, 1, contrib.gauge, {
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
