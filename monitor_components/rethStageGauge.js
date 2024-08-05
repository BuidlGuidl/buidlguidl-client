import contrib from "blessed-contrib";
import { layoutHeightThresh } from "./helperFunctions.js";

let rethStageGauge;

export function createRethStageGauge(grid, screen) {
  const row = screen.height < layoutHeightThresh ? 3 : 6;
  const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;

  rethStageGauge = grid.set(row, 7, rowSpan, 1, contrib.gauge, {
    label: "Stage Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return rethStageGauge;
}
