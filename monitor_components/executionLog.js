import blessed from "blessed";
import { debugToFile } from "../helpers.js";

export function createExecutionLog(grid, screen, executionClientLabel) {
  // const colSpan = screen.height < layoutHeightThresh ? 7 : 9;

  const executionLog = grid.set(1, 0, 3, 8, blessed.box, {
    label: `${executionClientLabel}`,
    content: `Loading ${executionClientLabel} logs`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    shrink: true,
  });

  // screen.on("resize", () => {
  //   debugToFile(`screen.height: ${screen.height}`, () => {});

  //   debugToFile(`executionLog.height: ${executionLog.height}`, () => {});
  //   debugToFile(`executionLog.top: ${executionLog.top}`, () => {});
  //   debugToFile(`executionLog.bottom: ${executionLog.bottom}`, () => {});
  // });

  return executionLog;
}
