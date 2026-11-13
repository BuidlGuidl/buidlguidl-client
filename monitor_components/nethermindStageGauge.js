import blessed from "blessed";
import { debugToFile } from "../helpers.js";

// Nethermind's Sync Progress box. Same place on screen as the geth and reth
// gauges, but its own widget: rows come from nethermindSyncStages.js.

let nethermindStageGauge;

export function createNethermindStageGauge(grid) {
  nethermindStageGauge = grid.set(2, 7, 5, 1, blessed.box, {
    label: "Sync Progress",
    content: `INITIALIZING...`,
    tags: true,
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
  });

  return nethermindStageGauge;
}

// rows: [{ name, progress, detail }]. A null progress (a stage with no known
// end point) shows its detail in place of the bar; a row with both shows the
// detail on its title line, above the bar.
export function populateNethermindStageGauge(rows) {
  try {
    const boxWidth = nethermindStageGauge.width - 9; // Subtracting 9 for padding/border
    if (boxWidth <= 0) return;
    const content = rows
      .map(({ name, progress, detail }) => {
        if (progress === null) {
          return `${name}\n {yellow-fg}▸ ${detail}{/yellow-fg}`;
        }
        const filledBars = Math.floor(boxWidth * progress);
        const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);
        const title = detail ? `${name}  {yellow-fg}${detail}{/yellow-fg}` : name;
        return `${title}\n[${bar}] ${Math.floor(progress * 100)}%`;
      })
      .join("\n");
    nethermindStageGauge.setContent(content);
    nethermindStageGauge.screen.render();
  } catch (error) {
    debugToFile(`populateNethermindStageGauge(): ${error}`);
  }
}
