import https from "https";
import macaddress from "macaddress";
import os from "os";
import { debugToFile } from "../helpers.js";
import {
  getMemoryUsage,
  getCpuUsage,
  getDiskUsage,
} from "../getSystemStats.js";
import { localClient } from "../monitor_components/viemClients.js";
import { installDir } from "../commandLineOptions.js";

export let checkIn;

function getMacAddress() {
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

export function initializeHttpConnection(httpConfig) {
  checkIn = async function () {
    let executionClientResponse = httpConfig.executionClient;
    let consensusClientResponse = httpConfig.consensusClient;

    if (httpConfig.executionClient === "geth") {
      executionClientResponse += " v" + httpConfig.gethVer;
    } else if (httpConfig.executionClient === "reth") {
      executionClientResponse += " v" + httpConfig.rethVer;
    }

    if (httpConfig.consensusClient === "prysm") {
      consensusClientResponse += " v" + httpConfig.prysmVer;
    } else if (httpConfig.consensusClient === "lighthouse") {
      consensusClientResponse += " v" + httpConfig.lighthouseVer;
    }

    let possibleBlockNumber;
    let possibleBlockHash;
    try {
      possibleBlockNumber = await localClient.getBlockNumber();
      const block = await localClient.getBlock();
      possibleBlockHash = block.hash;
    } catch (error) {
      debugToFile(`Failed to get block number: ${error}`, () => {});
    }

    try {
      const cpuUsage = await getCpuUsage();
      const memoryUsage = await getMemoryUsage();
      const diskUsage = await getDiskUsage(installDir);
      const macAddress = await getMacAddress();

      const params = new URLSearchParams({
        id: `${os.hostname()}-${macAddress}-${os.platform()}-${os.arch()}`,
        node_version: `${process.version}`,
        execution_client: executionClientResponse,
        consensus_client: consensusClientResponse,
        cpu_usage: `${cpuUsage.toFixed(1)}`,
        memory_usage: `${memoryUsage}`,
        storage_usage: `${diskUsage}`,
        block_number: possibleBlockNumber ? possibleBlockNumber.toString() : "",
        block_hash: possibleBlockHash ? possibleBlockHash : "",
      });

      const options = {
        hostname: "rpc.buidlguidl.com",
        port: 48544,
        path: `/checkin?${params.toString()}`,
        method: "GET",
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          debugToFile(`Checkin response: ${data}`, () => {});
        });
      });

      req.on("error", (error) => {
        debugToFile(`Checkin error: ${error}`, () => {});
      });

      req.end();
    } catch (error) {
      debugToFile(`checkIn() Error: ${error}`, () => {});
    }
  };

  setInterval(checkIn, 60000); // Check in every 60 seconds
}
