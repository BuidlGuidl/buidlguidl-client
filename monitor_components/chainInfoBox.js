import blessed from "blessed";
import { localClient } from "./viemClients.js";
import { parseUnits } from "viem/utils";
import { debugToFile } from "../helpers.js";
import { layoutHeightThresh } from "./helperFunctions.js";

let chainInfoBox;

export function createChainInfoBox(grid, screen) {
  // const row = screen.height < layoutHeightThresh ? 3 : 6;
  // const rowSpan = screen.height < layoutHeightThresh ? 6 : 3;
  const row = 2;
  const rowSpan = 5;

  chainInfoBox = grid.set(row, 8, rowSpan, 1, blessed.box, {
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

async function getTransactionCount() {
  try {
    const blockNumber = await localClient.getBlockNumber();
    const block = await localClient.getBlock({
      blockNumber: blockNumber,
    });
    const transactionCount = block.transactions.length;

    return transactionCount;
  } catch (error) {
    debugToFile(`getTransactionCount(): ${error}`, () => {});
  }
}

export async function populateChainInfoBox() {
  try {
    const ethPrice = await getEthPrice();
    const transactionCount = await getTransactionCount();
    const gasPrice = await localClient.getGasPrice();

    let gasPriceGwei = Number(gasPrice) / 10 ** 9;

    chainInfoBox.setContent(
      `ETH PRICE ($)\n${ethPrice}\n\nTRANSACTION COUNT\n${transactionCount}\n\nGAS PRICE (gwei)\n${gasPriceGwei}`
    );
  } catch (error) {
    debugToFile(`populateChainInfoBox(): ${error}`, () => {});
  }
}
