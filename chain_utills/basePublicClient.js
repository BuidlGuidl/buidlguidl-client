import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const basePublicClient = createPublicClient({
  chain: base,
  transport: http(),
});
