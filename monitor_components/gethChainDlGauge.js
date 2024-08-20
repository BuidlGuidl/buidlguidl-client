import contrib from "blessed-contrib";
import { layoutHeightThresh } from "./helperFunctions.js";

export function createGethChainDlGauge(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 7 : 8;
  // const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;
  const row = 4;
  const rowSpan = 1;

  const gethChainDlGauge = grid.set(row, 8, rowSpan, 1, contrib.gauge, {
    label: "Chain DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return gethChainDlGauge;
}
