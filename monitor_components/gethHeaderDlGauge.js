import contrib from "blessed-contrib";
import { layoutHeightThresh } from "./helperFunctions.js";

let gethHeaderDlGauge;

export function createGethHeaderDlGauge(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 3 : 6;
  // const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;
  const row = 2;
  const rowSpan = 1;

  gethHeaderDlGauge = grid.set(row, 8, rowSpan, 1, contrib.gauge, {
    label: "Header DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return gethHeaderDlGauge;
}
