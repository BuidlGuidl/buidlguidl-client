import si from "systeminformation";
import path from "path";
import { debugToFile } from "./helpers.js";

export function getMemoryUsage() {
  return new Promise((resolve, reject) => {
    si.mem()
      .then((memory) => {
        const totalMemory = memory.total;
        const usedMemory = memory.active; // 'active' is usually what's actually used
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;
        resolve(memoryUsagePercent.toFixed(1)); // Return memory usage as a percentage
      })
      .catch((error) => {
        debugToFile(`getMemoryUsage(): ${error}`, () => {});
        reject(error);
      });
  });
}

export function getCpuUsage() {
  return new Promise((resolve, reject) => {
    si.currentLoad()
      .then((load) => {
        const currentLoad = load.currentLoad;
        resolve(currentLoad);
      })
      .catch((error) => {
        debugToFile(`getCpuUsage(): ${error}`, () => {});
        reject(error);
      });
  });
}

export function getDiskUsage(installDir) {
  return new Promise((resolve, reject) => {
    si.fsSize()
      .then((drives) => {
        let diskUsagePercent = 0;

        // Sort drives by the length of their mount point, descending
        drives.sort((a, b) => b.mount.length - a.mount.length);

        // Find the drive with the longest mount point that is a prefix of installDir
        const installDrive = drives.find((drive) => {
          return installDir.startsWith(drive.mount);
        });

        if (installDrive) {
          diskUsagePercent =
            100 - (installDrive.available / installDrive.size) * 100;
        } else {
          debugToFile(
            `getDiskUsage(): Drive for ${installDir} not found.`,
            () => {}
          );
        }

        resolve(diskUsagePercent.toFixed(1));
      })
      .catch((error) => {
        debugToFile(`getDiskUsage(): ${error}`, () => {});
        reject(error);
      });
  });
}

export function getCpuTemperature() {
  return new Promise((resolve, reject) => {
    si.cpuTemperature()
      .then((data) => {
        // debugToFile(`CPU data: ${JSON.stringify(data, null, 2)}`, () => {});

        const cpuTemp = data.main;
        if (cpuTemp !== null && cpuTemp !== undefined) {
          resolve(cpuTemp.toFixed(1)); // Return CPU temperature as a fixed-point number
        } else {
          resolve(0);
        }
      })
      .catch((error) => {
        debugToFile(`Error fetching CPU temperature: ${error}`, () => {});
        reject(error);
      });
  });
}

const HISTORY_DURATION = 10000; // 10 seconds in milliseconds
let diskWriteHistory = [];

export function getDiskWriteSpeed(installDir) {
  return new Promise((resolve, reject) => {
    if (!installDir) {
      debugToFile(`getDiskWriteSpeed(): installDir is undefined`, () => {});
      resolve(0); // Return 0 if installDir is not provided
      return;
    }

    Promise.all([si.fsStats(), si.fsSize()])
      .then(([stats, drives]) => {
        // Find the drive for installDir
        const installDrive = drives
          .sort((a, b) => b.mount.length - a.mount.length)
          .find((drive) => drive.mount && installDir.startsWith(drive.mount));

        if (!installDrive) {
          debugToFile(
            `getDiskWriteSpeed(): Drive for ${installDir} not found`,
            () => {}
          );
          resolve(0);
          return;
        }

        const currentTime = Date.now();
        const currentWriteBytes = stats.wx;

        // Add current data point to history
        diskWriteHistory.push({ time: currentTime, bytes: currentWriteBytes });

        // Remove data points older than HISTORY_DURATION
        diskWriteHistory = diskWriteHistory.filter(
          (point) => currentTime - point.time <= HISTORY_DURATION
        );

        if (diskWriteHistory.length < 2) {
          resolve(0); // Not enough data points to calculate speed
        } else {
          const oldestPoint = diskWriteHistory[0];
          const newestPoint = diskWriteHistory[diskWriteHistory.length - 1];

          const timeDiff = (newestPoint.time - oldestPoint.time) / 1000; // Convert to seconds
          const bytesDiff = newestPoint.bytes - oldestPoint.bytes;
          const writeSpeedMBps = (bytesDiff / timeDiff / (1024 * 1024)).toFixed(
            2
          );

          resolve(writeSpeedMBps);
        }
      })
      .catch((error) => {
        debugToFile(`getDiskWriteSpeed(): ${error}`, () => {});
        reject(error);
      });
  });
}
