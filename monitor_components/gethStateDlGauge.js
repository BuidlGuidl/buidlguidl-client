import contrib from "blessed-contrib";
import { layoutHeightThresh } from "./helperFunctions.js";

export function createGethStateDlGauge(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 5 : 7;
  // const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;
  const row = 3;
  const rowSpan = 1;

  let gethStateDlGauge = grid.set(row, 8, rowSpan, 1, contrib.gauge, {
    label: "State DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return gethStateDlGauge;
}
