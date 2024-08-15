import blessed from "blessed";
import { getMemoryUsage, getDiskUsage } from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";
import { layoutHeightThresh } from "./helperFunctions.js";

let systemStatsGauge;

export function createSystemStatsGauge(grid, screen) {
  const row = screen.height < layoutHeightThresh ? 5 : 7;
  const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;

  systemStatsGauge = grid.set(row, 8, rowSpan, 1, blessed.box, {
    label: "System Stats",
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
  });

  setInterval(() => populateSystemStatsGauge(), 1000);

  return systemStatsGauge;
}

let gaugePercentages = [0, 0];

async function populateSystemStatsGauge() {
  gaugePercentages[0] = (await getMemoryUsage()) / 100;
  gaugePercentages[1] = (await getDiskUsage()) / 100;

  // Define the custom stage names inside the function
  const stageNames = ["MEMORY", "STORAGE"];

  // Get the width of the systemStatsGauge box
  const boxWidth = systemStatsGauge.width - 9; // Subtracting 9 for padding/border

  // Initialize the content string
  let content = "";

  // Iterate over each stage's percentage and name
  gaugePercentages.forEach((percentComplete, index) => {
    // Calculate the number of filled bars for this stage
    const filledBars = Math.floor(boxWidth * percentComplete);

    // Create the bar string
    const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);

    // Create the percentage string
    const percentString = `${Math.floor(percentComplete * 100)}%`;

    // Append the custom stage title, progress bar, and percentage to the content
    content += `${stageNames[index]}\n[${bar}] ${percentString}\n`;
  });

  // Set the content of the systemStatsGauge box
  systemStatsGauge.setContent(content.trim());

  // Render the screen to reflect the changes
  systemStatsGauge.screen.render();
}
