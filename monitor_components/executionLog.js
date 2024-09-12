import blessed from "blessed";
import { debugToFile } from "../helpers.js";

export function createExecutionLog(grid, executionClientLabel) {
  // const colSpan = screen.height < layoutHeightThresh ? 7 : 9;

  // const executionLog = grid.set(1, 0, 3, 8, blessed.box, {
  const executionLog = grid.set(1, 0, 3, 7, blessed.box, {
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
