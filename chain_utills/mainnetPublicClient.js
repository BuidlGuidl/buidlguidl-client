import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

export const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});
