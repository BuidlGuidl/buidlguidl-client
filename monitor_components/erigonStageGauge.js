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

export function populateErigonStageGauge(stagePercentages) {
  try {
    // Initialize Erigon version if not already done
    initErigonVersion();

    // Erigon sync stages
    const stageNames = [
      "HEADERS",
      "BODIES",
      "SENDERS",
      "EXECUTION",
      "HASH STATE",
      "INTERMEDIATE HASHES",
      "ACCOUNT HIST INDEX",
      "STORAGE HIST INDEX",
      "LOG INDEX",
      "CALL TRACES",
      "TX LOOKUP",
      "FINISH",
    ];

    const boxWidth = erigonStageGauge.width - 9;
    const boxHeight = erigonStageGauge.height - 2; // Subtracting 2 for border

    if (boxWidth > 0 && boxHeight > 0) {
      let content = "";
      const maxItems = Math.floor(boxHeight / 2);

      // Display stages based on available space
      let startIndex = 0;
      let endIndex = Math.min(stagePercentages.length, maxItems);

      if (boxHeight >= 24) {
        endIndex = stagePercentages.length;
      }

      for (let i = startIndex; i < endIndex; i++) {
        let percentComplete = stagePercentages[i];
        if (percentComplete > 1) {
          percentComplete = 1;
        }
        const filledBars = Math.max(0, Math.floor(boxWidth * percentComplete));
        const emptyBars = Math.max(0, boxWidth - filledBars);
        const bar = "█".repeat(filledBars) + " ".repeat(emptyBars);
        const percentString = `${Math.floor(percentComplete * 100)}%`;

        content += `${stageNames[i]}\n[${bar}] ${percentString}\n`;
      }

      erigonStageGauge.setContent(content.trim());
      erigonStageGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populateErigonStageGauge(): ${error}`);
  }
}
