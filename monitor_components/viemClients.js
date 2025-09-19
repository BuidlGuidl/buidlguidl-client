import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { BASE_URL } from "../config.js";

export const localClient = createPublicClient({
  name: "localClient",
  chain: mainnet,
  transport: http("http://localhost:8545"),
});

export const mainnetClient = createPublicClient({
  name: "mainnetClient",
  chain: mainnet,
  transport: http(`https://mainnet.rpc.buidlguidl.com`, {
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
