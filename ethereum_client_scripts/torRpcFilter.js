// Read-only JSON-RPC filter between Tor and the local execution client (--tor).
//
// Tor's onion service forwards to this server on 127.0.0.1; allowed calls are
// passed to the node on 127.0.0.1:8545. It logs counts only, never params:
// every Tor caller is 127.0.0.1, and the queries are the private part.
//
// OFAC: refuses any request that names a sanctioned address, and any signed
// transaction whose signer, EIP-7702 authority, or touched accounts (from
// eth_createAccessList) are sanctioned. Fails closed until a list is loaded.
// List: the OFAC SDN digital-currency addresses, extracted daily by
// github.com/0xB10C/ofac-sanctioned-digital-currency-addresses.

import http from "http";
import fs from "fs";
import path from "path";
import minimist from "minimist";
import { parseTransaction, recoverTransactionAddress, toHex } from "viem";
import { recoverAuthorizationAddress } from "viem/utils";

const argv = minimist(process.argv.slice(2));
const LISTEN_PORT = Number(argv.port || 8547);
const UPSTREAM = argv.upstream || "http://127.0.0.1:8545";
const DATA_DIR = argv.datadir || process.cwd();

const MAX_BODY = 512 * 1024;
const MAX_BATCH = 20;
const MAX_INFLIGHT = 8; // concurrent upstream requests, all Tor users together
const MAX_LOG_RANGE = 2000; // blocks per eth_getLogs
const TIMEOUT_MS = 15000;

const ALLOWED = new Set([
  "eth_chainId", "net_version", "web3_clientVersion", "eth_syncing",
  "eth_blockNumber", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_blobBaseFee",
  "eth_getBalance", "eth_getTransactionCount", "eth_getCode", "eth_getStorageAt", "eth_getProof",
  "eth_call", "eth_estimateGas", "eth_createAccessList",
  "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_getBlockTransactionCountByNumber", "eth_getBlockTransactionCountByHash",
  "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockReceipts",
  "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionByBlockHashAndIndex",
  "eth_getLogs", "eth_sendRawTransaction",
]);

// ---------------------------------------------------------------- sanctions

const LIST_BASE =
  "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/";
const LIST_FILES = ["ETH", "USDC", "USDT", "ARB", "BSC", "ETC"].map(
  (t) => `sanctioned_addresses_${t}.txt`
);
const LIST_CACHE = path.join(DATA_DIR, "sanctioned.json");
const LIST_REFRESH_MS = 12 * 3600 * 1000;
const LIST_MIN_SIZE = 50; // smaller than this is treated as a bad download

let sanctioned = new Set(); // lowercase hex, no 0x
let listUpdated = null;

function loadList(addrs, when) {
  sanctioned = new Set(addrs.map((a) => a.toLowerCase().replace(/^0x/, "")));
  listUpdated = when;
}

try {
  const cached = JSON.parse(fs.readFileSync(LIST_CACHE, "utf8"));
  if (cached.addresses?.length >= LIST_MIN_SIZE) loadList(cached.addresses, cached.updated);
} catch {}

async function refreshList() {
  try {
    const out = new Set();
    for (const f of LIST_FILES) {
      const r = await fetch(LIST_BASE + f, { signal: AbortSignal.timeout(20000) });
      if (r.status === 404) continue;
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
      for (const line of (await r.text()).split("\n")) {
        const a = line.trim();
        if (/^0x[0-9a-fA-F]{40}$/.test(a)) out.add(a.toLowerCase());
      }
    }
    if (out.size < LIST_MIN_SIZE) throw new Error(`list too small (${out.size})`);
    const when = new Date().toISOString();
    loadList([...out], when);
    fs.writeFileSync(LIST_CACHE, JSON.stringify({ updated: when, addresses: [...out] }));
    console.log(`sanctions list: ${out.size} addresses`);
  } catch (e) {
    console.log(`sanctions list refresh failed, keeping ${sanctioned.size}: ${e.message}`);
  }
}
refreshList();
setInterval(refreshList, LIST_REFRESH_MS).unref();

const isSanctioned = (a) => !!a && sanctioned.has(String(a).toLowerCase().replace(/^0x/, ""));

// Any sanctioned address anywhere in the request: params, log filters,
// calldata (addresses sit there as 40 hex chars), a raw tx's `to`.
function mentionsSanctioned(text) {
  const t = text.toLowerCase();
  for (const a of sanctioned) if (t.includes(a)) return true;
  return false;
}

async function checkRawTx(raw) {
  const tx = parseTransaction(raw);
  const from = await recoverTransactionAddress({ serializedTransaction: raw });
  if (isSanctioned(from) || isSanctioned(tx.to)) return "sanctioned address";
  for (const auth of tx.authorizationList || []) {
    if (isSanctioned(auth.address)) return "sanctioned address";
    if (isSanctioned(await recoverAuthorizationAddress({ authorization: auth })))
      return "sanctioned address";
  }
  // Every account the tx would touch, including calls inside other contracts.
  const req = { from, data: tx.data || "0x", value: toHex(tx.value || 0n) };
  if (tx.to) req.to = tx.to;
  if (tx.gas) req.gas = toHex(tx.gas);
  if (tx.authorizationList?.length) {
    req.authorizationList = tx.authorizationList.map((a) => ({
      address: a.address,
      chainId: toHex(a.chainId),
      nonce: toHex(a.nonce),
      r: a.r,
      s: a.s,
      yParity: toHex(a.yParity ?? 0),
    }));
  }
  const res = await callNode("eth_createAccessList", [req, "latest"]);
  if (!res || !Array.isArray(res.accessList)) return "could not check transaction";
  for (const e of res.accessList) {
    if (isSanctioned(e.address)) return "touches a sanctioned address";
  }
  return null;
}

// ------------------------------------------------------------------ filter

let inflight = 0;
const stats = { ok: 0, rejected: 0, sanctioned: 0, busy: 0, errors: 0 };
setInterval(
  () =>
    console.log(
      new Date().toISOString(),
      JSON.stringify({ ...stats, inflight, list: { size: sanctioned.size, updated: listUpdated } })
    ),
  600000
).unref();

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

const hexNum = (v) => (typeof v === "string" && /^0x[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : null);
const isTag = (v) => v === undefined || v === "latest" || v === "safe" || v === "finalized";

function checkCall(c) {
  if (!c || typeof c !== "object" || typeof c.method !== "string")
    return rpcError(c?.id, -32600, "invalid request");
  if (!ALLOWED.has(c.method)) return rpcError(c.id, -32601, "method not allowed");
  if (c.method === "eth_getLogs") {
    const f = Array.isArray(c.params) && c.params[0];
    if (!f || typeof f !== "object") return rpcError(c.id, -32602, "filter required");
    if (!f.blockHash && !(isTag(f.fromBlock) && isTag(f.toBlock))) {
      const from = hexNum(f.fromBlock);
      const to = hexNum(f.toBlock);
      if (from === null || to === null)
        return rpcError(c.id, -32602, `use hex block numbers (max ${MAX_LOG_RANGE} blocks)`);
      if (to < from || to - from > MAX_LOG_RANGE)
        return rpcError(c.id, -32602, `block range too large (max ${MAX_LOG_RANGE})`);
    }
  }
  return null;
}

function forward(body) {
  return new Promise((resolve, reject) => {
    const u = new URL(UPSTREAM);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

async function callNode(method, params) {
  const j = JSON.parse(await forward(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })));
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

function send(res, status, body, extraHeaders = {}) {
  const b = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    ...extraHeaders,
  });
  res.end(b);
}

async function handle(raw, res) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    stats.rejected++;
    return send(res, 400, rpcError(null, -32700, "parse error"));
  }
  const batch = Array.isArray(parsed);
  const calls = batch ? parsed : [parsed];
  const reply = (out) => send(res, 200, batch ? out : out[0]);

  if (calls.length === 0 || calls.length > MAX_BATCH) {
    stats.rejected++;
    return send(res, 400, rpcError(null, -32600, `batch size 1-${MAX_BATCH}`));
  }
  const bad = calls.map(checkCall);
  if (bad.some(Boolean)) {
    stats.rejected++;
    return reply(calls.map((c, i) => bad[i] || rpcError(c?.id, -32603, "batch rejected")));
  }
  if (sanctioned.size < LIST_MIN_SIZE) {
    stats.rejected++;
    return send(res, 503, rpcError(calls[0].id, -32603, "sanctions list not loaded"));
  }
  if (mentionsSanctioned(raw)) {
    stats.sanctioned++;
    return reply(calls.map((c) => rpcError(c.id, -32003, "sanctioned address")));
  }
  if (inflight >= MAX_INFLIGHT) {
    stats.busy++;
    return send(res, 429, rpcError(calls[0].id, -32005, "busy, retry"), { "retry-after": "1" });
  }

  inflight++;
  try {
    for (const c of calls) {
      if (c.method !== "eth_sendRawTransaction") continue;
      let why;
      try {
        why = await checkRawTx(c.params?.[0]);
      } catch {
        why = "could not check transaction";
      }
      if (why) {
        stats.sanctioned++;
        return reply(calls.map((x) => rpcError(x.id, -32003, x === c ? why : "batch rejected")));
      }
    }
    send(res, 200, await forward(JSON.stringify(parsed)));
    stats.ok++;
  } catch {
    stats.errors++;
    send(res, 502, rpcError(calls[0].id, -32603, "upstream error"));
  } finally {
    inflight--;
  }
}

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS")
      return send(res, 204, Buffer.alloc(0), {
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method !== "POST") return send(res, 405, rpcError(null, -32600, "POST only"));
    let size = 0;
    const chunks = [];
    req.on("data", (d) => {
      size += d.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(d);
    });
    req.on("end", () => handle(Buffer.concat(chunks).toString(), res));
  })
  .listen(LISTEN_PORT, "127.0.0.1", () =>
    console.log(`tor rpc filter on 127.0.0.1:${LISTEN_PORT} -> ${UPSTREAM}`)
  );
