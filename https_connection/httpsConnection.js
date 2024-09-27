import https from "https";
import os from "os";
import { debugToFile } from "../helpers.js";
import {
  getMemoryUsage,
  getCpuUsage,
  getDiskUsage,
} from "../getSystemStats.js";
import { localClient } from "../monitor_components/viemClients.js";
import { installDir, consensusPeerPorts } from "../commandLineOptions.js";
import {
  getConsensusPeers,
  getExecutionPeers,
} from "../monitor_components/peerCountGauge.js";
import simpleGit from "simple-git";
import path from "path";
import { exec } from "child_process";
import { getPublicIPAddress, getMacAddress } from "../getSystemStats.js";

export let checkIn;

export function initializeHttpConnection(httpConfig) {
  let lastCheckInTime = 0;
  let lastCheckedBlockNumber = -1;
  const minCheckInInterval = 60000; // Minimum 60 seconds between check-ins

  const git = simpleGit();

  // Run getGitInfo() once and store the result
  let gitInfo;
  getGitInfo()
    .then((info) => {
      gitInfo = info;
    })
    .catch((error) => {
      debugToFile(`Failed to get initial git info: ${error}`);
      gitInfo = { branch: "unknown", lastCommitDate: "unknown" };
    });

  async function getGitInfo() {
    try {
      const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
      const lastCommit = await git.log(["--format=%cd", "--date=iso", "-1"]);
      const commitHash = await git.revparse(["HEAD"]); // Add this line to get the commit hash

      let lastCommitDate = "unknown";
      if (lastCommit && lastCommit.latest && lastCommit.latest.hash) {
        const commitDateString = lastCommit.latest.hash;
        try {
          // Directly create a date from the ISO string
          const date = new Date(commitDateString);

          if (!isNaN(date)) {
            lastCommitDate = date
              .toISOString()
              .replace(/T/, " ")
              .replace(/\..+/, "");
          } else {
            throw new Error("Invalid date");
          }
        } catch (error) {
          debugToFile(`Failed to parse commit date: ${error}`);
          debugToFile(`Error stack: ${error.stack}`);
        }
      }

      return {
        branch: branch.trim(),
        lastCommitDate: lastCommitDate,
        commitHash: commitHash.trim(), // Add this line
      };
    } catch (error) {
      debugToFile(`Failed to get git info: ${error}`);
      debugToFile(`Error stack: ${error.stack}`);
      return {
        branch: "unknown",
        lastCommitDate: "unknown",
        commitHash: "unknown",
      };
    }
  }

  checkIn = async function (force = false, blockNumber = null) {
    // debugToFile(`checkIn() called`);
    const now = Date.now();
    if (!force && now - lastCheckInTime < minCheckInInterval) {
      return;
    }

    let currentBlockNumber = blockNumber;
    if (!currentBlockNumber) {
      try {
        currentBlockNumber = await localClient.getBlockNumber();
      } catch (error) {
        debugToFile(`Failed to get block number: ${error}`);
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
      debugToFile(`Failed to get block hash: ${error}`);
    }

    let enode = await getEnodeWithRetry();
    let peerInfo = await getPeerIDWithRetry();

    let peer_id = null;
    let enr = null;

    if (peerInfo) {
      peer_id = peerInfo.peer_id;
      enr = peerInfo.enr;
    }

    debugToFile(`Checkin() enr: ${enr}`);
    debugToFile(`Checkin() Peer ID: ${peer_id}`);

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

      // Use the stored gitInfo instead of calling getGitInfo()
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
        commit_hash: gitInfo.commitHash,
        enode: enode,
        peerid: peer_id,
        enr: enr,
        consensus_tcp_port: consensusPeerPorts[0],
        consensus_udp_port: consensusPeerPorts[1],
      });

      // debugToFile(`Checkin params: ${params.toString()}`);

      const options = {
        hostname: "rpc.buidlguidl.com",
        // hostname: "stage.rpc.buidlguidl.com",
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
          // debugToFile(`Checkin response: ${data}`);
          // debugToFile(`Response status: ${res.statusCode}`);
        });
      });

      req.on("error", (error) => {
        debugToFile(`Checkin error: ${error}`);
      });

      req.end();
    } catch (error) {
      debugToFile(`checkIn() Error: ${error}`);
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
      debugToFile(`Error in block watcher: ${error}`);
    }
  );

  // Regular interval check-in
  setInterval(() => checkIn(true), 60000); // Force check-in every 60 seconds
}

let cachedEnode = null;
let enodeRetries = 0;

async function getEnodeWithRetry(maxRetries = 60) {
  // If we already have a cached enode, return it immediately
  if (cachedEnode) {
    return cachedEnode;
  }
  if (enodeRetries < maxRetries) {
    try {
      const nodeInfo = await getNodeInfo();
      if (nodeInfo.enode) {
        let enode = nodeInfo.enode;
        const publicIPv4 = await getPublicIPAddress();

        // Check if the enode contains an IPv6 address
        if (enode.includes("[") && enode.includes("]")) {
          // Replace IPv6 with public IPv4
          enode = enode.replace(/\[.*?\]/, publicIPv4);
        } else if (enode.includes("@127.") || enode.includes("@0.0.0.0")) {
          // Replace local IPv4 or 0.0.0.0 with public IPv4
          enode = enode.replace(/@(127\.[0-9.]+|0\.0\.0\.0)/, `@${publicIPv4}`);
        }
        // Cache the successful enode
        cachedEnode = enode;
        return enode;
      }
    } catch (error) {
      debugToFile(
        `Failed to get enode (attempt ${enodeRetries + 1}): ${error}`,
        () => {}
      );
    }
    enodeRetries++;
  } else {
    debugToFile(`Failed to get enode after ${maxRetries} attempts`);
    return null;
  }
}

let cachedPeerID = null;
let cachedENR = null;
let peerInfoRetries = 0;

async function getPeerIDWithRetry(maxRetries = 60) {
  // If we already have a cached peer ID and ENR, return them immediately
  if (cachedPeerID && cachedENR) {
    return { peer_id: cachedPeerID, enr: cachedENR };
  }

  if (peerInfoRetries < maxRetries) {
    try {
      const { peer_id, enr } = await getConsensusPeerInfo();
      if (peer_id && enr) {
        // Cache the successful peer ID and ENR
        cachedPeerID = peer_id;
        cachedENR = enr;
        return { peer_id, enr };
      }
    } catch (error) {
      debugToFile(
        `Failed to get peer info (attempt ${peerInfoRetries + 1}): ${error}`,
        () => {}
      );
    }
    peerInfoRetries++;
  } else {
    debugToFile(`Failed to get peer info after ${maxRetries} attempts`);
    return { peer_id: null, enr: null };
  }
}

function getConsensusPeerInfo() {
  return new Promise((resolve, reject) => {
    const command = `curl -s http://localhost:5052/eth/v1/node/identity`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing curl command: ${error}`);
        return;
      }
      if (stderr) {
        reject(`Curl command stderr: ${stderr}`);
        return;
      }
      try {
        const response = JSON.parse(stdout);
        const peer_id = response.data.peer_id;
        const enr = response.data.enr;
        if (peer_id && enr) {
          resolve({ peer_id, enr });
        } else {
          reject("Incomplete peer info received");
        }
      } catch (parseError) {
        reject(`Error parsing JSON response: ${parseError}`);
      }
    });
  });
}

function getConsensusPeerID() {
  return new Promise((resolve, reject) => {
    const command = `curl -s http://localhost:5052/eth/v1/node/identity | grep -o '"peer_id":"[^"]*"' | sed 's/"peer_id":"//;s/"//g'`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing curl command: ${error}`);
        return null;
      }
      if (stderr) {
        reject(`Curl command stderr: ${stderr}`);
        return null;
      }
      const peerID = stdout.trim();
      if (peerID) {
        resolve(peerID);
      } else {
        reject("Empty peer ID received");
      }
    });
  });
}

function getNodeInfo() {
  return new Promise((resolve, reject) => {
    const command = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"admin_nodeInfo","params":[],"id":1}' http://localhost:8545`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing curl command: ${error}`);
        return null;
      }
      if (stderr) {
        reject(`Curl command stderr: ${stderr}`);
        return null;
      }
      try {
        const response = JSON.parse(stdout);
        resolve(response.result);
      } catch (parseError) {
        reject(`Error parsing JSON response: ${parseError}`);
      }
    });
  });
}
