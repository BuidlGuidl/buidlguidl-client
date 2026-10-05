import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { BASE_URL, RPC_URL } from "../config.js";
import { debugToFile } from "../helpers.js";

export const localClient = createPublicClient({
  name: "localClient",
  chain: mainnet,
  transport: http("http://localhost:8545"),
  // viem's default for mainnet is 4 s, which delays check-ins by ~2 s on average.
  pollingInterval: 1000,
});

export const mainnetClient = createPublicClient({
  name: "mainnetClient",
  chain: mainnet,
  transport: http(RPC_URL, {
    fetchOptions: {
      headers: {
        Origin: "buidlguidl-client",
      },
    },
  }),
});

export async function getEthSyncingStatus() {
  try {
    const syncingStatus = await localClient.request({
      method: "eth_syncing",
      params: [],
    });

    return syncingStatus;
  } catch (error) {
    debugToFile(`getEthSyncingStatus(): ${error}`);
    return false; // Return false to indicate not syncing when there's an error
  }
}
