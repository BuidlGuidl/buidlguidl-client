import blessed from "blessed";
import { debugToFile } from "../helpers.js";
import { installDir } from "../commandLineOptions.js";
import { synchronizeAndUpdateWidgets } from "./updateLogic.js";

export async function updateStatusBox(statusBox) {
  try {
    const statusMessage = await synchronizeAndUpdateWidgets(installDir);
    statusBox.setContent(statusMessage);
  } catch (error) {
    debugToFile(`updateStatusBox(): ${error}`);
  }
}

export function createStatusBox(grid) {
  const statusBox = grid.set(1, 7, 1, 2, blessed.box, {
    label: `Status`,
    content: "INITIALIZING...",
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
  });

  return statusBox;
}
