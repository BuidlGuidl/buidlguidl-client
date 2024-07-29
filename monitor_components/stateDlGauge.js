import contrib from "blessed-contrib";

export function createStateDlGauge(grid) {
  let stateDlGauge = grid.set(7, 7, 1, 1, contrib.gauge, {
    label: "State DL Progress",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return stateDlGauge;
}
