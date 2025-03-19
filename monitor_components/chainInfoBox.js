import blessed from "blessed";
import { localClient } from "./viemClients.js";
import { owner } from "../commandLineOptions.js";
import { debugToFile } from "../helpers.js";

// The box displaying chain data
let chainInfoBox;

export function createChainInfoBox(grid) {
  let nRows = 5;
  if (owner !== null) {
    nRows = 3;
  }
  chainInfoBox = grid.set(2, 7, nRows, 1, blessed.box, {
    label: "Chain Info",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
    tags: true,
  });

  return chainInfoBox;
}

/**
 * Gnosis chain addresses for DAI & WETH:
 *  - DAI:  0x44fA8E6f47987339850636F88629646662444217
 *  - WETH: 0x6A023CCD1FF6F2045C3309768EaD9e68F978f6e1
 */
const DAI_CONTRACT_ADDRESS = "0x44fA8E6f47987339850636F88629646662444217";
const WETH_CONTRACT_ADDRESS = "0x6A023CCD1FF6F2045C3309768EaD9e68F978f6e1";

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
];

// Example address whose DAI/WETH balances we want to compare
const addressToCheck = "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11";

function formatBalance(balance, decimals = 18) {
  // Divides the raw BigInt by 10^decimals
  return (BigInt(balance) / BigInt(10 ** decimals)).toString();
}

/**
 * Fetch ratio of DAI to WETH on Gnosis chain
 * for a specific address at a given blockNumber.
 */
async function getDaiWethRatio(blockNumber) {
  try {
    // Get DAI balance
    const daiBalance = await localClient.readContract({
      address: DAI_CONTRACT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [addressToCheck],
      blockNumber,
    });

    // Get WETH balance
    const wethBalance = await localClient.readContract({
      address: WETH_CONTRACT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [addressToCheck],
      blockNumber,
    });

    // Convert to decimal strings
    const daiStr = formatBalance(daiBalance);
    const wethStr = formatBalance(wethBalance);

    // Avoid division by zero
    if (Number(wethStr) === 0) return "0.00";

    // Calculate ratio and round
    const ratio = Number(daiStr) / Number(wethStr);
    return ratio.toFixed(2);
  } catch (error) {
    debugToFile(`Error fetching token balances on Gnosis: ${error}`);
    return null;
  }
}

/**
 * Fetch a batch of block info from the Gnosis chain,
 * including transaction counts, base fees, and DAI/WETH ratio.
 */
async function getBatchBlockInfo() {
  try {
    // We'll display info for N blocks
    const nBlocks = Math.floor((chainInfoBox.height - 3) / 5);

    const currentBlockNumber = await localClient.getBlockNumber();
    const blockNumbers = [];

    // Collect most recent N blockNumbers
    for (let i = 0; i < nBlocks; i++) {
      const blockNumber = currentBlockNumber - BigInt(i);
      if (blockNumber < 0n) break;
      blockNumbers.push(blockNumber);
    }

    // Fetch block data concurrently
    const blocks = await Promise.all(
      blockNumbers.map((blockNumber) =>
        localClient.getBlock({ blockNumber })
      )
    );

    // Transaction counts
    const transactionCounts = blocks.map(
      (block) => block.transactions.length
    );

    // Gas prices (baseFeePerGas in Gwei)
    const gasPrices = blocks.map((block) => {
      if (!block.baseFeePerGas) return "0.0000";
      return (Number(block.baseFeePerGas) / 10 ** 9).toFixed(4);
    });

    // Fetch DAI/WETH ratio for each block
    const daiWethRatios = await Promise.all(
      blockNumbers.map((blockNumber) => getDaiWethRatio(blockNumber))
    );

    return { blockNumbers, transactionCounts, gasPrices, daiWethRatios };
  } catch (error) {
    debugToFile(`getBatchBlockInfo() on Gnosis: ${error}`);
    return {
      blockNumbers: [],
      transactionCounts: [],
      gasPrices: [],
      daiWethRatios: [],
    };
  }
}

/**
 * Populate the chain info box with Gnosis chain data.
 */
export async function populateChainInfoBox() {
  try {
    const { blockNumbers, transactionCounts, gasPrices, daiWethRatios } =
      await getBatchBlockInfo();

    // Make a separator line matching the box width
    const boxWidth = chainInfoBox.width - 2; // minus border
    const separator = "-".repeat(boxWidth);

    let content = "";
    content += separator + "\n";

    for (let i = 0; i < blockNumbers.length; i++) {
      // Show block number
      content += `{center}{bold}{green-fg}${blockNumbers[
        i
      ].toLocaleString()}{/green-fg}{/bold}{/center}\n`;
      // Show DAI/WETH ratio
      content += `{bold}{blue-fg}DAI/WETH:{/blue-fg}{/bold} ${daiWethRatios[i]}\n`;
      // Show Gas Price
      content += `{bold}{blue-fg}GAS:{/blue-fg}{/bold}   ${gasPrices[i]} Gwei\n`;
      // Show TX Count
      content += `{bold}{blue-fg}# TX:{/blue-fg}{/bold}  ${transactionCounts[i]}\n`;
      content += separator;

      if (i < blockNumbers.length - 1) {
        content += "\n";
      }
    }

    chainInfoBox.setContent(content);
  } catch (error) {
    debugToFile(`populateChainInfoBox() on Gnosis: ${error}`);
  }
}
