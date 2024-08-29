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

// async function getTransactionCount() {
//   try {
//     const blockNumber = await localClient.getBlockNumber();
//     const block = await localClient.getBlock({
//       blockNumber: blockNumber,
//     });
//     const transactionCount = block.transactions.length;

//     return transactionCount;
//   } catch (error) {
//     debugToFile(`getTransactionCount(): ${error}`, () => {});
//   }
// }

async function getTransactionCount() {
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

    // Extract transaction counts from the blocks
    const transactionCounts = blocks.map((block) => block.transactions.length);

    return { blockNumbers, transactionCounts };
  } catch (error) {
    debugToFile(`getTransactionCount(): ${error}`, () => {});
    return [];
  }
}

export async function populateChainInfoBox() {
  try {
    const ethPrice = await getEthPrice();
    const { blockNumbers, transactionCounts } = await getTransactionCount();
    const gasPrice = await localClient.getGasPrice();

    let gasPriceGwei = Number(gasPrice) / 10 ** 9;

    chainInfoBox.setContent(
      `ETH PRICE ($)\n${ethPrice}\n\nBLOCK NUMBERS\n${blockNumbers.join(
        ", "
      )}\n\nTRANSACTION COUNTS\n${transactionCounts.join(
        ", "
      )}\n\nGAS PRICE (gwei)\n${gasPriceGwei}`
    );
  } catch (error) {
    debugToFile(`populateChainInfoBox(): ${error}`, () => {});
  }
}

// export async function populateChainInfoBox() {
//   try {
//     const ethPrice = await getEthPrice();
//     const transactionCount = await getTransactionCount();
//     const gasPrice = await localClient.getGasPrice();

//     let gasPriceGwei = Number(gasPrice) / 10 ** 9;

//     chainInfoBox.setContent(
//       `ETH PRICE ($)\n${ethPrice}\n\nTRANSACTION COUNT\n${transactionCount}\n\nGAS PRICE (gwei)\n${gasPriceGwei}`
//     );
//   } catch (error) {
//     debugToFile(`populateChainInfoBox(): ${error}`, () => {});
//   }
// }
