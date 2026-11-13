import blessed from "blessed";
import { debugToFile } from "../helpers.js";

let gethStageGauge;

export function createGethStageGauge(grid) {
  gethStageGauge = grid.set(2, 7, 5, 1, blessed.box, {
    label: "Sync Progress",
    content: `INITIALIZING...`,
    tags: true,
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

// Nethermind rows: [{ name, progress, detail }]. A null progress (a stage with
// no known end point) shows its detail text in place of the bar.
export function populateStageRows(rows) {
  try {
    const boxWidth = gethStageGauge.width - 9; // Subtracting 9 for padding/border
    if (boxWidth <= 0) return;
    const content = rows
      .map(({ name, progress, detail }) => {
        if (progress === null) {
          return `${name}\n {yellow-fg}▸ ${detail}{/yellow-fg}`;
        }
        const filledBars = Math.floor(boxWidth * progress);
        const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);
        return `${name}\n[${bar}] ${Math.floor(progress * 100)}%`;
      })
      .join("\n");
    gethStageGauge.setContent(content);
    gethStageGauge.screen.render();
  } catch (error) {
    debugToFile(`populateStageRows(): ${error}`);
  }
}

export function populateGethStageGauge(
  stagePercentages,
  stageNames = ["HEADERS", "CHAIN", "STATE"]
) {
  try {

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
    debugToFile(`populateGethStageGauge(): ${error}`);
  }
}
