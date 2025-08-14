import contrib from "blessed-contrib";
import si from "systeminformation";
import { debugToFile } from "../helpers.js";

let diskDataX = [];
let writeSpeedY = [];
let readSpeedY = [];
let lastStats = {
  totalWrite: undefined,
  totalRead: undefined,
  timestamp: Date.now(),
};
let firstTime = true;

function getDiskStats(installDir) {
  return new Promise((resolve, reject) => {
    si.fsStats()
      .then((data) => {
        si.fsSize()
          .then((drives) => {
            // Sort drives by the length of their mount point, descending
            drives.sort((a, b) => b.mount.length - a.mount.length);

            // Find the drive with the longest mount point that is a prefix of installDir
            const installDrive = drives.find((drive) => {
              return installDir.startsWith(drive.mount);
            });

            if (installDrive) {
              // Use wx_sec and rx_sec for bytes written and read per second
              const writePerSecond = data.wx_sec / (1024 * 1024); // Convert to MB/s
              const readPerSecond = data.rx_sec / (1024 * 1024); // Convert to MB/s

              const result = {
                writePerSecond: writePerSecond,
                readPerSecond: readPerSecond,
              };

              resolve(result);
            } else {
              reject(new Error(`Drive for ${installDir} not found.`));
            }
          })
          .catch((error) => {
            debugToFile(`Error fetching drive information: ${error}`);
            reject(error);
          });
      })
      .catch((error) => {
        debugToFile(
          `getDiskStats() Error fetching disk stats: ${error}`,
          () => {}
        );
        reject(error);
      });
  });
}

async function updateDiskLinePlot(diskLine, screen, installDir) {
  try {
    const stats = await getDiskStats(installDir);
    const now = new Date();
    diskDataX.push(
      now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds()
    );
    writeSpeedY.push(stats.writePerSecond);
    readSpeedY.push(stats.readPerSecond);

    // debugToFile(`writeSpeedY: ${writeSpeedY}`);
    // debugToFile(`readSpeedY: ${readSpeedY}`);

    var seriesDiskWrite = {
      title: "I",
      x: diskDataX,
      y: writeSpeedY,
      style: { line: "magenta" },
    };
    var seriesDiskRead = {
      title: "O",
      x: diskDataX,
      y: readSpeedY,
      style: { line: "cyan" },
    };

    diskLine.setData([seriesDiskWrite, seriesDiskRead]);
    screen.render();

    // Keep the data arrays from growing indefinitely
    if (diskDataX.length > 60) {
      diskDataX.shift();
      writeSpeedY.shift();
      readSpeedY.shift();
    }
  } catch (error) {
    debugToFile(`updateDiskPlot(): ${error}`);
  }
}

export function createDiskLine(grid, screen, installDir) {
  const diskLine = grid.set(7, 4, 2, 4, contrib.line, {
    style: { line: "yellow", text: "green", baseline: "green" },
    xLabelPadding: 0,
    xPadding: 0,
    showLegend: false,
    wholeNumbersOnly: false,
    label:
      "Disk I/O (MB/sec) [{magenta-fg}I{/magenta-fg} {cyan-fg}O{/cyan-fg}]",
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
  });

  setInterval(() => updateDiskLinePlot(diskLine, screen, installDir), 1000);

  return diskLine;
}
