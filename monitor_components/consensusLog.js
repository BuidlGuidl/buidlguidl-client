import fs from "fs";
import readline from "readline";
import blessed from "blessed";
import { formatLogLines } from "./helperFunctions.js";
import { debugToFile } from "../helpers.js";

export function createConsensusLog(grid, screen, consensusClientLabel) {
  // const colSpan = screen.height < layoutHeightThresh ? 7 : 9;

  const consensusLog = grid.set(4, 0, 3, 8, blessed.box, {
    label: `${consensusClientLabel}`,
    content: `Loading ${consensusClientLabel} logs`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    shrink: true,
  });

  return consensusLog;
}

export function updateConsensusClientInfo(logFilePath, log, screen) {
  let logBuffer = [];
  let lastSize = 0;

  const updateLogContent = () => {
    try {
      const stats = fs.statSync(logFilePath);
      const newSize = stats.size;

      if (newSize > lastSize) {
        const newStream = fs.createReadStream(logFilePath, {
          encoding: "utf8",
          start: lastSize,
          end: newSize,
        });

        const newRl = readline.createInterface({
          input: newStream,
          output: process.stdout,
          terminal: false,
        });

        newRl.on("line", (line) => {
          logBuffer.push(formatLogLines(line));

          if (logBuffer.length > log.height - 2) {
            logBuffer.shift();
          }

          log.setContent(logBuffer.join("\n"));
          screen.render();
        });

        newRl.on("close", () => {
          lastSize = newSize;
        });

        newRl.on("error", (err) => {
          debugToFile(`Error reading log file: ${err}`, () => {});
        });
      }
    } catch (error) {
      debugToFile(`Error accessing log file: ${error}`, () => {});
    }
  };

  // Initial read to load existing content
  updateLogContent();

  // Watch for file changes
  fs.watchFile(logFilePath, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      updateLogContent();
    }
  });
}

// export function updateConsensusClientInfo(logFilePath, log, screen) {
//   let logBuffer = [];

//   fs.watchFile(logFilePath, (curr, prev) => {
//     if (curr.mtime > prev.mtime) {
//       const newStream = fs.createReadStream(logFilePath, {
//         encoding: "utf8",
//         start: prev.size,
//       });

//       const newRl = readline.createInterface({
//         input: newStream,
//         output: process.stdout,
//         terminal: false,
//       });

//       newRl.on("line", (line) => {
//         logBuffer.push(formatLogLines(line));

//         if (logBuffer.length > log.height - 2) {
//           logBuffer.shift();
//         }

//         log.setContent(logBuffer.join("\n"));
//         screen.render();
//       });

//       newRl.on("close", () => {
//         // debugToFile(`New log file stream ended`, () => {});
//       });

//       newRl.on("error", (err) => {
//         debugToFile(`Error reading new log file stream: ${err}`, () => {});
//       });
//     }
//   });
// }
