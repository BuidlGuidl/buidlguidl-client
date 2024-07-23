import contrib from "blessed-contrib";
import si from "systeminformation";

let cpuLine;
let cpuDataX = [];
let dataCpuUsage = [];
let screen;

export function getCpuUsage() {
  return new Promise((resolve, reject) => {
    si.currentLoad()
      .then((load) => {
        const currentLoad = load.currentLoad;
        resolve(currentLoad);
      })
      .catch((error) => {
        console.error(`getCpuUsage() Error fetching CPU usage stats: ${error}`);
        reject(error);
      });
  });
}

async function updateCpuLinePlot() {
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
    console.error(
      `updateCpuLinePlot() Failed to update CPU usage line chart: ${error}`
    );
  }
}

export function createCpuLine(grid, blessedScreen) {
  screen = blessedScreen;
  cpuLine = grid.set(5, 0, 2, 7, contrib.line, {
    style: { line: "blue", text: "green", baseline: "green" },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: "CPU Load (%)",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  setInterval(updateCpuLinePlot, 1000);

  return cpuLine;
}
