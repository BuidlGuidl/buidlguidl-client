import blessed from "blessed";
import { debugToFile } from "../helpers.js";

let gethStageGauge;

export function createGethStageGauge(grid) {
  // const row = screen.height < layoutHeightThresh ? 3 : 6;
  // const rowSpan = screen.height < layoutHeightThresh ? 6 : 3;

  gethStageGauge = grid.set(2, 8, 5, 1, blessed.box, {
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
  try {
    // Define the custom stage names inside the function
    const stageNames = ["HEADERS", "CHAIN", "STATE"];

    // Get the width of the gethStageGauge box
    const boxWidth = gethStageGauge.width - 9; // Subtracting 9 for padding/border
    if (boxWidth > 0) {
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
  } catch (error) {
    debugToFile(`populateGethStageGauge(): ${error}`, () => {});
  }
}
