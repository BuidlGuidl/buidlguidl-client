import fs from "fs";
import readline from "readline";
import { formatLogLines } from "./helperFunctions.js";
import { debugToFile } from "../helpers.js";

// export function setupConsensusLogStreaming(logFilePath, log, screen) {
//   let logBuffer = [];
//   let lastSize = 0;

//   const ensureBufferFillsWidget = () => {
//     const visibleHeight = log.height - 2; // Account for border

//     // Only pad if the buffer is already full, otherwise, just ensure it doesn't exceed the height
//     if (logBuffer.length >= visibleHeight) {
//       while (logBuffer.length < visibleHeight) {
//         logBuffer.unshift(""); // Add empty lines at the start if needed
//       }
//     }

//     if (logBuffer.length > visibleHeight) {
//       logBuffer = logBuffer.slice(-visibleHeight); // Trim buffer to fit
//     }
//   };

//   const updateLogContent = () => {
//     try {
//       const stats = fs.statSync(logFilePath);
//       const newSize = stats.size;

//       if (newSize > lastSize) {
//         const newStream = fs.createReadStream(logFilePath, {
//           encoding: "utf8",
//           start: lastSize,
//           end: newSize,
//         });

//         newStream.on("error", (err) => {
//           debugToFile(`Error creating read stream: ${err}`, () => {});
//           // Attempt to recover by resetting lastSize
//           lastSize = 0;
//         });

//         const newRl = readline.createInterface({
//           input: newStream,
//           output: process.stdout,
//           terminal: false,
//         });

//         newRl.on("line", (line) => {
//           logBuffer.push(formatLogLines(line));
//           ensureBufferFillsWidget();
//           log.setContent(logBuffer.join("\n"));
//           screen.render();
//         });

//         newRl.on("close", () => {
//           lastSize = newSize;
//         });

//         newRl.on("error", (err) => {
//           debugToFile(`Error reading log file: ${err}`, () => {});
//           // Attempt to recover by resetting lastSize
//           lastSize = 0;
//         });
//       }
//     } catch (error) {
//       debugToFile(`Error accessing log file: ${error}`, () => {});
//       // Attempt to recover by resetting lastSize
//       lastSize = 0;
//     }
//   };

//   // Initial read to load existing content
//   updateLogContent();

//   // Watch for file changes
//   fs.watchFile(logFilePath, (curr, prev) => {
//     if (curr.mtime > prev.mtime) {
//       updateLogContent();
//     }
//   });
// }
