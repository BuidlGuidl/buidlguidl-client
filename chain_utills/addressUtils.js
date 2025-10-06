import { isAddress } from "viem";
import { mainnetPublicClient } from "./mainnetPublicClient.js";
import { basePublicClient } from "./basePublicClient.js";

// Validate and resolve addresses (ENS support)
export async function validateAndResolveAddresses(addresses) {
  const resolvedAddresses = [];
  const validAddresses = [];
  const failedAddresses = [];

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    try {
      if (addr.endsWith(".eth")) {
        // Resolve ENS name using Ethereum mainnet
        const resolved = await mainnetPublicClient.getEnsAddress({
          name: addr,
        });
        if (!resolved) {
          console.error(`Could not resolve ENS name: ${addr}`);
          failedAddresses.push({
            index: i,
            address: addr,
            reason: "ENS resolution failed",
          });
          continue;
        }
        resolvedAddresses.push(resolved);
        validAddresses.push(i);
      } else {
        // Validate address format
        if (!isAddress(addr)) {
          console.error(`Invalid address format: ${addr}`);
          failedAddresses.push({
            index: i,
            address: addr,
            reason: "Invalid address format",
          });
          continue;
        }
        resolvedAddresses.push(addr);
        validAddresses.push(i);
      }
    } catch (error) {
      console.error(`Error validating address ${addr}:`, error.message);
      failedAddresses.push({ index: i, address: addr, reason: error.message });
    }
  }

  return { resolvedAddresses, validAddresses, failedAddresses };
}

// Check if addresses exist on-chain
export async function checkAddressesExist(addresses) {
  const validAddresses = [];
  const failedAddresses = [];

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    try {
      const code = await basePublicClient.getBytecode({ address: addr });
      const balance = await basePublicClient.getBalance({
        address: addr,
      });

      // Check if it's a valid address (has been used or is a contract)
      if (code === "0x" && balance === 0n) {
        console.warn(
          `Address ${addr} appears to be unused (no balance or code)`
        );
        // For now, we'll still consider these valid but warn
      }
      validAddresses.push(i);
    } catch (error) {
      console.error(`Could not check address ${addr}:`, error.message);
      failedAddresses.push({ index: i, address: addr, reason: error.message });
    }
  }

  return { validAddresses, failedAddresses };
}
