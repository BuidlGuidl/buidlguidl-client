import blessed from "blessed";
import { layoutHeightThresh } from "./helperFunctions.js";

let chainInfoBox;

export function createChainInfoBox(grid, screen) {
  const row = screen.height < layoutHeightThresh ? 3 : 6;
  const rowSpan = screen.height < layoutHeightThresh ? 6 : 3;

  chainInfoBox = grid.set(row, 7, rowSpan, 1, blessed.box, {
    label: "Chain Info",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
  });

  return chainInfoBox;
}
