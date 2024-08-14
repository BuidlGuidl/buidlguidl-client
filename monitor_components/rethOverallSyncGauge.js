import contrib from "blessed-contrib";
import { layoutHeightThresh } from "./helperFunctions.js";

let rethOverallSyncGauge;

export function createRethOverallSyncGauge(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 5 : 7;
  const row = screen.height < layoutHeightThresh ? 8 : 8;
  const rowSpan = screen.height < layoutHeightThresh ? 2 : 1;

  rethOverallSyncGauge = grid.set(row, 7, rowSpan, 1, contrib.gauge, {
    label: "Overall Sync Progress",
    stroke: "blue",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return rethOverallSyncGauge;
}
