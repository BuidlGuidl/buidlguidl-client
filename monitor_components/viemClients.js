import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

export const localClient = createPublicClient({
  name: "localClient",
  chain: mainnet,
  transport: http("http://localhost:8545"),
});

export const mainnetClient = createPublicClient({
  name: "mainnetClient",
  chain: mainnet,
  transport: http(),
});

export async function isSyncing() {
  try {
    const syncingStatus = await localClient.request({
      method: "eth_syncing",
      params: [],
    });

    return syncingStatus;
  } catch (error) {
    debugToFile(`isSyncing(): ${error}`, () => {});
  }
}
