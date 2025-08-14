import blessed from "blessed";
import { debugToFile } from "../helpers.js";
import { getVersionNumber } from "../ethereum_client_scripts/install.js";

// Store Reth version at module level
let rethVersion = null;

// Function to initialize Reth version
function initRethVersion() {
  if (rethVersion === null) {
    rethVersion = getVersionNumber("reth");
  }
  return rethVersion;
}

let rethStageGauge;

export function createRethStageGauge(grid) {
  rethStageGauge = grid.set(1, 7, 6, 2, blessed.box, {
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

  return rethStageGauge;
}

export function populateRethStageGauge(stagePercentages) {
  try {
    let stageNames;

    // Initialize Reth version if not already done
    initRethVersion();

    if (rethVersion >= "1.3.4") {
      stageNames = [
        "HEADERS",
        "BODIES",
        "SENDER RECOVERY",
        "EXECUTION",
        "PRUNE SENDER RECOVERY",
        "MERKLE UNWIND",
        "ACCOUNT HASHING",
        "STORAGE HASHING",
        "MERKLE EXECUTE",
        "TRANSACTION LOOKUP",
        "INDEX STORAGE HIST",
        "INDEX ACCOUNT HIST",
        "PRUNE",
        "FINISH",
      ];
    } else {
      stageNames = [
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
    }

    const boxWidth = rethStageGauge.width - 9;
    const boxHeight = rethStageGauge.height - 2; // Subtracting 2 for border

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

      rethStageGauge.setContent(content.trim());
      rethStageGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populateRethStageGauge(): ${error}`);
  }
}
