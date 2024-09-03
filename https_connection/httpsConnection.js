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
import {
  getConsensusPeers,
  getExecutionPeers,
} from "../monitor_components/peerCountGauge.js";
import simpleGit from "simple-git";
import path from "path";

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
  let lastCheckInTime = 0;
  let lastCheckedBlockNumber = -1;
  const minCheckInInterval = 60000; // Minimum 60 seconds between check-ins

  const git = simpleGit();

  async function getGitInfo() {
    try {
      const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
      const lastCommit = await git.log(["--format=%cd", "--date=iso", "-1"]);

      debugToFile(`branch: ${branch}`, () => {});
      debugToFile(`lastCommit: ${JSON.stringify(lastCommit)}`, () => {});

      let lastCommitDate = "unknown";
      if (lastCommit && lastCommit.latest && lastCommit.latest.hash) {
        const commitDateString = lastCommit.latest.hash;
        try {
          // Log the raw date string
          debugToFile(`Raw commit date string: ${commitDateString}`, () => {});

          // Directly create a date from the ISO string
          const date = new Date(commitDateString);

          if (!isNaN(date)) {
            lastCommitDate = date
              .toISOString()
              .replace(/T/, " ")
              .replace(/\..+/, "");
            debugToFile(
              `Converted lastCommitDate: ${lastCommitDate}`,
              () => {}
            );
          } else {
            throw new Error("Invalid date");
          }
        } catch (error) {
          debugToFile(`Failed to parse commit date: ${error}`, () => {});
          debugToFile(`Error stack: ${error.stack}`, () => {});
        }
      }

      return {
        branch: branch.trim(),
        lastCommitDate: lastCommitDate,
      };
    } catch (error) {
      debugToFile(`Failed to get git info: ${error}`, () => {});
      debugToFile(`Error stack: ${error.stack}`, () => {});
      return { branch: "unknown", lastCommitDate: "unknown" };
    }
  }

  checkIn = async function (force = false, blockNumber = null) {
    const now = Date.now();
    if (!force && now - lastCheckInTime < minCheckInInterval) {
      return;
    }

    let currentBlockNumber = blockNumber;
    if (!currentBlockNumber) {
      try {
        currentBlockNumber = await localClient.getBlockNumber();
      } catch (error) {
        debugToFile(`Failed to get block number: ${error}`, () => {});
        return;
      }
    }

    if (!force && currentBlockNumber === lastCheckedBlockNumber) {
      return;
    }

    lastCheckInTime = now;
    lastCheckedBlockNumber = currentBlockNumber;

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

    let possibleBlockNumber = currentBlockNumber;
    let possibleBlockHash;
    try {
      const block = await localClient.getBlock(possibleBlockNumber);
      possibleBlockHash = block.hash;
    } catch (error) {
      debugToFile(`Failed to get block hash: ${error}`, () => {});
    }

    try {
      const cpuUsage = await getCpuUsage();
      const memoryUsage = await getMemoryUsage();
      const diskUsage = await getDiskUsage(installDir);
      const macAddress = await getMacAddress();
      const executionPeers = await getExecutionPeers(
        httpConfig.executionClient
      );
      const consensusPeers = await getConsensusPeers(
        httpConfig.consensusClient
      );

      const gitInfo = await getGitInfo();

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
        execution_peers: executionPeers,
        consensus_peers: consensusPeers,
        git_branch: gitInfo.branch,
        last_commit: gitInfo.lastCommitDate,
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
          debugToFile(`Response status: ${res.statusCode}`, () => {});
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

  // Immediate check-in when monitoring starts
  checkIn(true);

  // Set up block listener
  localClient.watchBlocks(
    {
      onBlock: (block) => {
        if (block.number > 0) {
          checkIn(true, block.number); // Pass block number to checkIn
        }
      },
    },
    (error) => {
      debugToFile(`Error in block watcher: ${error}`, () => {});
    }
  );

  // Regular interval check-in
  setInterval(() => checkIn(true), 60000); // Force check-in every 60 seconds
}
