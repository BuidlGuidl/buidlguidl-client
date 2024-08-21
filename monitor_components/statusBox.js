import blessed from "blessed";
import { debugToFile } from "../helpers.js";
import { layoutHeightThresh } from "./helperFunctions.js";
import { passStatusMessage } from "./updateLogicExecution.js";

export async function updateStatusBox(statusBox, screen) {
  try {
    const statusMessage = await passStatusMessage();
    statusBox.setContent(statusMessage);
    screen.render();
  } catch (error) {
    debugToFile(`updateStatusBox(): ${error}`, () => {});
  }
}

export function createStatusBox(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 1 : 5;
  // const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;
  const row = 1;
  const rowSpan = 1;

  // debugToFile(`screen.height: ${screen.height}`, () => {});

  const statusBox = grid.set(row, 8, rowSpan, 2, blessed.box, {
    label: `Status`,
    content: "Initializing...",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  // setInterval(() => updateStatusBox(statusBox, screen), 5000);

  return statusBox;
}
