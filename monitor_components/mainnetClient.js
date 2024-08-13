import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

export const mainnetClient = createPublicClient({
  name: "mainnetClient",
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/demo"),
});
