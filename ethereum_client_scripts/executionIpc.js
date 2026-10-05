import net from "net";
import os from "os";
import path from "path";

// The execution client's IPC socket serves every RPC namespace, including
// `admin`, to processes on this machine only. `admin` is kept off the network
// port (8545), so the client's own admin calls (node info, peers, adding BG
// peers) go here. Shared by the launch scripts (--ipcpath) and the client so
// the two can't diverge.
export function getExecutionIpcPath(executionClient, installDir) {
  const name = executionClient === "geth" ? "geth.ipc" : "reth.ipc";
  if (os.platform() === "win32") return `\\\\.\\pipe\\${name}`;
  if (executionClient === "geth") {
    return path.join(installDir, "ethereum_clients", "geth", "database", name);
  }
  // reth's default; kept so tools already using it still work.
  return path.join("/tmp", name);
}

// One JSON-RPC request over the IPC socket. Opens a connection per request:
// these calls are rare, and a fresh connection survives the execution client
// restarting, unlike a cached one. Resolves with the result, rejects on an
// RPC error, connection error or timeout.
export function executionIpcRequest(ipcPath, method, params = [], timeout = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(ipcPath);
    let buffer = "";
    const finish = (error, result) => {
      clearTimeout(timer);
      socket.destroy();
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
      try {
        const response = JSON.parse(message);
        if (response.error) {
          finish(new Error(`IPC ${method}: ${response.error.message}`));
        } else {
          finish(null, response.result);
        }
      } catch (error) {
        finish(new Error(`IPC ${method}: invalid response: ${error.message}`));
      }
    });
    socket.on("error", (error) => finish(new Error(`IPC ${method}: ${error.message}`)));
  });
}
