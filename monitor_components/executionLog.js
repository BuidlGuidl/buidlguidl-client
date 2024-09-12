import blessed from "blessed";
import { debugToFile } from "../helpers.js";
import contrib from "blessed-contrib";

export function createExecutionLog(grid, executionClientLabel, screen) {
  // const colSpan = screen.height < layoutHeightThresh ? 7 : 9;

  // const executionLog = grid.set(1, 0, 3, 8, blessed.box, {
  const executionLog = grid.set(1, 0, 3, 7, blessed.log, {
    label: `${executionClientLabel}`,
    content: `Loading ${executionClientLabel} logs`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    wrap: true,
    shrink: true,
  });

  // screen.on("resize", () => {
  //   executionLog.render(); // Re-render the log
  // });

  return executionLog;
}
