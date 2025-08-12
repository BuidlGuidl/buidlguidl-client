import fs from "fs";
import path from "path";
import { installDir } from "./commandLineOptions.js";

// Create the log file path
const LOG_FILE_PATH = path.join(installDir, "requests.log");

// Ensure the log directory exists
const logDir = path.dirname(LOG_FILE_PATH);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Logs request information asynchronously to avoid blocking main request handling
 * @param {Date} requestStartTime - When the request was received
 * @param {number} elapsedMs - Time taken to process the request in milliseconds
 * @param {string} method - RPC method name
 * @param {Array} params - RPC parameters
 * @param {Object} response - RPC response data
 */
export function logRequest(
  requestStartTime,
  elapsedMs,
  method,
  params,
  response
) {
  // Use setImmediate to ensure this runs asynchronously and doesn't block the response
  setImmediate(() => {
    try {
      // Format datetime as 2025-08-07 23:02:06 in UTC
      const datetime = requestStartTime
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);

      // Get epoch timestamp in milliseconds
      const epoch = requestStartTime.getTime();

      // Convert params to string, handling arrays and objects
      const paramsStr = Array.isArray(params)
        ? JSON.stringify(params)
        : String(params || "");

      // Convert response to string, handling objects
      const responseStr =
        typeof response === "object"
          ? JSON.stringify(response)
          : String(response || "");

      // Create log line with | separators
      const logLine = `${datetime} | ${epoch} | ${elapsedMs} | ${method} | ${paramsStr} | ${responseStr}\n`;

      // Append to log file asynchronously
      fs.appendFile(LOG_FILE_PATH, logLine, (err) => {
        if (err) {
          // Don't throw - just silently fail to avoid affecting main application
          console.error("Error writing to requests.log:", err);
        }
      });
    } catch (error) {
      // Don't throw - just silently fail to avoid affecting main application
      console.error("Error in logRequest:", error);
    }
  });
}

/**
 * Gets the current log file path for reference
 * @returns {string} The full path to the requests.log file
 */
export function getLogFilePath() {
  return LOG_FILE_PATH;
}
