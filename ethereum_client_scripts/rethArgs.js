// Builds the `reth node` argv. Kept free of side effects so it can be checked
// without spawning reth.
//
// recordedType is what the datadir says it is (readRecordedRethDbType). If it
// says archive, no --full / --prune.* flags are added whatever executionType
// says: reth saves CLI prune flags to reth.toml, so one full start on an
// archive db keeps pruning it on every start after.
export function isArchiveRun(executionType, recordedType) {
  return executionType === "archive" || recordedType === "archive";
}

export function buildRethNodeArgs({
  executionType,
  recordedType,
  executionPeerPort,
  datadir,
  jwtPath,
  rpcApi,
  ipcPath,
}) {
  const archive = isArchiveRun(executionType, recordedType);
  return [
    "node",
    ...(archive ? [] : ["--full"]),
    "--port",
    executionPeerPort,
    "--discovery.port",
    executionPeerPort,
    "--http",
    "--http.addr",
    "0.0.0.0",
    // HTTP and WebSocket share 8545 (Interfold ciphernodes need both on one
    // port), so reth requires the same address and API list for both. `admin`
    // stays off the network; the client uses it over IPC (--ipcpath).
    "--http.api",
    rpcApi,
    "--http.corsdomain",
    "*",
    "--authrpc.addr",
    "127.0.0.1",
    "--authrpc.port",
    "8551",
    "--datadir",
    datadir,
    "--authrpc.jwtsecret",
    `${jwtPath}`,
    "--metrics",
    "127.0.0.1:9001",
    "--ws",
    "--ws.api",
    rpcApi,
    "--ws.origins",
    "*",
    "--ws.addr",
    "0.0.0.0",
    "--ws.port",
    "8545",
    "--ipcpath",
    ipcPath,
    "--rpc.max-blocks-per-filter",
    "10000",
    "--rpc.max-logs-per-response",
    "10000",
    ...(archive
      ? []
      : ["--prune.bodies.pre-merge", "--prune.receipts.before", "15537394"]),
  ];
}
