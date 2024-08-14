import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

export const localClient = createPublicClient({
  name: "localClient",
  chain: mainnet,
  transport: http("http://localhost:8545"),
});
