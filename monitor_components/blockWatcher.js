import { createPublicClient, webSocket } from "viem";
import { mainnet } from "viem/chains";
import { localClient } from "./viemClients.js";
import { debugToFile } from "../helpers.js";

// New blocks come from an eth_subscribe newHeads subscription on the node's
// WebSocket RPC, so a block is seen as soon as the node imports it instead of
// on the next poll. viem doesn't re-subscribe after its socket reconnects and
// doesn't fall back to polling when the socket is down, so this module handles
// both: on a socket error, or when the node's head moves but no block arrived,
// it re-subscribes on a fresh socket, polling over HTTP until WebSocket works.
//
// One underlying watcher is shared by every caller of watchLocalBlocks(), so
// a restart by one caller can't close the socket under another.

const localWsClient = createPublicClient({
  name: "localWsClient",
  chain: mainnet,
  // Reconnects are done below, with a re-subscribe.
  transport: webSocket("ws://127.0.0.1:8546", { reconnect: false }),
});

const watchdogInterval = 15 * 1000;
const stallTimeout = 30 * 1000; // No block for this long: check the node's head
const wsRetryInterval = 60 * 1000; // While polling, how often to retry WebSocket

const listeners = new Set();
let mode = null; // "ws" | "poll" | null (stopped)
let unwatch = null;
let watchdogTimer = null;
let lastBlockNumber = null;
let lastBlockAt = 0;
let lastWsAttemptAt = 0;
let restarting = false;
// Bumped on every restart so errors from an old, already-replaced socket
// (its close event can arrive after the restart) don't trigger another one.
let generation = 0;

function handleBlock(block) {
  // viem passes undefined if its getBlock for a newHeads header failed.
  if (!block || block.number == null) return;
  lastBlockNumber = block.number;
  lastBlockAt = Date.now();
  for (const listener of listeners) {
    try {
      listener(block);
    } catch (error) {
      debugToFile(`blockWatcher listener error: ${error}`);
    }
  }
}

function stopWatcher() {
  if (unwatch) {
    try {
      unwatch();
    } catch (error) {
      debugToFile(`blockWatcher unwatch error: ${error}`);
    }
    unwatch = null;
  }
}

// Drop viem's cached socket, which it keeps even after the connection closes,
// so the next request opens a new one. Throws if the node's WebSocket RPC
// can't be reached.
async function resetWsSocket() {
  try {
    const rpcClient = await localWsClient.transport.getRpcClient();
    rpcClient.close();
  } catch (error) {
    // Nothing cached and no connection: the probe below reports it.
  }
  await localWsClient.getBlockNumber();
}

// tryWs false goes straight to polling; the watchdog retries WebSocket later.
async function restart(reason, tryWs = true) {
  if (restarting || listeners.size === 0) return;
  restarting = true;
  try {
    stopWatcher();
    const thisGeneration = ++generation;
    lastWsAttemptAt = Date.now();
    try {
      if (!tryWs) throw new Error("WebSocket skipped");
      await resetWsSocket();
      if (listeners.size === 0) return;
      unwatch = localWsClient.watchBlocks({
        // Emit the current head too, so a block imported while the socket was
        // being replaced isn't skipped.
        emitOnBegin: true,
        onBlock: handleBlock,
        onError: (error) => {
          if (thisGeneration !== generation) return;
          debugToFile(`blockWatcher WebSocket error: ${error}`);
          restart("WebSocket error", false);
        },
      });
      mode = "ws";
    } catch (error) {
      if (listeners.size === 0) return;
      unwatch = localClient.watchBlocks({
        onBlock: handleBlock,
        onError: (error) => {
          debugToFile(`blockWatcher polling error: ${error}`);
        },
      });
      mode = "poll";
    }
    lastBlockAt = Date.now();
    debugToFile(`blockWatcher (${reason}): watching blocks via ${mode}`);
  } finally {
    restarting = false;
  }
}

async function watchdog() {
  if (restarting || mode === null) return;
  const now = Date.now();
  if (mode === "poll") {
    if (now - lastWsAttemptAt >= wsRetryInterval) {
      await restart("retrying WebSocket");
    }
    return;
  }
  if (now - lastBlockAt < stallTimeout) return;
  // No block for a while. That's normal if the node's head isn't moving
  // (stalled sync, node down); if it has moved, the subscription is dead.
  try {
    const head = await localClient.getBlockNumber();
    if (lastBlockNumber === null || head > lastBlockNumber) {
      await restart(`no newHeads while head moved to ${head}`);
      return;
    }
  } catch (error) {
    debugToFile(`blockWatcher watchdog: ${error}`);
  }
  lastBlockAt = now;
}

/** "ws" or "poll" while watching, null when stopped or not started yet. */
export function getBlockWatchMode() {
  return mode;
}

/**
 * Calls onBlock(block) for each new block the local node imports.
 * Returns a function that stops this listener.
 */
export function watchLocalBlocks(onBlock) {
  listeners.add(onBlock);
  if (watchdogTimer === null) {
    watchdogTimer = setInterval(watchdog, watchdogInterval);
    // No-op if a restart is already in flight; it picks up this listener.
    restart("start");
  }
  return () => {
    listeners.delete(onBlock);
    if (listeners.size === 0) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
      stopWatcher();
      mode = null;
    }
  };
}
