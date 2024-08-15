import si from "systeminformation";

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
        debugToFile(`Error fetching memory stats: ${error}`, () => {});
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
        debugToFile(
          `getCpuUsage() Error fetching CPU usage stats: ${error}`,
          () => {}
        );
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
        debugToFile(
          `getDiskUsage(): Error fetching disk usage stats: ${error}`,
          () => {}
        );
        reject(error);
      });
  });
}
