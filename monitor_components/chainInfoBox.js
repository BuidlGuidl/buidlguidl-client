import blessed from "blessed";
import { localClient } from "./viemClients.js";
import { owner } from "../commandLineOptions.js";
import { debugToFile } from "../helpers.js";

let chainInfoBox;

export function createChainInfoBox(grid) {
  let nRows = 5;
  if (owner) {
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

// DAI and WETH contract addresses
const DAI_CONTRACT_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const WETH_CONTRACT_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// ABI to interact with the balanceOf function in an ERC-20 contract
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
];

// Address to check
const addressToCheck = "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11";

function formatBalance(balance, decimals = 18) {
  return (BigInt(balance) / BigInt(10 ** decimals)).toString();
}

async function getEthPrice(blockNumber) {
  try {
    const daiBalance = await localClient.readContract({
      address: DAI_CONTRACT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [addressToCheck],
      blockNumber: blockNumber, // Specify the block number here
    });

    const wethBalance = await localClient.readContract({
      address: WETH_CONTRACT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [addressToCheck],
      blockNumber: blockNumber, // Specify the block number here
    });

    const ratio = formatBalance(daiBalance) / formatBalance(wethBalance);
    const roundedRatio = ratio.toFixed(2);

    return roundedRatio;
  } catch (error) {
    debugToFile(`Error fetching token balances: ${error}`);
    return null; // Return null or a default value in case of an error
  }
}

async function getBatchBlockInfo() {
  try {
    const nBlocks = Math.floor((chainInfoBox.height - 3) / 5);

    const currentBlockNumber = await localClient.getBlockNumber();

    // Create an array of block numbers for the most current block and the previous blocks
    const blockNumbers = [];
    for (let i = 0; i < nBlocks; i++) {
      const blockNumber = currentBlockNumber - BigInt(i);
      if (blockNumber < 0n) break; // Stop if block number is out of range
      blockNumbers.push(blockNumber);
    }

    // Fetch the blocks concurrently using Promise.all
    const blocks = await Promise.all(
      blockNumbers.map((blockNumber) =>
        localClient.getBlock({
          blockNumber: blockNumber,
        })
      )
    );

    // Extract transaction counts, gas prices, and ETH prices from the blocks
    const transactionCounts = blocks.map((block) => block.transactions.length);
    const gasPrices = blocks.map(
      (block) => (Number(block.baseFeePerGas) / 10 ** 9).toFixed(4) // Convert gas prices to Gwei
    );

    // Fetch ETH prices concurrently for each block
    const ethPrices = await Promise.all(
      blockNumbers.map((blockNumber) => getEthPrice(blockNumber))
    );

    return { blockNumbers, transactionCounts, gasPrices, ethPrices };
  } catch (error) {
    debugToFile(`getBatchBlockInfo(): ${error}`);
    return {
      blockNumbers: [],
      transactionCounts: [],
      gasPrices: [],
      ethPrices: [],
    };
  }
}

export async function populateChainInfoBox() {
  try {
    const { blockNumbers, transactionCounts, gasPrices, ethPrices } =
      await getBatchBlockInfo();

    // Get the width of the chainInfoBox to properly format the separator line
    const boxWidth = chainInfoBox.width - 2; // Adjusting for border padding
    const separator = "-".repeat(boxWidth);

    let content = "";
    content += separator + "\n";

    for (let i = 0; i < blockNumbers.length; i++) {
      content += `{center}{bold}{green-fg}${blockNumbers[
        i
      ].toLocaleString()}{/green-fg}{/bold}{/center}\n`;
      content += `{bold}{blue-fg}ETH $:{/blue-fg}{/bold} ${ethPrices[i]}\n`;
      content += `{bold}{blue-fg}GAS:{/blue-fg}{/bold}   ${gasPrices[i]}\n`;
      content += `{bold}{blue-fg}# TX:{/blue-fg}{/bold}  ${transactionCounts[i]}\n`;
      content += separator;

      if (i < blockNumbers.length - 1) {
        content += "\n";
      }
    }

    chainInfoBox.setContent(content);
  } catch (error) {
    debugToFile(`populateChainInfoBox(): ${error}`);
  }
}
