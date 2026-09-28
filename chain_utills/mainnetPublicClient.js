import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { RPC_URL } from "../config.js";

export const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL, {
    fetchOptions: {
      headers: {
        Origin: "buidlguidl-client",
      },
    },
  }),
});
