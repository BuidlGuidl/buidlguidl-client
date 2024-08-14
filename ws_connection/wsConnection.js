import WebSocket from "ws";
import macaddress from "macaddress";
import os from "os";
import { debugToFile } from "../helpers.js";
import { getCpuUsage } from "../monitor_components/cpuLine.js";
import { getMemoryUsage } from "../monitor_components/memGauge.js";
import { getDiskUsage } from "../monitor_components/diskGauge.js";
import { localClient } from "../monitor_components/localClient.js";
import { installDir } from "../helpers.js";

const ws = new WebSocket("ws://rpc.buidlguidl.com:8080");

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

export function initializeWSConnection(wsConfig) {
  ws.on("open", function open() {
    checkIn();
  });

  async function checkIn() {
    let executionClientResponse = wsConfig.executionClient;
    let consensusClientResponse = wsConfig.consensusClient;

    if (wsConfig.executionClient === "geth") {
      executionClientResponse =
        executionClientResponse + " v" + wsConfig.gethVer;
    } else if (wsConfig.executionClient === "reth") {
      executionClientResponse =
        executionClientResponse + " v" + wsConfig.rethVer;
    }

    if (wsConfig.consensusClient === "prysm") {
      consensusClientResponse =
        consensusClientResponse + " v" + wsConfig.prysmVer;
    } else if (wsConfig.consensusClient === "lighthouse") {
      consensusClientResponse =
        consensusClientResponse + " v" + wsConfig.lighthouseVer;
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

      let stringToSend = JSON.stringify({
        id: `${os.hostname()}-${macAddress}-${os.platform()}-${os.arch()}`,
        nodeVersion: `${process.version}`,
        executionClient: executionClientResponse,
        consensusClient: consensusClientResponse,
        cpu: `${cpuUsage.toFixed(1)}`,
        mem: `${memoryUsage}`, // Ensure it's a string
        storage: `${diskUsage}`, // Ensure it's a string
        blockNumber: possibleBlockNumber ? possibleBlockNumber.toString() : "",
        blockHash: possibleBlockHash ? possibleBlockHash : "",
      });
      ws.send(stringToSend);
    } catch (error) {
      debugToFile(`checkIn() Error: ${error}`, () => {});
    }
  }

  setInterval(checkIn, 60000); // Ask every client about their machine every 60 secs

  ws.on("close", function close() {
    console.log("Disconnected from server");
  });

  ws.on("error", function error(err) {
    debugToFile(`WebSocket error: ${err}`, () => {});
  });
}
