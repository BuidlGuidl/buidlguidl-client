import { createPublicClient, http } from "viem";
import { mainnet, gnosis } from "viem/chains";

export const localClient = createPublicClient({
  name: "localClient",
  chain: gnosis,
  transport: http("http://localhost:8545"),
});

export const mainnetClient = createPublicClient({
  name: "mainnetClient",
  chain: gnosis,
  transport: http("https://rpc.gnosischain.com"),
});

export async function isSyncing() {
  try {
    const syncingStatus = await localClient.request({
      method: "eth_syncing",
      params: [],
    });

    return syncingStatus;
  } catch (error) {
    debugToFile(`isSyncing(): ${error}`);
  }
}
