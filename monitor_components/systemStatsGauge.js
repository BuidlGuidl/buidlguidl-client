import blessed from "blessed";
import {
  getMemoryUsage,
  getDiskUsage,
  getCpuTemperature,
  getDiskWriteSpeed,
} from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";

let systemStatsGauge;

export function createSystemStatsGauge(grid, installDir) {
  // const row = screen.height < layoutHeightThresh ? 5 : 7;
  // const rowSpan = screen.height < layoutHeightThresh ? 2 : 2;

  systemStatsGauge = grid.set(5, 9, 2, 1, blessed.box, {
    label: "System Stats",
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
    tags: true,
  });

  populateSystemStatsGauge(installDir);
  setInterval(() => populateSystemStatsGauge(installDir), 5000);

  return systemStatsGauge;
}

let gaugePercentages = [0, 0, 0];

async function populateSystemStatsGauge(installDir) {
  try {
    const memoryUsage = (await getMemoryUsage()) / 100;
    const diskUsage = (await getDiskUsage(installDir)) / 100;
    const cpuTemp = (await getCpuTemperature()) / 100;
    const diskWriteSpeed = await getDiskWriteSpeed(installDir);

    const gaugeNames = ["DISK WRITES:", "MEMORY", "STORAGE", "CPU TEMP"];
    const gaugeColors = [
      "{cyan-fg}",
      "{magenta-fg}",
      "{blue-fg}",
      "{green-fg}",
    ];
    const units = ["MB/s", "%", "%", "C"];
    const values = [diskWriteSpeed, memoryUsage, diskUsage, cpuTemp];

    const boxWidth = systemStatsGauge.width - 9; // Subtracting 9 for padding/border
    if (boxWidth > 0) {
      let content = "";

      // Iterate over each item
      values.forEach((value, index) => {
        if (index === 0) {
          // Special case for DISK WRITES
          content += `${gaugeColors[index]}${gaugeNames[index]}\n ${value} ${units[index]}{/}\n`;
        } else {
          // For other gauges
          const percentComplete = value > 1 ? 1 : value;
          const percentString = `${Math.floor(percentComplete * 100)}${
            units[index]
          }`;
          const filledBars = Math.floor(boxWidth * percentComplete);
          const bar =
            "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);
          content += `${gaugeColors[index]}${gaugeNames[index]}\n[${bar}] ${percentString}{/}\n`;
        }
      });

      systemStatsGauge.setContent(content.trim());
      systemStatsGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populateSystemStatsGauge(): ${error}`, () => {});
  }
}

// async function populateSystemStatsGauge(installDir) {
//   try {
//     gaugePercentages[0] = (await getMemoryUsage()) / 100;
//     gaugePercentages[1] = (await getDiskUsage(installDir)) / 100;
//     gaugePercentages[2] = (await getCpuTemperature()) / 100;

//     const gaugeNames = ["MEMORY", "STORAGE", "CPU TEMP"];
//     const gaugeColors = ["{magenta-fg}", "{green-fg}", "{blue-fg}"];
//     const units = ["%", "%", "C"];

//     const boxWidth = systemStatsGauge.width - 9; // Subtracting 9 for padding/border
//     if (boxWidth > 0) {
//       let content = "";

//       // Iterate over each stage's percentage and name
//       gaugePercentages.forEach((percentComplete, index) => {
//         // Create the percentage string
//         const percentString = `${Math.floor(percentComplete * 100)}${
//           units[index]
//         }`;

//         if (percentComplete > 1) {
//           percentComplete = 1;
//         }

//         // Calculate the number of filled bars for this stage
//         const filledBars = Math.floor(boxWidth * percentComplete);

//         // Create the bar string
//         const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);

//         // Append the custom stage title, progress bar, and percentage to the content
//         content += `${gaugeColors[index]}${gaugeNames[index]}\n[${bar}] ${percentString}{/}\n`;
//       });

//       systemStatsGauge.setContent(content.trim());

//       systemStatsGauge.screen.render();
//     }
//   } catch (error) {
//     debugToFile(`populateSystemStatsGauge(): ${error}`, () => {});
//   }
// }
