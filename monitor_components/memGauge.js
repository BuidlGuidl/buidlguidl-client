import contrib from "blessed-contrib";
import si from "systeminformation";
import { debugToFile } from "../helpers.js";
import { layoutHeightThresh } from "./helperFunctions.js";

let memGauge;

export function getMemoryUsage() {
  return new Promise((resolve, reject) => {
    si.mem()
      .then((memory) => {
        const totalMemory = memory.total;
        const usedMemory = memory.active; // 'active' is usually what's actually used
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;
        resolve(memoryUsagePercent.toFixed(1)); // Return memory usage as a percentage
      })
      .catch((error) => {
        debugToFile(`Error fetching memory stats:: ${error}`, () => {});
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
    debugToFile(`Failed to update memory gauge: ${error}`, () => {});
  }
}

export function createMemGauge(grid, screen) {
  const row = screen.height < layoutHeightThresh ? 5 : 7;
  const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;

  memGauge = grid.set(row, 8, rowSpan, 1, contrib.gauge, {
    label: "Memory",
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    gaugeHeight: 1,
  });

  setInterval(() => updateMemoryGauge(screen), 10000);

  return memGauge;
}
