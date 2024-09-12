import contrib from "blessed-contrib";
import { debugToFile } from "../helpers.js";
import { getCpuUsage } from "../getSystemStats.js";

let cpuDataX = [];
let dataCpuUsage = [];

async function updateCpuLinePlot(cpuLine, screen) {
  try {
    const currentLoad = await getCpuUsage(); // Get the overall CPU load

    if (currentLoad === undefined || currentLoad === null) {
      throw new Error("Failed to fetch CPU usage data or data is empty");
    }

    const now = new Date();
    const timeLabel = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

    if (!Array.isArray(cpuDataX)) {
      cpuDataX = [];
    }
    if (!Array.isArray(dataCpuUsage)) {
      dataCpuUsage = [];
    }

    cpuDataX.push(timeLabel);
    dataCpuUsage.push(currentLoad);

    // Prepare series data for the overall CPU load
    const series = [
      {
        title: "", // Use an empty string for the title
        x: cpuDataX,
        y: dataCpuUsage,
        style: { line: "cyan" }, // Use the first color
      },
    ];

    cpuLine.setData(series);
    screen.render();

    // Limit data history to the last 60 points
    if (cpuDataX.length > 60) {
      cpuDataX.shift();
      dataCpuUsage.shift();
    }
  } catch (error) {
    debugToFile(
      `updateCpuLinePlot() Failed to update CPU usage line chart: ${error}`,
      () => {}
    );
  }
}

export function createCpuLine(grid, screen) {
  // const cpuLine = grid.set(7, 0, 2, 5, contrib.line, {
  const cpuLine = grid.set(7, 0, 2, 3, contrib.line, {
    style: { line: "blue", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: false,
    wholeNumbersOnly: false,
    label: "CPU Load (%)",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  setInterval(() => updateCpuLinePlot(cpuLine, screen), 1000);

  return cpuLine;
}
