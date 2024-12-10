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

// let proxyUrl = "";

// function setProxyUrl() {
//   try {
//     const currentBranch = execSync("git rev-parse --abbrev-ref HEAD")
//       .toString()
//       .trim();
//     proxyUrl =
//       currentBranch === "main"
//         ? "rpc.buidlguidl.com"
//         : "stage.rpc.buidlguidl.com";
//   } catch (error) {
//     console.error("Error getting Git branch:", error);
//     proxyUrl = "stage.rpc.buidlguidl.com"; // Default to stage if there's an error
//   }
// }

// export function getProxyUrl() {
//   return proxyUrl;
// }

// // Call setProxyUrl when the module is imported
// setProxyUrl();
