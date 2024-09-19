import si from "systeminformation";
import { debugToFile } from "./helpers.js";
import axios from "axios";
import macaddress from "macaddress";

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
        debugToFile(`getMemoryUsage(): ${error}`);
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
        debugToFile(`getCpuUsage(): ${error}`);
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
        debugToFile(`getDiskUsage(): ${error}`);
        reject(error);
      });
  });
}

export function getCpuTemperature() {
  return new Promise((resolve, reject) => {
    si.cpuTemperature()
      .then((data) => {
        // debugToFile(`CPU data: ${JSON.stringify(data, null, 2)}`);

        const cpuTemp = data.main;
        if (cpuTemp !== null && cpuTemp !== undefined) {
          resolve(cpuTemp.toFixed(1)); // Return CPU temperature as a fixed-point number
        } else {
          resolve(0);
        }
      })
      .catch((error) => {
        debugToFile(`Error fetching CPU temperature: ${error}`);
        reject(error);
      });
  });
}

export async function getPublicIPAddress() {
  while (true) {
    try {
      const response = await axios.get("https://api.ipify.org?format=json");
      return response.data.ip;
    } catch (error) {
      debugToFile(`Error fetching public IP address: ${error}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export function getMacAddress() {
  return new Promise((resolve, reject) => {
    macaddress.all((err, all) => {
      if (err) {
        reject(`Error getting MAC address: ${err}`);
        return;
      }

      // Get the first non-internal MAC address
      let macAddress = null;
      for (const interfaceName in all) {
        const mac = all[interfaceName].mac;
        if (mac && mac !== "00:00:00:00:00:00") {
          macAddress = mac;
          break;
        }
      }

      resolve(macAddress);
    });
  });
}
