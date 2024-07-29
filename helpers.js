import fs from "fs";
import os from "os";
import path from "path";

const installDir = os.homedir();

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

export function debugToFile(data, callback) {
  const filePath = path.join(installDir, "bgnode", "debug.log");
  const now = new Date();
  const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  const content =
    typeof data === "object"
      ? `${timestamp} - ${JSON.stringify(data, null, 2)}\n`
      : `${timestamp} - ${data}\n`;

  fs.writeFile(filePath, content, { flag: "a" }, (err) => {
    if (err) {
    } else {
      if (callback) callback();
    }
  });
}

// function getFormattedDateTime() {
//   const now = new Date();

//   const year = now.getFullYear();
//   const month = (now.getMonth() + 1).toString().padStart(2, "0");
//   const day = now.getDate().toString().padStart(2, "0");
//   const hour = now.getHours().toString().padStart(2, "0");
//   const minute = now.getMinutes().toString().padStart(2, "0");
//   const second = now.getSeconds().toString().padStart(2, "0");

//   return `${year}_${month}_${day}_${hour}_${minute}_${second}`;
// }

// let lastStats = {
//   totalSent: 0,
//   totalReceived: 0,
//   timestamp: Date.now(),
// };

// function getNetworkStats() {
//   return new Promise((resolve, reject) => {
//     si.networkStats()
//       .then((interfaces) => {
//         let currentTotalSent = 0;
//         let currentTotalReceived = 0;

//         interfaces.forEach((iface) => {
//           currentTotalSent += iface.tx_bytes;
//           currentTotalReceived += iface.rx_bytes;
//         });

//         // Calculate time difference in seconds
//         const currentTime = Date.now();
//         const timeDiff = (currentTime - lastStats.timestamp) / 1000;

//         // Calculate bytes per second
//         const sentPerSecond =
//           (currentTotalSent - lastStats.totalSent) / timeDiff;
//         const receivedPerSecond =
//           (currentTotalReceived - lastStats.totalReceived) / timeDiff;

//         // Update last stats for next calculation
//         lastStats = {
//           totalSent: currentTotalSent,
//           totalReceived: currentTotalReceived,
//           timestamp: currentTime,
//         };

//         resolve({
//           sentPerSecond: sentPerSecond / 1000000,
//           receivedPerSecond: receivedPerSecond / 1000000,
//         });
//       })
//       .catch((error) => {
//         debugToFile(
//           `getNetworkStats() Error fetching network stats: ${error}`,
//           () => {}
//         );
//         reject(error);
//       });
//   });
// }

// getNetworkStats();
