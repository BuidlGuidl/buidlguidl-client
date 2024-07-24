import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import blessed from "blessed";
import { debugToFile } from "../helpers.js";

const localClient = createPublicClient({
  name: "localClient",
  chain: mainnet,
  transport: http("http://localhost:8545"),
});

async function isSyncing() {
  try {
    const syncingStatus = await localClient.request({
      method: "eth_syncing",
      params: [],
    });

    return syncingStatus;
  } catch (error) {
    throw new Error(`Failed to fetch syncing status: ${error.message}`);
  }
}

export async function updateStatusBox(statusBox, screen) {
  try {
    const syncingStatus = await isSyncing();

    if (syncingStatus) {
      const currentBlock = parseInt(syncingStatus.currentBlock, 16);
      const highestBlock = parseInt(syncingStatus.highestBlock, 16);

      statusBox.setContent(
        `INITIAL SYNC IN PROGRESS\nCurrent Block: ${currentBlock}\nHighest Block: ${highestBlock}`
      );
      // statusBox.setContent(
      //   `INITIAL SYNC IN PROGRESS\nCurrent Block: ${currentBlock.toFixed(
      //     0
      //   )}\nHighest Block: ${highestBlock.toFixed(0)}`
      // );
    } else {
      const blockNumber = await localClient.getBlockNumber();

      statusBox.setContent(
        `FOLLOWING CHAIN HEAD\nCurrent Block: ${blockNumber}`
      );
    }

    screen.render();
  } catch (error) {
    console.error();
    debugToFile(
      `updateStatusBox() Failed to update sync progress gauge: ${error}`,
      () => {}
    );
  }
}

export function createStatusBox(grid, screen) {
  const statusBox = grid.set(5, 7, 1, 2, blessed.box, {
    label: `Status`,
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  setInterval(() => updateStatusBox(statusBox, screen), 2000);

  return statusBox;
}
