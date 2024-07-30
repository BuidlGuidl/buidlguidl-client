import fs from "fs";
import readline from "readline";
import contrib from "blessed-contrib";
import { highlightWords } from "./helperFunctions.js";
import { debugToFile } from "../helpers.js";

export function createConsensusLog(grid, prysmVer) {
  const consensusLog = grid.set(3, 0, 2, 9, contrib.log, {
    label: `Prysm v${prysmVer}`,
    border: {
      type: "line",
      fg: "cyan",
    },
    tags: true,
    scrollable: true,
    shrink: true,
    alwaysScroll: true,
    scrollOnInput: true,
    wrap: true,
  });

  return consensusLog;
}

export function updateConsensusClientInfo(logFilePath, log, screen) {
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
        log.log(highlightWords(line));
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
