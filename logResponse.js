import fs from "fs";
import path from "path";
import si from "systeminformation";
import { installDir } from "./commandLineOptions.js";
import {
  getExecutionPeers,
  getConsensusPeers,
} from "./monitor_components/peerCountGauge.js";

// Create the log file path
const LOG_FILE_PATH = path.join(installDir, "requests.log");

// Ensure the log directory exists
const logDir = path.dirname(LOG_FILE_PATH);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Performance-conscious caching for expensive metrics
let cachedMetrics = {
  networkStats: null,
  peerCounts: null,
  lastNetworkUpdate: 0,
  lastPeerUpdate: 0,
};

// Cache update intervals (in milliseconds)
const NETWORK_CACHE_INTERVAL = 2000; // 2 seconds
const PEER_CACHE_INTERVAL = 5000; // 5 seconds

/**
 * Get network statistics with caching to avoid performance impact
 */
async function getCachedNetworkStats() {
  const now = Date.now();

  if (
    !cachedMetrics.networkStats ||
    now - cachedMetrics.lastNetworkUpdate > NETWORK_CACHE_INTERVAL
  ) {
    try {
      // Run this asynchronously and don't block if it fails
      const networkStats = await si.networkStats();
      const networkInterfaces = await si.networkInterfaces();

      let totalRx = 0,
        totalTx = 0,
        totalErrors = 0,
        totalDropped = 0;

      networkStats.forEach((iface) => {
        totalRx += iface.rx_bytes || 0;
        totalTx += iface.tx_bytes || 0;
        totalErrors += (iface.rx_errors || 0) + (iface.tx_errors || 0);
        totalDropped += (iface.rx_dropped || 0) + (iface.tx_dropped || 0);
      });

      cachedMetrics.networkStats = {
        totalRx,
        totalTx,
        totalErrors,
        totalDropped,
        interfaceCount: networkInterfaces.length,
      };
      cachedMetrics.lastNetworkUpdate = now;
    } catch (error) {
      // Silently fail - don't impact request performance
      cachedMetrics.networkStats = { error: true };
    }
  }

  return cachedMetrics.networkStats;
}

/**
 * Get peer counts with caching
 */
async function getCachedPeerCounts(executionClient, consensusClient) {
  const now = Date.now();

  if (
    !cachedMetrics.peerCounts ||
    now - cachedMetrics.lastPeerUpdate > PEER_CACHE_INTERVAL
  ) {
    try {
      const executionPeers = await getExecutionPeers(executionClient);
      const consensusPeers = await getConsensusPeers(consensusClient);

      cachedMetrics.peerCounts = {
        execution: executionPeers,
        consensus: consensusPeers,
      };
      cachedMetrics.lastPeerUpdate = now;
    } catch (error) {
      cachedMetrics.peerCounts = { error: true };
    }
  }

  return cachedMetrics.peerCounts;
}

/**
 * Calculate byte size of an object/string
 */
function getByteSize(obj) {
  try {
    if (typeof obj === "string") {
      return Buffer.byteLength(obj, "utf8");
    }
    return Buffer.byteLength(JSON.stringify(obj), "utf8");
  } catch (error) {
    return 0;
  }
}

/**
 * Logs request information asynchronously to avoid blocking main request handling
 * @param {Date} requestStartTime - When the request was received
 * @param {number} elapsedMs - Time taken to process the request in milliseconds
 * @param {string} method - RPC method name
 * @param {Array} params - RPC parameters
 * @param {Object} response - RPC response data
 */
export function logRequest(
  requestStartTime,
  elapsedMs,
  method,
  params,
  response
) {
  // Use setImmediate to ensure this runs asynchronously and doesn't block the response
  setImmediate(() => {
    try {
      // Format datetime as 2025-08-07 23:02:06 in UTC
      const datetime = requestStartTime
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);

      // Get epoch timestamp in milliseconds
      const epoch = requestStartTime.getTime();

      // Convert params to string, handling arrays and objects
      const paramsStr = Array.isArray(params)
        ? JSON.stringify(params)
        : String(params || "");

      // Convert response to string, handling objects
      const responseStr =
        typeof response === "object"
          ? JSON.stringify(response)
          : String(response || "");

      // Create log line with | separators
      const logLine = `${datetime} | ${epoch} | ${elapsedMs} | ${method} | ${paramsStr} | ${responseStr}\n`;

      // Append to log file asynchronously
      fs.appendFile(LOG_FILE_PATH, logLine, (err) => {
        if (err) {
          // Don't throw - just silently fail to avoid affecting main application
          console.error("Error writing to requests.log:", err);
        }
      });
    } catch (error) {
      // Don't throw - just silently fail to avoid affecting main application
      console.error("Error in logRequest:", error);
    }
  });
}

/**
 * Enhanced request logging with performance-conscious design
 * @param {Object} timingData - Object containing all timing information
 * @param {string} method - RPC method name
 * @param {Array} params - RPC parameters
 * @param {Object} response - RPC response data
 * @param {Object} wsConfig - WebSocket configuration for peer counts
 */
export function logEnhancedRequest(
  timingData,
  method,
  params,
  response,
  wsConfig = null
) {
  // Use setImmediate to ensure this runs asynchronously and doesn't block the response
  setImmediate(async () => {
    try {
      const { requestStart, preAxios, axiosStart, postAxios, responseSent } =
        timingData;

      // Calculate timing breakdowns
      const totalMs = responseSent - requestStart;
      const preAxiosMs = axiosStart - preAxios; // Time for setup work (populateRpcInfoBox, etc.)
      const axiosMs = postAxios - axiosStart; // Time for actual HTTP call
      const postProcessMs = responseSent - postAxios; // Time for callback and response sending

      // Calculate sizes (fast operations)
      const requestSize = getByteSize(params);
      const responseSize = getByteSize(response);

      // Format datetime
      const datetime = new Date(requestStart)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
      const epoch = requestStart;

      // Get cached network stats (non-blocking)
      const networkStats = await getCachedNetworkStats();

      // Get cached peer counts (non-blocking)
      let peerCounts = null;
      if (wsConfig) {
        peerCounts = await getCachedPeerCounts(
          wsConfig.executionClient,
          wsConfig.consensusClient
        );
      }

      // Convert params and response to strings for logging
      const paramsStr = Array.isArray(params)
        ? JSON.stringify(params)
        : String(params || "");
      const responseStr =
        typeof response === "object"
          ? JSON.stringify(response)
          : String(response || "");

      // Create enhanced log line with additional metrics
      // Format: datetime | epoch | totalMs | preAxiosMs | axiosMs | postProcessMs | method | requestSize | responseSize | networkRx (bytes) | networkTx (bytes) | networkErrors | networkDropped (packets) | executionPeers | consensusPeers | params | response
      // preAxiosMs: Time spent on setup/preparation before making the HTTP call to your local node
      // axiosMs: Time for the actual HTTP request to localhost:8545
      // postProcessMs: Time spent after getting the response from your node but before sending it back to the client
      let logLine = `${datetime} | ${epoch} | ${totalMs} | ${preAxiosMs} | ${axiosMs} | ${postProcessMs} | ${method} | ${requestSize} | ${responseSize}`;

      // Add network stats if available
      if (networkStats && !networkStats.error) {
        logLine += ` | ${networkStats.totalRx} | ${networkStats.totalTx} | ${networkStats.totalErrors} | ${networkStats.totalDropped}`;
      } else {
        logLine += ` | 0 | 0 | 0 | 0`;
      }

      // Add peer counts if available
      if (peerCounts && !peerCounts.error) {
        logLine += ` | ${peerCounts.execution} | ${peerCounts.consensus}`;
      } else {
        logLine += ` | 0 | 0`;
      }

      // Add params and response
      logLine += ` | ${paramsStr} | ${responseStr}\n`;

      // Append to log file asynchronously
      fs.appendFile(LOG_FILE_PATH, logLine, (err) => {
        if (err) {
          // Don't throw - just silently fail to avoid affecting main application
          console.error("Error writing to requests.log:", err);
        }
      });
    } catch (error) {
      // Don't throw - just silently fail to avoid affecting main application
      console.error("Error in logEnhancedRequest:", error);
    }
  });
}

/**
 * Gets the current log file path for reference
 * @returns {string} The full path to the requests.log file
 */
export function getLogFilePath() {
  return LOG_FILE_PATH;
}
