import si from "systeminformation";
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

export function getDiskUsage() {
  return new Promise((resolve, reject) => {
    si.fsSize()
      .then((drives) => {
        let diskUsagePercent = 0;

        const osDrive = drives.find((drive) => {
          return drive.mount === "/" || drive.mount === "C:/";
        });

        if (osDrive) {
          diskUsagePercent = 100 - (osDrive.available / osDrive.size) * 100;
        } else {
          debugToFile(`getDiskUsage(): OS Drive not found.`, () => {});
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
