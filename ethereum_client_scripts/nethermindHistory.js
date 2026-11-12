import { debugToFile } from "../helpers.js";
import { readNethermindExecutionType } from "./nethermindExecutionType.js";
import { NETHERMIND_STATE_HISTORY_BLOCKS } from "./nethermindArgs.js";

// History a nethermind node reports on check-in, in the same shape as reth's
// (receipt_floor, body_floor, state_history).
//
// Floors: nethermind's own served-history floor, the lowest block it serves
// bodies and receipts for (the higher of its oldest stored block and its
// lowest downloaded body and receipt). It's the floor its eth/69 status
// advertises and below which its RPC answers 4444. RPC exposes it as the
// `earliest` block tag (NethermindEth/nethermind#15596). It is one number for
// both: with BG client's barriers (bodies from the merge, receipts from
// 20,650,000) it is the receipt floor, and reporting it as the body floor too
// only under-reports bodies.
//
// KNOWN GAP: #15596 was merged after nethermind 2.2.2, where `earliest` is
// still genesis. A full node can't serve from genesis, so a floor of 0 on a
// full node is reported as null (unknown) rather than 0, which would send it
// requests for history it doesn't have. Archive nodes do serve from genesis.
//
// State history comes from the flags BG client starts nethermind with
// (nethermindArgs.js): a rolling 10,064-block window, or everything (archive).

async function rpc(url, method, params, timeout = 5000) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeout),
  });
  const json = await response.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

// Returns the floor (number), null when unknown, or undefined when the node
// couldn't be reached so callers keep their last good value. Never throws.
async function readServedFloor(executionType, url) {
  let block;
  try {
    block = await rpc(url, "eth_getBlockByNumber", ["earliest", false]);
  } catch (err) {
    debugToFile(`nethermindHistory readServedFloor(): ${err.message}`);
    return undefined;
  }
  // null while the floor header isn't stored yet (early in sync)
  if (!block?.number) return null;
  const floor = Number(BigInt(block.number));
  if (floor === 0 && executionType !== "archive") return null;
  return floor;
}

/**
 * Returns { receipt_floor, body_floor, state_history }; each value is the
 * reported value, null (unknown), or undefined (read failed: keep the last
 * good value). Never throws.
 */
export async function readNethermindHistory(
  installDir,
  url = "http://localhost:8545"
) {
  const executionType = readNethermindExecutionType(installDir);
  const floor = await readServedFloor(executionType, url);
  return {
    receipt_floor: floor,
    body_floor: floor,
    state_history:
      executionType === "archive"
        ? { mode: "full" }
        : executionType === "full"
        ? { mode: "distance", blocks: NETHERMIND_STATE_HISTORY_BLOCKS }
        : null,
  };
}
