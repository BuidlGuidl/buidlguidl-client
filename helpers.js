import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

export function setupDebugLogging(debugLogPath) {
  if (fs.existsSync(debugLogPath)) {
    fs.unlinkSync(debugLogPath);
  }

  function logDebug(message) {
    if (typeof message === "object") {
      message = JSON.stringify(message, null, 2);
    }
    fs.appendFileSync(
      debugLogPath,
      `[${new Date().toISOString()}] ${message}\n`
    );
  }

  console.log = function (message, ...optionalParams) {
    if (optionalParams.length > 0) {
      message +=
        " " +
        optionalParams
          .map((param) =>
            typeof param === "object" ? JSON.stringify(param, null, 2) : param
          )
          .join(" ");
    }
    logDebug(message);
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const debugLogPath = path.join(__dirname, "debug.log");

export function debugToFile(data) {
  const now = new Date();
  const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

  let content;
  if (typeof data === "object" && data !== null) {
    content = `${timestamp} - ${JSON.stringify(data, null, 2)}\n`;
  } else {
    content = `${timestamp} - ${data}\n`;
  }

  fs.appendFile(debugLogPath, content, (err) => {
    if (err) {
      console.error("Error writing to log file:", err);
    }
  });
}

export function stripAnsiCodes(input) {
  return input.replace(
    /[\u001b\u009b][[()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nq-uy=><~])/g,
    ""
  );
}

export function getFormattedDateTime() {
  const now = new Date();

  return now
    .toISOString()
    .replace(/T/, "_")
    .replace(/\..+/, "")
    .replace(/:/g, "_");
}

export function syncStatusToFile(data) {
  const now = new Date();
  const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  const syncStatusLogPath = path.join(__dirname, "syncStatus.log");

  // Helper function to convert hex to int
  function convertHexToInt(value) {
    if (typeof value === "string" && value.startsWith("0x")) {
      return parseInt(value, 16);
    }
    return value;
  }

  // Helper function to process an object and add integer values
  function processObject(obj) {
    if (!obj || typeof obj !== "object") return obj;

    const result = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        result[key] = processObject(value);
      } else if (typeof value === "string" && value.startsWith("0x")) {
        result[key] = `${value} | ${convertHexToInt(value)}`;
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  let processedData = processObject(data);
  let content = `\n${timestamp} - ${JSON.stringify(processedData, null, 2)}\n`;

  fs.appendFile(syncStatusLogPath, content, (err) => {
    if (err) {
      console.error("Error writing to sync status log file:", err);
    }
  });
}

export function syncStatusToFileB(data) {
  const now = new Date();
  const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  const syncStatusLogPath = path.join(__dirname, "syncStatusB.log");

  // Sort the data array if it's an array
  const sortedData = Array.isArray(data) ? [...data].sort() : data;

  let content = `\n${timestamp} - ${JSON.stringify(sortedData, null, 2)}\n`;

  fs.appendFile(syncStatusLogPath, content, (err) => {
    if (err) {
      console.error("Error writing to sync status log file:", err);
    }
  });
}
