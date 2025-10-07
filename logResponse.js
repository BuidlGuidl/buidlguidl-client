import fs from "fs";
import path from "path";
import si from "systeminformation";
import { installDir } from "./commandLineOptions.js";
import { BASE_URL } from "./config.js";
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
  socketMetrics: null,
  systemMetrics: null,
  lastNetworkUpdate: 0,
  lastPeerUpdate: 0,
  lastSocketUpdate: 0,
  lastSystemUpdate: 0,
};

// Cache update intervals (in milliseconds)
const NETWORK_CACHE_INTERVAL = 2000; // 2 seconds
const PEER_CACHE_INTERVAL = 5000; // 5 seconds
const SOCKET_CACHE_INTERVAL = 1000; // 1 second for socket metrics
const SYSTEM_CACHE_INTERVAL = 1000; // 1 second for system metrics

// Global variables for tracking metrics
let lastEventLoopCheck = Date.now();
let eventLoopDelayHistory = [];

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

      let totalErrors = 0,
        totalDropped = 0;

      networkStats.forEach((iface) => {
        totalErrors += (iface.rx_errors || 0) + (iface.tx_errors || 0);
        totalDropped += (iface.rx_dropped || 0) + (iface.tx_dropped || 0);
      });

      cachedMetrics.networkStats = {
        totalErrors,
        totalDropped,
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
 * Measure event loop delay
 */
function measureEventLoopDelay() {
  const start = Date.now();
  setImmediate(() => {
    const delay = Date.now() - start;
    eventLoopDelayHistory.push(delay);

    // Keep only last 10 measurements
    if (eventLoopDelayHistory.length > 10) {
      eventLoopDelayHistory.shift();
    }
  });

  // Return average of recent measurements
  if (eventLoopDelayHistory.length === 0) return 0;
  return Math.round(
    eventLoopDelayHistory.reduce((a, b) => a + b, 0) /
      eventLoopDelayHistory.length
  );
}

/**
 * Perform traceroute analysis to key endpoints
 */
async function performTracerouteAnalysis() {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // Try different traceroute commands based on platform
    let command;
    if (process.platform === "darwin") {
      // macOS - use traceroute with different flags
      command = `traceroute -m 10 -w 2000 -q 1 ${BASE_URL}`;
    } else {
      // Linux - standard traceroute
      command = `traceroute -m 10 -w 2 ${BASE_URL}`;
    }

    const { stdout } = await execAsync(command, {
      timeout: 15000, // Increased timeout
    });

    // Count hops (lines with hop numbers)
    const lines = stdout.split("\n");
    const hopLines = lines.filter((line) => /^\s*\d+/.test(line));

    return hopLines.length > 0 ? hopLines.length : -1;
  } catch (error) {
    // If traceroute fails, try a simpler approach with ping
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // Use ping to test connectivity (much more reliable)
      const { stdout } = await execAsync(`ping -c 1 -t 10 ${BASE_URL}`, {
        timeout: 5000,
      });

      // If ping succeeds, return 0 to indicate "reachable but hop count unknown"
      return stdout.includes("bytes from") ? 0 : -1;
    } catch (pingError) {
      // Both traceroute and ping failed
      return -1;
    }
  }
}

/**
 * Get cached system metrics (DNS, event loop, etc.)
 */
async function getCachedSystemMetrics() {
  const now = Date.now();

  if (
    !cachedMetrics.systemMetrics ||
    now - cachedMetrics.lastSystemUpdate > SYSTEM_CACHE_INTERVAL
  ) {
    try {
      // Measure DNS resolution time for a known host
      const dnsStart = Date.now();
      try {
        await import("dns").then((dns) => {
          return new Promise((resolve, reject) => {
            dns.lookup("google.com", (err, address) => {
              if (err) reject(err);
              else resolve(address);
            });
          });
        });
        var dnsTime = Date.now() - dnsStart;
      } catch (dnsError) {
        var dnsTime = -1; // DNS resolution failed
      }

      // Perform traceroute analysis (less frequently)
      let traceHops = cachedMetrics.systemMetrics?.traceHops || 0;
      if (
        !cachedMetrics.systemMetrics ||
        now - cachedMetrics.lastSystemUpdate > 60000
      ) {
        traceHops = await performTracerouteAnalysis();
      }

      cachedMetrics.systemMetrics = {
        dnsResolutionMs: dnsTime,
        eventLoopDelay: measureEventLoopDelay(),
        traceHops,
      };
      cachedMetrics.lastSystemUpdate = now;
    } catch (error) {
      cachedMetrics.systemMetrics = {
        dnsResolutionMs: -1,
        eventLoopDelay: 0,
        traceHops: -1,
        error: true,
      };
    }
  }

  return cachedMetrics.systemMetrics;
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

      // Get cached system metrics (non-blocking)
      const systemMetrics = await getCachedSystemMetrics();

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
      // Format: datetime | epoch | method | requestSize | responseSize | totalMs | preAxiosMs | axiosMs | postProcessMs | socketProcessingMs | wsLatency | socketToHandlerMs | dnsResolutionMs | eventLoopDelay | socketQueueDepth | connectionStable | networkErrors | networkDropped | executionPeers | consensusPeers | traceHops | params | response
      //
      // Field Descriptions:
      // datetime: Request timestamp in YYYY-MM-DD HH:MM:SS format
      // epoch: Request timestamp in milliseconds since epoch
      // method: RPC method name (e.g., eth_getBlockByNumber)
      // requestSize: Size of request parameters in bytes
      // responseSize: Size of response data in bytes
      // totalMs: Total time from request received to response sent
      // preAxiosMs: Time for setup work (populateRpcInfoBox, variable assignments)
      // axiosMs: Time for HTTP call to localhost:8545 (your local node)
      // postProcessMs: Time for callback execution and response sending
      // socketProcessingMs: Socket.IO internal processing overhead
      // wsLatency: WebSocket connection latency (ping/pong time)
      // socketToHandlerMs: Time from Socket.IO message receipt to handler start
      // dnsResolutionMs: DNS resolution time for any lookups
      // eventLoopDelay: Node.js event loop delay measurement
      // socketQueueDepth: Number of queued messages in Socket.IO
      // connectionStable: Connection stability indicator (1=stable, 0=unstable)
      // networkErrors: Total network errors across all interfaces
      // networkDropped: Total dropped packets across all interfaces
      // executionPeers: Number of execution client peers
      // consensusPeers: Number of consensus client peers
      // traceHops: Network hops to BuidlGuidl endpoint (>0=actual hops, 0=reachable but unknown, -1=unreachable/failed)
      // params: Request parameters (JSON)
      // response: Response data (JSON)
      // Extract timing data passed from webSocketConnection.js
      const socketProcessingMs = timingData.socketProcessingMs || 0; // Socket.IO internal processing overhead
      const wsLatency = timingData.wsLatency || 0; // WebSocket connection latency (ping/pong time)
      const socketToHandlerMs = timingData.socketToHandlerMs || 0; // Time from Socket.IO message receipt to handler start
      const socketQueueDepth = timingData.socketQueueDepth || 0; // Number of queued messages in Socket.IO
      const connectionStable = timingData.connectionStable || 0; // Connection stability indicator (1=stable, 0=unstable)

      // Get system metrics
      const dnsResolutionMs =
        systemMetrics && !systemMetrics.error
          ? systemMetrics.dnsResolutionMs
          : -1;
      const eventLoopDelay =
        systemMetrics && !systemMetrics.error
          ? systemMetrics.eventLoopDelay
          : 0;
      const traceHops =
        systemMetrics && !systemMetrics.error ? systemMetrics.traceHops : -1;

      let logLine = `${datetime} | ${epoch} | ${method} | ${requestSize} | ${responseSize} | ${totalMs} | ${preAxiosMs} | ${axiosMs} | ${postProcessMs} | ${socketProcessingMs} | ${wsLatency} | ${socketToHandlerMs} | ${dnsResolutionMs} | ${eventLoopDelay} | ${socketQueueDepth} | ${connectionStable}`;

      // Add network stats if available
      if (networkStats && !networkStats.error) {
        logLine += ` | ${networkStats.totalErrors} | ${networkStats.totalDropped}`;
      } else {
        logLine += ` | 0 | 0`;
      }

      // Add peer counts if available
      if (peerCounts && !peerCounts.error) {
        logLine += ` | ${peerCounts.execution} | ${peerCounts.consensus}`;
      } else {
        logLine += ` | 0 | 0`;
      }

      // Add trace hops and params/response
      logLine += ` | ${traceHops} | ${paramsStr} | ${responseStr}\n`;

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
