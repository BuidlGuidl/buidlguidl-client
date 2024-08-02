import blessed from "blessed";
import { layoutHeightThresh } from "./helperFunctions.js";

export function createExecutionLog(grid, screen, executionClientLabel) {
  const colSpan = screen.height < layoutHeightThresh ? 7 : 9;

  const executionLog = grid.set(1, 0, 2, colSpan, blessed.box, {
    label: `${executionClientLabel}`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    shrink: true,
  });

  return executionLog;
}
