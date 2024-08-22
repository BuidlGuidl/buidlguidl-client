import blessed from "blessed";
import { layoutHeightThresh } from "./helperFunctions.js";

let gethStageGauge;

export function createGethStageGauge(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 3 : 6;
  // const rowSpan = screen.height < layoutHeightThresh ? 6 : 3;
  const row = 2;
  const rowSpan = 5;

  gethStageGauge = grid.set(row, 8, rowSpan, 1, blessed.box, {
    label: "Stage Progress",
    content: `INITIALIZING...`,
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
  });

  return gethStageGauge;
}

export function populateGethStageGauge(stagePercentages) {
  // Define the custom stage names inside the function
  const stageNames = ["HEADERS", "STATE", "CHAIN"];

  // Get the width of the gethStageGauge box
  const boxWidth = gethStageGauge.width - 9; // Subtracting 9 for padding/border

  // Initialize the content string
  let content = "";

  // Iterate over each stage's percentage and name
  stagePercentages.forEach((percentComplete, index) => {
    // Calculate the number of filled bars for this stage
    const filledBars = Math.floor(boxWidth * percentComplete);

    // Create the bar string
    const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);

    // Create the percentage string
    const percentString = `${Math.floor(percentComplete * 100)}%`;

    // Append the custom stage title, progress bar, and percentage to the content
    content += `${stageNames[index]}\n[${bar}] ${percentString}\n`;
  });

  // Set the content of the gethStageGauge box
  gethStageGauge.setContent(content.trim());

  // Render the screen to reflect the changes
  gethStageGauge.screen.render();
}
