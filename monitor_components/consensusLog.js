import fs from "fs";
import readline from "readline";
import blessed from "blessed";
import { formatLogLines, layoutHeightThresh } from "./helperFunctions.js";
import { debugToFile } from "../helpers.js";

export function createConsensusLog(grid, screen, consensusClientLabel) {
  const colSpan = screen.height < layoutHeightThresh ? 7 : 9;

  const consensusLog = grid.set(3, 0, 2, colSpan, blessed.box, {
    label: `${consensusClientLabel}`,
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

  fs.watchFile(logFilePath, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      const newStream = fs.createReadStream(logFilePath, {
        encoding: "utf8",
        start: prev.size,
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
        // debugToFile(`New log file stream ended`, () => {});
      });

      newRl.on("error", (err) => {
        debugToFile(`Error reading new log file stream: ${err}`, () => {});
      });
    }
  });
}
