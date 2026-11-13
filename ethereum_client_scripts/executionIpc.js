import net from "net";
import os from "os";
import path from "path";

// The execution client's IPC socket serves every RPC namespace, including
// `admin`, to processes on this machine only. `admin` is kept off the network
// port (8545), so the client's own admin calls (node info, peers, adding BG
// peers) go here. Shared by the launch scripts (--ipcpath) and the client so
// the two can't diverge.
export function getExecutionIpcPath(executionClient, installDir) {
  const name = `${executionClient}.ipc`;
  if (os.platform() === "win32") return `\\\\.\\pipe\\${name}`;
  if (executionClient === "geth" || executionClient === "nethermind") {
    return path.join(
      installDir,
      "ethereum_clients",
      executionClient,
      "database",
      name
    );
  }
  // reth's default; kept so tools already using it still work.
  return path.join("/tmp", name);
}

// One JSON-RPC request over the IPC socket. Opens a connection per request:
// these calls are rare, and a fresh connection survives the execution client
// restarting, unlike a cached one. Resolves with the result, rejects on an
// RPC error, connection error or timeout.
//
// Requests from this process go one at a time: nethermind's IPC server
// accepts one connection at a time and refuses the rest with EAGAIN. A
// refused connection (EAGAIN) is retried a few times; a socket that isn't
// there yet (ENOENT, ECONNREFUSED: the client is still starting) is retried
// only when `waitForSocket` gives a time budget for it.
let ipcQueue = Promise.resolve();

export function executionIpcRequest(
  ipcPath,
  method,
  params = [],
  timeout = 5000,
  { waitForSocket = 0 } = {}
) {
  const run = () => requestWithRetry(ipcPath, method, params, timeout, waitForSocket);
  const result = ipcQueue.then(run, run);
  ipcQueue = result.catch(() => {});
  return result;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestWithRetry(ipcPath, method, params, timeout, waitForSocket) {
  const deadline = Date.now() + waitForSocket;
  for (let attempt = 0; ; attempt++) {
    try {
      return await ipcRequestOnce(ipcPath, method, params, timeout);
    } catch (error) {
      const busy = error.code === "EAGAIN" && attempt < 5;
      const notUp =
        (error.code === "ENOENT" || error.code === "ECONNREFUSED") &&
        Date.now() < deadline;
      if (busy) await sleep(100 * (attempt + 1));
      else if (notUp) await sleep(2000);
      else throw error;
    }
  }
}

function ipcRequestOnce(ipcPath, method, params, timeout) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(ipcPath);
    let buffer = "";
    let done = false;
    const finish = (error, result, gentle = false) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (gentle) {
        // The response parsed before its trailing newline arrived. Nethermind
        // writes that newline separately, and destroying the socket first
        // makes its write fail ("IPC server error ... Broken pipe"). Close our
        // side and let the server finish; destroy later if it doesn't.
        socket.end();
        setTimeout(() => socket.destroy(), 1000).unref();
      } else {
        socket.destroy();
      }
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(
      () => finish(new Error(`IPC ${method} timed out after ${timeout} ms`)),
      timeout
    );
    socket.on("connect", () => {
      socket.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) + "\n");
    });
    socket.on("data", (chunk) => {
      if (done) return;
      buffer += chunk;
      // Responses end with a newline; a complete JSON object also counts, in
      // case a client doesn't send one.
      const end = buffer.indexOf("\n");
      const message = end === -1 ? buffer : buffer.slice(0, end);
      if (end === -1) {
        try {
          JSON.parse(message);
        } catch {
          return; // Incomplete, wait for more
        }
      }
      const gentle = end === -1;
      try {
        const response = JSON.parse(message);
        if (response.error) {
          finish(new Error(`IPC ${method}: ${response.error.message}`), null, gentle);
        } else {
          finish(null, response.result, gentle);
        }
      } catch (error) {
        finish(new Error(`IPC ${method}: invalid response: ${error.message}`));
      }
    });
    socket.on("error", (error) => {
      const wrapped = new Error(`IPC ${method}: ${error.message}`);
      wrapped.code = error.code;
      finish(wrapped);
    });
  });
}
