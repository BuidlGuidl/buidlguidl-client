// Which RPC namespaces the execution client serves on its HTTP port (8545),
// the port the pool's requests are forwarded to. Reported with each check-in.
//
// Each namespace is tested by calling one of its methods with no params. A
// disabled namespace answers -32601 (method not found); an enabled one answers
// -32602 (invalid params) before running anything, because every probe method
// below requires an argument. That makes the probe exact and free, and works
// the same on reth and geth (tested on reth 2.5.0 and geth 1.17.4).
//
// rpc_modules alone isn't reliable: reth's reports its HTTP list on every
// transport, and reth only serves it when `rpc` is enabled. It's used only to
// pick up namespaces that have no probe here.

const probeMethods = {
  eth: "eth_getBalance",
  net: "net_version", // No net_ method takes params; returns the chain ID
  web3: "web3_sha3",
  rpc: "rpc_modules", // Takes no params; returns the module list
  admin: "admin_addPeer",
  debug: "debug_getRawHeader",
  trace: "trace_block",
  txpool: "txpool_contentFrom",
  ots: "ots_getBlockDetails",
  reth: "reth_getBalanceChangesInBlock",
  engine: "engine_newPayloadV3",
  miner: "miner_setExtra",
};

const METHOD_NOT_FOUND = -32601;

async function rpcCall(url, method, timeout) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
    signal: AbortSignal.timeout(timeout),
  });
  return response.json();
}

/**
 * Returns the enabled namespaces, sorted, or null if any probe couldn't get
 * an answer (node down or starting): a partial list would misreport.
 */
export async function probeRpcModules(
  url = "http://localhost:8545",
  timeout = 5000
) {
  const results = await Promise.all(
    Object.entries(probeMethods).map(async ([namespace, method]) => {
      try {
        const response = await rpcCall(url, method, timeout);
        if (response.error?.code === METHOD_NOT_FOUND) {
          return { namespace, enabled: false };
        }
        return { namespace, enabled: true, response };
      } catch (error) {
        return { namespace, enabled: null };
      }
    })
  );
  if (results.some((r) => r.enabled === null)) return null;

  const enabled = new Set(
    results.filter((r) => r.enabled).map((r) => r.namespace)
  );
  // Namespaces the node lists that have no probe above (e.g. geth's `dev`).
  const listed = results.find((r) => r.namespace === "rpc")?.response?.result;
  if (listed && typeof listed === "object") {
    for (const namespace of Object.keys(listed)) {
      if (!(namespace in probeMethods)) enabled.add(namespace);
    }
  }
  return [...enabled].sort();
}
