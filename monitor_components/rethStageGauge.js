import blessed from "blessed";
import { debugToFile } from "../helpers.js";

let rethStageGauge;

export function createRethStageGauge(grid) {
  // const row = screen.height < layoutHeightThresh ? 3 : 6;
  // const rowSpan = screen.height < layoutHeightThresh ? 6 : 3;

  rethStageGauge = grid.set(2, 8, 5, 1, blessed.box, {
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

  return rethStageGauge;
}

export function populateRethStageGauge(stagePercentages) {
  try {
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

    const boxWidth = rethStageGauge.width - 9;
    const boxHeight = rethStageGauge.height - 2; // Subtracting 2 for border

    if (boxWidth > 0 && boxHeight > 0) {
      let content = "";
      const maxItems = Math.floor(boxHeight / 2);

      // Find the last completed stage
      const lastCompletedIndex = stagePercentages.lastIndexOf(1);

      let startIndex = lastCompletedIndex;
      let endIndex = Math.min(stagePercentages.length, startIndex + maxItems);

      if (boxHeight >= 24) {
        startIndex = 0;
        endIndex = stagePercentages.length;
      }

      for (let i = startIndex; i < endIndex; i++) {
        const percentComplete = stagePercentages[i];
        const filledBars = Math.floor(boxWidth * percentComplete);
        const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);
        const percentString = `${Math.floor(percentComplete * 100)}%`;
        content += `${stageNames[i]}\n[${bar}] ${percentString}\n`;
      }

      rethStageGauge.setContent(content.trim());
      rethStageGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populateRethStageGauge(): ${error}`, () => {});
  }
}
