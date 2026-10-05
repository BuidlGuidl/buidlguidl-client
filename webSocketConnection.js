import https from "https";
import os from "os";
import { debugToFile } from "./helpers.js";
import { getMemoryUsage, getCpuUsage, getDiskUsage } from "./getSystemStats.js";
import { localClient } from "./monitor_components/viemClients.js";
import { watchLocalBlocks } from "./monitor_components/blockWatcher.js";
import {
  installDir,
  consensusPeerPorts,
  owner,
  executionClient,
} from "./commandLineOptions.js";
import {
  getExecutionIpcPath,
  executionIpcRequest,
} from "./ethereum_client_scripts/executionIpc.js";
import {
  getConsensusPeers,
  getExecutionPeers,
} from "./monitor_components/peerCountGauge.js";
import { populateRpcInfoBox } from "./monitor_components/rpcInfoBox.js";
import simpleGit from "simple-git";
import { exec } from "child_process";
import { getPublicIPAddress, getMacAddress } from "./getSystemStats.js";
import { io } from "socket.io-client";
import axios from "axios";
import fs from "fs";
import path from "path";
import { BASE_URL } from "./config.js";
import { readRethSegmentFloor } from "./ethereum_client_scripts/rethReceiptFloor.js";
import { readRethStateHistory } from "./ethereum_client_scripts/rethStateHistory.js";

let socketId;
export let checkIn;
let socket;
const connectionStatus = new Map();

export function isConnected(pid) {
  return connectionStatus.get(pid) || false;
}

let isConnecting = false;
let reconnectTimeout;

const connectionStatusFilePath = path.join(
  installDir,
  "ethereum_clients",
  "websocket_connection_status.json"
);

const lockFilePath = path.join(installDir, "ethereum_clients", "script.lock");
const ethereumClientsDir = path.dirname(lockFilePath);

// Ensure the ethereum_clients directory exists
if (!fs.existsSync(ethereumClientsDir)) {
  fs.mkdirSync(ethereumClientsDir, { recursive: true });
}

export function initializeWebSocketConnection(wsConfig) {
  let lastCheckInTime = 0;
  let lastCheckedBlockNumber = -1;
  const minCheckInInterval = 60000; // Minimum 60 seconds between check-ins
  // Reth history reported on every check-in so the pool can route old-block
  // and old-state requests. Read from disk at startup and every 6 hours
  // (every 60 seconds while any value is still null), never inside checkIn()
  // (which runs every block). A failed read keeps the last good value; null
  // means unknown.
  const rethHistoryRefreshInterval = 6 * 60 * 60 * 1000;
  const rethHistoryRetryInterval = 60 * 1000;
  const rethHistory = {
    receipt_floor: null,
    body_floor: null,
    state_history: null,
  };
  const rethHistoryReaders = {
    receipt_floor: () => readRethSegmentFloor(installDir, "receipts"),
    body_floor: () => readRethSegmentFloor(installDir, "transactions"),
    state_history: () => readRethStateHistory(installDir),
  };
  function refreshRethHistory() {
    for (const [field, read] of Object.entries(rethHistoryReaders)) {
      try {
        const value = read();
        if (value !== undefined) rethHistory[field] = value;
      } catch (err) {
        debugToFile(`refreshRethHistory(${field}): ${err.message}`);
      }
    }
    const anyUnknown = Object.values(rethHistory).some((v) => v === null);
    setTimeout(
      refreshRethHistory,
      anyUnknown ? rethHistoryRetryInterval : rethHistoryRefreshInterval
    );
  }
  if (wsConfig.executionClient === "reth") {
    refreshRethHistory();
  }

  // System stats and peer counts change slowly and take tens to hundreds of
  // ms to gather (df, a curl of the consensus metrics page), so they're read
  // on their own timer and checkIn() sends the latest values instead of making
  // every block check-in wait for them. A failed read keeps the last good
  // value; null means never read.
  const nodeStatsRefreshInterval = 15 * 1000;
  const nodeStats = {
    cpuUsage: null,
    memoryUsage: null,
    diskUsage: null,
    macAddress: null,
    executionPeers: null,
    consensusPeers: null,
  };
  const nodeStatsReaders = {
    cpuUsage: () => getCpuUsage(),
    memoryUsage: () => getMemoryUsage(),
    diskUsage: () => getDiskUsage(installDir),
    macAddress: () => getMacAddress(),
    executionPeers: () => getExecutionPeers(wsConfig.executionClient),
    consensusPeers: () => getConsensusPeers(wsConfig.consensusClient),
  };
  async function refreshNodeStats() {
    await Promise.all(
      Object.entries(nodeStatsReaders).map(async ([field, read]) => {
        try {
          const value = await read();
          if (value !== null && value !== undefined) nodeStats[field] = value;
        } catch (err) {
          debugToFile(`refreshNodeStats(${field}): ${err}`);
        }
      })
    );
  }
  function scheduleNodeStatsRefresh() {
    setTimeout(async () => {
      await refreshNodeStats();
      scheduleNodeStatsRefresh();
    }, nodeStatsRefreshInterval);
  }
  const nodeStatsReady = refreshNodeStats();
  scheduleNodeStatsRefresh();

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

  function updateConnectionStatusFile(status) {
    fs.writeFileSync(
      connectionStatusFilePath,
      JSON.stringify({ connected: status })
    );
  }

  function connectWebSocket() {
    if (isConnecting) return;
    isConnecting = true;

    try {
      // Check if this is a primary instance
      const isPrimary =
        fs.existsSync(lockFilePath) &&
        fs.readFileSync(lockFilePath, "utf8") === process.pid.toString();

      // For non-primary instances, we should still connect to the local RPC
      if (!isPrimary) {
        // Test the RPC connection
        axios
          .post("http://localhost:8545", {
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1,
          })
          .then(() => {
            connectionStatus.set(process.pid, true);
            updateConnectionStatusFile(true);
          })
          .catch(() => {
            connectionStatus.set(process.pid, false);
            updateConnectionStatusFile(false);
          });

        isConnecting = false;
        return;
      }

      // Primary instance Socket.IO connection logic
      socket = io(`wss://${BASE_URL}:48546`, {
        reconnection: true,
        reconnectionDelay: 10000,
        reconnectionAttempts: Infinity,
      });

      socket.on("connect", () => {
        debugToFile("Socket.IO connection established");
        isConnecting = false;
        connectionStatus.set(process.pid, true);
        updateConnectionStatusFile(true);
        clearTimeout(reconnectTimeout);
      });

      socket.on("init", (id) => {
        socketId = id;
        debugToFile(`Socket ID: ${socketId}`);
      });

      socket.on("rpc_request", async (request, callback) => {
        populateRpcInfoBox(request.method);

        const targetUrl = "http://localhost:8545";
        // Well under the pool's Socket.IO message limit, so an oversized
        // response becomes a JSON-RPC error here instead of disconnecting us.
        const maxResponseBytes = 32e6;

        try {
          const rpcResponse = await axios.post(
            targetUrl,
            {
              jsonrpc: "2.0",
              method: request.method,
              params: request.params,
              id: request.id,
            },
            { maxContentLength: maxResponseBytes }
          );

          callback(rpcResponse.data);
        } catch (error) {
          debugToFile("Error returning RPC response:", error);

          if (error.message?.startsWith("maxContentLength size")) {
            callback({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: `Response exceeds node limit of ${maxResponseBytes} bytes`,
              },
              id: request.id,
            });
            return;
          }

          callback({
            jsonrpc: "2.0",
            error: {
              code: -70000,
              message: "Internal node error",
              data: error.message,
            },
            id: request.id,
          });
        }
      });

      socket.on("disconnect", () => {
        socketId = null;
        isConnecting = false;
        connectionStatus.set(process.pid, false);
        updateConnectionStatusFile(false);
        debugToFile("Disconnected from Socket.IO server");
      });

      socket.on("connect_error", (error) => {
        debugToFile(`Socket.IO connection error: ${error}`);
        isConnecting = false;
        connectionStatus.set(process.pid, false);
        updateConnectionStatusFile(false);
      });
    } catch (error) {
      debugToFile(`connectWebSocket error: ${error}`);
      isConnecting = false;
      connectionStatus.set(process.pid, false);
      updateConnectionStatusFile(false);
    }
  }

  connectWebSocket();

  checkIn = async function (force = false, blockNumber = null, blockHash = null) {
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

    let executionClientResponse =
      wsConfig.executionClient + " v" + wsConfig.executionClientVer;
    let consensusClientResponse =
      wsConfig.consensusClient + " v" + wsConfig.consensusClientVer;

    let possibleBlockNumber = currentBlockNumber;
    let possibleBlockHash = blockHash;
    if (!possibleBlockHash) {
      try {
        const block = await localClient.getBlock({
          blockNumber: possibleBlockNumber,
        });
        possibleBlockHash = block.hash;
      } catch (error) {
        debugToFile(`Failed to get block hash: ${error}`);
      }
    }

    let enode = await getEnodeWithRetry();
    let peerInfo = await getPeerIDWithRetry();

    let peer_id = null;
    let enr = null;

    if (peerInfo) {
      peer_id = peerInfo.peer_id;
      enr = peerInfo.enr;
    }

    // debugToFile(`Checkin() enr: ${enr}`);
    // debugToFile(`Checkin() Peer ID: ${peer_id}`);

    // Only waits on the first check-in, before any stats have been read.
    await nodeStatsReady;

    try {
      const {
        cpuUsage,
        memoryUsage,
        diskUsage,
        macAddress,
        executionPeers,
        consensusPeers,
      } = nodeStats;
      const missingStats = Object.keys(nodeStats).filter(
        (field) => nodeStats[field] === null
      );
      if (missingStats.length > 0) {
        debugToFile(`checkIn() skipped, no value yet for: ${missingStats}`);
        return;
      }

      // Use the stored gitInfo instead of calling getGitInfo()
      const params = {
        id: `${os.hostname()}-${macAddress}-${os.platform()}-${os.arch()}`,
        node_version: `${process.version}`,
        execution_client: executionClientResponse,
        consensus_client: consensusClientResponse,
        cpu_usage: `${cpuUsage.toFixed(1)}`,
        memory_usage: `${memoryUsage}`,
        storage_usage: `${diskUsage}`,
        block_number: possibleBlockNumber ? possibleBlockNumber.toString() : "",
        block_hash: possibleBlockHash ? possibleBlockHash : "",
        execution_peers: executionPeers.toString(),
        consensus_peers: consensusPeers.toString(),
        git_branch: gitInfo.branch,
        last_commit: gitInfo.lastCommitDate,
        commit_hash: gitInfo.commitHash,
        enode: enode || "",
        peerid: peer_id || "",
        enr: enr || "",
        consensus_tcp_port: consensusPeerPorts[0].toString(),
        consensus_udp_port: consensusPeerPorts[1].toString(),
        socket_id: socketId || "",
        owner: owner,
      };

      if (wsConfig.executionClient === "reth") {
        params.receipt_floor = rethHistory.receipt_floor;
        params.body_floor = rethHistory.body_floor;
        params.state_history = rethHistory.state_history;
      }

      // debugToFile(`Checkin() params: ${JSON.stringify(params)}`);

      if (socket && socket.connected) {
        socket.emit("checkin", {
          type: "checkin",
          params: params,
        });
      } else {
        debugToFile("Socket.IO is not connected.");
      }
    } catch (error) {
      debugToFile(`checkIn() Error: ${error}`);
    }
  };

  // Immediate check-in when monitoring starts
  checkIn(true);

  let checkInTimer;

  // Function to schedule next check-in
  const scheduleNextCheckIn = () => {
    if (checkInTimer) {
      clearTimeout(checkInTimer);
    }
    checkInTimer = setTimeout(() => {
      checkIn(true);
      scheduleNextCheckIn(); // Schedule next check-in after this one completes
    }, 60000);
  };

  // Initial timer setup
  scheduleNextCheckIn();

  // Check in on every new block. At the chain tip blocks are ~12 s apart and
  // each one is sent right away; while syncing, newHeads can fire many times a
  // second, so check-ins are spaced at least minBlockCheckInGap apart and only
  // the latest block waiting is sent.
  const minBlockCheckInGap = 1000;
  let lastBlockCheckInAt = 0;
  let pendingBlock = null;
  let blockCheckInTimer = null;
  watchLocalBlocks((block) => {
    if (!(block.number > 0)) return;
    pendingBlock = block;
    if (blockCheckInTimer) return;
    const wait = Math.max(
      0,
      lastBlockCheckInAt + minBlockCheckInGap - Date.now()
    );
    blockCheckInTimer = setTimeout(() => {
      const { number, hash } = pendingBlock;
      pendingBlock = null;
      blockCheckInTimer = null;
      lastBlockCheckInAt = Date.now();
      checkIn(true, number, hash); // Check in with new block
      scheduleNextCheckIn(); // Reset the timer
    }, wait);
  });

  setInterval(() => {
    try {
      const statusData = fs.readFileSync(connectionStatusFilePath, "utf8");
      const { connected } = JSON.parse(statusData);
      connectionStatus.set(process.pid, connected);
    } catch (error) {
      debugToFile(`Error reading connection status file: ${error}`);
    }
  }, 5000); // Check every 5 seconds
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
  return executionIpcRequest(
    getExecutionIpcPath(executionClient, installDir),
    "admin_nodeInfo"
  );
}
