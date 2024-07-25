import contrib from "blessed-contrib";

export function createChainDlGauge(grid) {
  const chainDlGauge = grid.set(8, 7, 1, 1, contrib.gauge, {
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
