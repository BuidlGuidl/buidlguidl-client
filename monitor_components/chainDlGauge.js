import contrib from "blessed-contrib";
import { layoutHeightThresh } from "./helperFunctions.js";

export function createChainDlGauge(grid, screen) {
  const row = screen.height < layoutHeightThresh ? 7 : 8;
  const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;

  const chainDlGauge = grid.set(row, 7, rowSpan, 1, contrib.gauge, {
    label: "Chain DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return chainDlGauge;
}
