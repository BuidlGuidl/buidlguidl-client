import blessed from "blessed";
import { layoutHeightThresh } from "./helperFunctions.js";

let rethStageGauge;

export function createRethStageGauge(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 3 : 6;
  // const rowSpan = screen.height < layoutHeightThresh ? 6 : 3;
  const row = 2;
  const rowSpan = 5;

  rethStageGauge = grid.set(row, 8, rowSpan, 1, blessed.box, {
    label: "Stage Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
  });

  return rethStageGauge;
}

export function populateRethStageGauge(stagePercentages) {
  // Define the custom stage names inside the function
  const stageNames = [
    "HEADERS",
    "BODIES",
    "SENDER RECOVERY",
    "EXECUTION",
    "MERKLE UNWIND",
    "ACCOUNT HASHING",
    "STORAGE HASHING",
    "MERKLE EXECUTE",
    "TRANSACTION LOOKUP",
    "INDEX STORAGE HIST",
    "INDEX ACCOUNT HIST",
    "FINISH",
  ];

  // Get the width of the rethStageGauge box
  const boxWidth = rethStageGauge.width - 9; // Subtracting 9 for padding/border

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

  // Set the content of the rethStageGauge box
  rethStageGauge.setContent(content.trim());

  // Render the screen to reflect the changes
  rethStageGauge.screen.render();
}
