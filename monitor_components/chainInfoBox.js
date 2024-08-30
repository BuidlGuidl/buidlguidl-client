import blessed from "blessed";
import { localClient } from "./viemClients.js";
import { debugToFile } from "../helpers.js";

let chainInfoBox;

export function createChainInfoBox(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 3 : 6;
  // const rowSpan = screen.height < layoutHeightThresh ? 6 : 3;

  chainInfoBox = grid.set(2, 8, 5, 1, blessed.box, {
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

// Function to get the balance of a token
async function getTokenBalance(tokenAddress, accountAddress) {
  const balance = await localClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [accountAddress],
  });
  return balance;
}

function formatBalance(balance, decimals = 18) {
  return (BigInt(balance) / BigInt(10 ** decimals)).toString();
}

async function getEthPrice() {
  try {
    const daiBalance = await getTokenBalance(
      DAI_CONTRACT_ADDRESS,
      addressToCheck
    );
    const wethBalance = await getTokenBalance(
      WETH_CONTRACT_ADDRESS,
      addressToCheck
    );

    const ratio = formatBalance(daiBalance) / formatBalance(wethBalance);
    const roundedRatio = ratio.toFixed(2);

    // debugToFile(`DAI Balance: ${formatBalance(daiBalance)} DAI`, () => {});
    // debugToFile(`WETH Balance: ${formatBalance(wethBalance)} WETH`, () => {});
    // debugToFile(`Ratio: ${ratio}`, () => {});

    return roundedRatio;
  } catch (error) {
    debugToFile(`Error fetching token balances: ${error}`, () => {});
  }
}

async function getLastFiveBlockInfo() {
  try {
    const currentBlockNumber = await localClient.getBlockNumber();

    // Create an array of block numbers for the most current block and the previous 4 blocks
    const blockNumbers = [];
    for (let i = 0; i < 5; i++) {
      blockNumbers.push(currentBlockNumber - BigInt(i));
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
      (block) => (Number(block.baseFeePerGas) / 10 ** 9).toFixed(3) // Convert gas prices to Gwei
    );

    // Fetch ETH prices concurrently
    const ethPrices = await Promise.all(blocks.map(() => getEthPrice()));

    return { blockNumbers, transactionCounts, gasPrices, ethPrices };
  } catch (error) {
    debugToFile(`getLastFiveBlockInfo(): ${error}`, () => {});
    return {
      blockNumbers: [],
      transactionCounts: [],
      gasPrices: [],
      ethPrices: [],
    };
  }
}

// async function getLastFiveBlockInfo() {
//   try {
//     const currentBlockNumber = await localClient.getBlockNumber();

//     // Create an array of block numbers for the most current block and the previous 4 blocks
//     const blockNumbers = [];
//     for (let i = 0; i < 5; i++) {
//       blockNumbers.push(currentBlockNumber - BigInt(i));
//     }

//     // Fetch the blocks concurrently using Promise.all
//     const blocks = await Promise.all(
//       blockNumbers.map((blockNumber) =>
//         localClient.getBlock({
//           blockNumber: blockNumber,
//         })
//       )
//     );

//     // Extract transaction counts and gas prices from the blocks
//     const transactionCounts = blocks.map((block) => block.transactions.length);
//     const gasPrices = blocks.map(
//       (block) => Number(block.baseFeePerGas) / 10 ** 9 // Convert gas prices to Gwei
//     );

//     return { blockNumbers, transactionCounts, gasPrices };
//   } catch (error) {
//     debugToFile(`getTransactionCountAndGasPrice(): ${error}`, () => {});
//     return { blockNumbers: [], transactionCounts: [], gasPrices: [] };
//   }
// }

export async function populateChainInfoBox() {
  try {
    const { blockNumbers, transactionCounts, gasPrices, ethPrices } =
      await getLastFiveBlockInfo();

    // Get the width of the chainInfoBox to properly format the separator line
    const boxWidth = chainInfoBox.width - 2; // Adjusting for border padding
    const separator = "-".repeat(boxWidth);

    let content = "";
    content += separator + "\n";

    for (let i = 0; i < blockNumbers.length; i++) {
      content += `{center}{bold}{blue-fg}${blockNumbers[i]}{/blue-fg}{/bold}{/center}\n`;
      content += `{bold}{green-fg}BLOCK:{/green-fg} ${blockNumbers[i]}{/bold}\n`;
      content += `{green-fg}ETH $:{/green-fg}  ${ethPrices[i]}\n`;
      content += `{green-fg}GAS (gwei):{/green-fg}  ${gasPrices[i]}\n`;
      content += `{green-fg}# TX:{/green-fg}  ${transactionCounts[i]}\n`;
      content += separator;

      // Add a newline after each block's info except the last one
      if (i < blockNumbers.length - 1) {
        content += "\n";
      }
    }

    chainInfoBox.setContent(content);
  } catch (error) {
    debugToFile(`populateChainInfoBox(): ${error}`, () => {});
  }
}

// export async function populateChainInfoBox() {
//   try {
//     const { blockNumbers, transactionCounts, gasPrices, ethPrices } =
//       await getLastFiveBlockInfo();

//     chainInfoBox.setContent(
//       `ETH PRICE ($)\n${ethPrices.join(
//         ", "
//       )}\n\nBLOCK NUMBERS\n${blockNumbers.join(
//         ", "
//       )}\n\nTRANSACTION COUNTS\n${transactionCounts.join(
//         ", "
//       )}\n\nGAS PRICE (gwei)\n${gasPrices.join(", ")}`
//     );
//   } catch (error) {
//     debugToFile(`populateChainInfoBox(): ${error}`, () => {});
//   }
// }
