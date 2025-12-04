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

    // Define the three main Erigon stages (always displayed)
    // Stage indices from logs: 1=OtterSync, 3=Senders, 4=Execution
    const stageNames = ["OTTERSYNC", "SENDERS", "EXECUTION"];
    const stageIndices = [1, 3, 4]; // Map to actual Erigon stage numbers

    const boxWidth = erigonStageGauge.width - 9;
    const boxHeight = erigonStageGauge.height - 2; // Subtracting 2 for border

    if (boxWidth > 0 && boxHeight > 0) {
      let content = "";

      // Always display all three stages
      for (let i = 0; i < stageNames.length; i++) {
        const stageIndex = stageIndices[i];
        const stage = stageData[stageIndex];
        
        // Default to 0% if stage hasn't started yet
        let percentComplete = 0;
        if (stage && stage.percent !== undefined) {
          percentComplete = stage.percent;
          if (percentComplete > 1) {
            percentComplete = 1;
          }
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
