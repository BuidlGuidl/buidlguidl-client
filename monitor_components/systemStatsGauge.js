import blessed from "blessed";
import {
  getMemoryUsage,
  getDiskUsage,
  getCpuTemperature,
} from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";
import { layoutHeightThresh } from "./helperFunctions.js";

let systemStatsGauge;

export function createSystemStatsGauge(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 5 : 7;
  // const rowSpan = screen.height < layoutHeightThresh ? 2 : 2;
  const row = 5;
  const rowSpan = 2;

  systemStatsGauge = grid.set(row, 9, rowSpan, 1, blessed.box, {
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

  populateSystemStatsGauge();
  setInterval(() => populateSystemStatsGauge(), 5000);

  return systemStatsGauge;
}

let gaugePercentages = [0, 0, 0];

async function populateSystemStatsGauge() {
  try {
    gaugePercentages[0] = (await getMemoryUsage()) / 100;
    gaugePercentages[1] = (await getDiskUsage()) / 100;
    gaugePercentages[2] = (await getCpuTemperature()) / 100;

    const gaugeNames = ["MEMORY", "STORAGE", "CPU TEMP"];
    const gaugeColors = ["{magenta-fg}", "{green-fg}", "{blue-fg}"];
    const units = ["%", "%", "C"];

    const boxWidth = systemStatsGauge.width - 9; // Subtracting 9 for padding/border
    let content = "";

    // Iterate over each stage's percentage and name
    gaugePercentages.forEach((percentComplete, index) => {
      // Create the percentage string
      const percentString = `${Math.floor(percentComplete * 100)}${
        units[index]
      }`;

      if (percentComplete > 1) {
        percentComplete = 1;
      }

      // Calculate the number of filled bars for this stage
      const filledBars = Math.floor(boxWidth * percentComplete);

      // Create the bar string
      const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);

      // Append the custom stage title, progress bar, and percentage to the content
      content += `${gaugeColors[index]}${gaugeNames[index]}\n[${bar}] ${percentString}{/}\n`;
    });

    systemStatsGauge.setContent(content.trim());

    systemStatsGauge.screen.render();
  } catch (error) {
    debugToFile(`populateSystemStatsGauge(): ${error}`, () => {});
  }
}
