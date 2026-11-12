// Builds the nethermind argv. Kept free of side effects so it can be checked
// without spawning nethermind. Option names and defaults checked against the
// Nethermind 2.2.2 source.

// Receipts back to the Interfold ciphernode's oldest deploy block, the same
// floor reth keeps (INTERFOLD_RECEIPTS_SINCE in rethSnapshot.js; duplicated so
// this file stays free of reth's imports). Bodies from the merge, as reth.
export const NETHERMIND_RECEIPTS_SINCE = 20650000;
export const NETHERMIND_BODIES_SINCE = 15537394;
// State history window, the same as reth's --full (10,064 blocks).
export const NETHERMIND_STATE_HISTORY_BLOCKS = 10064;

// Localhost-only JSON-RPC URL. In 2.2.2 the IPC socket serves exactly the
// modules enabled on the default URL, and BG client needs `admin` over IPC
// (node info, peers, adding BG peers), so `admin` is enabled here and the
// default URL is kept off the network on its own port.
export const NETHERMIND_LOCAL_RPC_PORT = 8546;
const LOCAL_MODULES = ["Eth", "Net", "Web3", "Subscribe", "Admin"];

// Official archive snapshot (FlatDb history, needs nethermind >= 2.1.0).
// https://docs.nethermind.io/fundamentals/archive-snapshots
export const NETHERMIND_ARCHIVE_SNAPSHOT = {
  url: "https://mainnet-archive-snapshot.nethermind.dev/mainnet/archive/mainnet-archive-flat-history-26032570.tar.zst",
  fileName: "mainnet-archive-flat-history-26032570.tar.zst",
  sha256: "a0b07bcf2b52d08572cb68e9e5809f75cd9ab2f1d34b9a5a685edc0209a3611b",
};

// Public modules on 8545. `subscribe` is eth_subscribe (part of `eth` on reth
// and geth); Interfold ciphernodes subscribe over WebSocket on this port.
export function publicModules(debugTrace) {
  return ["eth", "net", "web3", "subscribe", ...(debugTrace ? ["debug", "trace"] : [])];
}

export function buildNethermindArgs({
  executionType,
  executionPeerPort,
  datadir,
  jwtPath,
  ipcPath,
  debugTrace,
  snapshot = null, // NETHERMIND_ARCHIVE_SNAPSHOT to restore it; archive only
  snapshotDir = null, // where the plugin keeps its checkpoint file
}) {
  const archive = executionType === "archive";
  return [
    "--config",
    archive ? "mainnet_archive" : "mainnet",
    "--data-dir",
    datadir,

    // P2P
    "--Network.P2PPort",
    String(executionPeerPort),
    "--Network.DiscoveryPort",
    String(executionPeerPort),

    // JSON-RPC: default URL (localhost, also what IPC serves)
    "--JsonRpc.Enabled",
    "true",
    "--JsonRpc.Host",
    "127.0.0.1",
    "--JsonRpc.Port",
    String(NETHERMIND_LOCAL_RPC_PORT),
    "--JsonRpc.WebSocketsPort",
    String(NETHERMIND_LOCAL_RPC_PORT),
    "--JsonRpc.EnabledModules",
    `[${LOCAL_MODULES.join(",")}]`,
    "--JsonRpc.IpcUnixDomainSocketPath",
    ipcPath,

    // Public 8545: HTTP and WebSocket on one port (Interfold ciphernodes need
    // both there). Replaces the preset's AdditionalRpcUrls, whose only entry
    // is the engine URL that EngineHost/EnginePort below configure instead.
    "--JsonRpc.AdditionalRpcUrls",
    `http://0.0.0.0:8545|http;ws|${publicModules(debugTrace).join(";")}`,
    "--JsonRpc.MaxLogsPerResponse",
    "10000",

    // Engine API for the consensus client
    "--JsonRpc.EngineHost",
    "127.0.0.1",
    "--JsonRpc.EnginePort",
    "8551",
    "--JsonRpc.JwtSecretFile",
    jwtPath,

    // Prometheus metrics, localhost only (same port reth uses). Enabled is
    // needed for ExposePort to serve; with no PushGatewayUrl nothing is pushed.
    "--Metrics.Enabled",
    "true",
    "--Metrics.ExposeHost",
    "127.0.0.1",
    "--Metrics.ExposePort",
    "9001",

    ...(archive
      ? []
      : [
          "--Sync.AncientBodiesBarrier",
          String(NETHERMIND_BODIES_SINCE),
          "--Sync.AncientReceiptsBarrier",
          String(NETHERMIND_RECEIPTS_SINCE),
          "--History.Pruning",
          "Disabled",
          "--FlatDb.HistoryEnabled",
          "true",
          "--FlatDb.HistoryRetention",
          "Rolling",
          "--FlatDb.HistoryRetentionBlocks",
          String(NETHERMIND_STATE_HISTORY_BLOCKS),
        ]),

    ...(archive && snapshot
      ? [
          "--FlatDb.Enabled",
          "true",
          "--FlatDb.HistoryEnabled",
          "true",
          "--Snapshot.Enabled",
          "true",
          "--Snapshot.Streaming",
          "true",
          "--Snapshot.StreamingConnections",
          "8",
          "--Snapshot.StripComponents",
          "1",
          ...(snapshotDir ? ["--Snapshot.SnapshotDirectory", snapshotDir] : []),
          "--Snapshot.SnapshotFileName",
          snapshot.fileName,
          "--Snapshot.DownloadUrl",
          snapshot.url,
          "--Snapshot.Checksum",
          `0x${snapshot.sha256}`,
        ]
      : []),
  ];
}
