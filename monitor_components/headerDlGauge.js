import contrib from "blessed-contrib";
import { layoutHeightThresh } from "./helperFunctions.js";

let headerDlGauge;

export function createHeaderDlGauge(grid, screen) {
  const row = screen.height < layoutHeightThresh ? 3 : 6;
  const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;

  headerDlGauge = grid.set(row, 7, rowSpan, 1, contrib.gauge, {
    label: "Header DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return headerDlGauge;
}
