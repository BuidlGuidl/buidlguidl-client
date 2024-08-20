import blessed from "blessed";
import { layoutHeightThresh } from "./helperFunctions.js";

export function createExecutionLog(grid, screen, executionClientLabel) {
  // const colSpan = screen.height < layoutHeightThresh ? 7 : 9;
  const colSpan = 8;

  const executionLog = grid.set(1, 0, 3, colSpan, blessed.box, {
    label: `${executionClientLabel}`,
    content: `Loading ${executionClientLabel} logs`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    shrink: true,
  });

  return executionLog;
}
