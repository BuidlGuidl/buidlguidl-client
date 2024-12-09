import blessed from "blessed";

export function createConsensusLog(grid, consensusClientLabel, screen) {
  const consensusLog = grid.set(4, 0, 3, 7, blessed.box, {
    label: `${consensusClientLabel}`,
    content: `Loading ${consensusClientLabel} logs`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    shrink: true,
    wrap: true,
  });

  return consensusLog;
}
