import blessed from "blessed";
import { debugToFile } from "../helpers.js";
import { owner } from "../commandLineOptions.js";

let rpcInfoBox;
let rpcMethodsHistory = [];
const MAX_HISTORY_LENGTH = 30;

export function createRpcInfoBox(grid) {
  // Create the box configuration but don't add it to grid yet
  const boxConfig = {
    label: "RPC Requests",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
    tags: true,
  };

  // Only create and add to grid if owner exists
  if (owner != null) {
    rpcInfoBox = grid.set(5, 7, 2, 1, blessed.box, boxConfig);
    rpcInfoBox.setContent("INITIALIZING...");
  } else {
    // Create the box without adding it to grid
    rpcInfoBox = blessed.box(boxConfig);
  }

  return rpcInfoBox;
}

export function populateRpcInfoBox(rpcMethod) {
  try {
    if (rpcMethod) {
      rpcMethodsHistory.unshift(rpcMethod); // Add the new method to the top of the history
      if (rpcMethodsHistory.length > MAX_HISTORY_LENGTH) {
        rpcMethodsHistory = rpcMethodsHistory.slice(0, MAX_HISTORY_LENGTH); // Keep only the most recent entries
      }
    }
    const content = rpcMethodsHistory.map((method) => `${method}`).join("\n");
    rpcInfoBox.setContent(content);
  } catch (error) {
    debugToFile(`populateRpcInfoBox(): ${error}`);
  }
}
