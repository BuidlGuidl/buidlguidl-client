# Handoff: keyed eth_getLogs, buidlguidl-client side

Temporary notes to carry a Claude Code conversation over to another machine. Delete
before merging.

## Context

The RPC system is re-enabling `eth_getLogs` for API-key holders. Plan and evidence live
in the rpc-ssl-proxy repo:

- https://github.com/BuidlGuidl/rpc-ssl-proxy/blob/main/IMPLEMENTATION_PLAN_GETLOGS_KEYS.md
- https://github.com/BuidlGuidl/rpc-ssl-proxy/blob/main/GETLOGS_RETH_TEST_RESULTS.md

Only Phase 1b and Phase 2 of that plan touch this repo. Branch: `staging-enable-getlogs`
(`config.js` points `BASE_URL` at `stage.rpc.buidlguidl.com`; revert before merging to
main).

## Agreed changes (not implemented yet)

1. **Bound the node-side RPC call** in `webSocketConnection.js` (`rpc_request` handler,
   ~line 171, `axios.post("http://localhost:8545")`):
   - add a per-method `timeout` (4 s for `eth_getLogs`, `eth_newFilter`,
     `eth_getFilterLogs`, `eth_getFilterChanges`) and `maxContentLength: 32e6`
   - on either limit, reply with JSON-RPC error `-32603` naming the limit (today the
     catch returns `-70000 "Internal node error"`)
   - open issue: the plan's flat 2.5 s default for other methods is longer than the
     pool's 2 s timeout for `eth_getBlockReceipts`. Derive per-method values from the
     pool's `nodeMethodSpecificTimeouts` instead of using one default.
2. **Reth flags** in `ethereum_client_scripts/reth.js` (the plan wrongly says
   `ethereum_clients/reth.js`): add `--rpc.max-blocks-per-filter 10000` and
   `--rpc.max-logs-per-response 10000`.
3. **Check-in** (`webSocketConnection.js`, `params` in `checkIn`, ~line 285):
   - **No `getlogs_ready` field (rejected).** The pool routes on the existing
     `execution_client` (`startsWith("reth")`). Nodes without the new flags are still
     safe: the edge caps the range at 10k, and reth's default 20k-log cap (~12.5 MB)
     is under the pool's new 64 MB limit.
   - **Add `receipt_floor`** (the lowest block that still has receipts). It's needed
     because below it reth returns `[]` for getLogs with no error, and each node's floor
     depends on the snapshot it synced from. Only send it on reth nodes. Compute it
     **once**, not daily (it never moves), and store it in `.bg_snapshot.json` in the
     reth datadir (the marker file `ethereum_client_scripts/rethSnapshot.js` already
     writes). Report `null` until it's known.

## Open question being investigated on this machine

Can the floor be read directly from reth instead of probed over RPC?

- `reth.toml` `[prune.segments.receipts] before = 15537394` is **not** the floor. The
  tested prod node has that exact config but its receipts start at **25,300,000**
  (set by the snapshot).
- Candidates: reth's DB `PruneCheckpoints` table, or the receipts static-file block
  range. On the live reth v2.5.0 node, run:

  ```
  reth db --datadir <datadir> list PruneCheckpoints --json
  reth db --datadir <datadir> stats     # look at the Receipts row in the static-file section
  ls <datadir>/static_files | grep receipts
  ```

  (`list` without `--json` needs a TTY. `reth db` opens read-only.) The original machine
  only had a nearly empty v1.11.3 DB, so this couldn't be checked there.
- **If the output shows ~25,300,000:** read the floor from the DB once, with no RPC
  calls.
- **Otherwise, fallback:** a one-time binary search (~19 steps) over head − 1,200,000 …
  head. Each step is `eth_getBlockByNumber(n, false)` plus `eth_getTransactionReceipt` on
  its first tx hash, where `null` means below the floor. Blocks with no transactions
  need a neighbouring block. Don't probe with `eth_getBlockReceipts` (responses up to
  ~1.7 MB).
