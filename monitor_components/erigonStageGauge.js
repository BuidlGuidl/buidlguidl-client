import blessed from "blessed";
import { debugToFile } from "../helpers.js";
import { getVersionNumber } from "../ethereum_client_scripts/install.js";

// Store Erigon version at module level
let erigonVersion = null;

// Function to initialize Erigon version
function initErigonVersion() {
  if (erigonVersion === null) {
    erigonVersion = getVersionNumber("erigon");
  }
  return erigonVersion;
}

let erigonStageGauge;

export function createErigonStageGauge(grid) {
  erigonStageGauge = grid.set(2, 7, 5, 1, blessed.box, {
    label: "Sync Progress",
    content: `INITIALIZING...`,
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
  });

  return erigonStageGauge;
}

export function populateErigonStageGauge(stageData) {
  try {
    // Initialize Erigon version if not already done
    initErigonVersion();

    // stageData format: { stageIndex: { name: "OtterSync", percent: 0.1376, totalStages: 6 } }
    const boxWidth = erigonStageGauge.width - 9;
    const boxHeight = erigonStageGauge.height - 2; // Subtracting 2 for border

    if (boxWidth > 0 && boxHeight > 0) {
      let content = "";
      const maxItems = Math.floor(boxHeight / 2);

      // Sort stages by index
      const sortedIndices = Object.keys(stageData)
        .map(Number)
        .sort((a, b) => a - b);

      // Display stages based on available space
      let endIndex = Math.min(sortedIndices.length, maxItems);

      if (boxHeight >= 24) {
        endIndex = sortedIndices.length;
      }

      for (let i = 0; i < endIndex; i++) {
        const stageIndex = sortedIndices[i];
        const stage = stageData[stageIndex];

        if (!stage) continue;

        let percentComplete = stage.percent;
        if (percentComplete > 1) {
          percentComplete = 1;
        }

        const filledBars = Math.max(0, Math.floor(boxWidth * percentComplete));
        const emptyBars = Math.max(0, boxWidth - filledBars);
        const bar = "█".repeat(filledBars) + " ".repeat(emptyBars);
        const percentString = `${Math.floor(percentComplete * 100)}%`;

        // Use the stage name from logs, converted to uppercase for consistency
        const stageName = stage.name.toUpperCase();

        content += `[${stageIndex}/${stage.totalStages}] ${stageName}\n[${bar}] ${percentString}\n`;
      }

      erigonStageGauge.setContent(content.trim());
      erigonStageGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populateErigonStageGauge(): ${error}`);
  }
}
