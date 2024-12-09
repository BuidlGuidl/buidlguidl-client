import blessed from "blessed";

export function createExecutionLog(grid, executionClientLabel, screen) {
  const executionLog = grid.set(1, 0, 3, 7, blessed.box, {
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

  return executionLog;
}
