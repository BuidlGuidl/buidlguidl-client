import blessed from "blessed";
import { debugToFile } from "../helpers.js";
import { indexingClient } from "../commandLineOptions.js";
import fs from "fs";
import path from "path";
import { trueBlocksDir } from "../ethereum_client_scripts/trueBlocks.js";

let indexingProgress;

export function createIndexingProgress(grid, screen) {
  indexingProgress = grid.set(7, 8, 2, 2, blessed.box, {
    label: "Indexing",
    content: `Initializing...`,
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
    tags: true,
  });

  populateIndexingProgress(indexingClient);
  setInterval(() => populateIndexingProgress(indexingClient), 1000);

  return indexingProgress;
}

async function populateIndexingProgress(indexingClient) {
  try {
    const boxWidth = indexingProgress.width - 8; // Subtracting 8 for padding/border
    if (boxWidth > 0) {
      const reportPath = path.join(trueBlocksDir, "scraper.report");
      const content = await fs.promises.readFile(reportPath, "utf-8");
      indexingProgress.setContent(content.trim());
      indexingProgress.screen.render();
    }
  } catch (error) {
    debugToFile(`populateIndexingProgress(): ${error}`, () => {});
  }
}
