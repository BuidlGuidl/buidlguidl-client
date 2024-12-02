import blessed from "blessed";
// import { localClient } from "./viemClients.js";
import { debugToFile } from "../helpers.js";

let rpcInfoBox;
let rpcMethodsHistory = [];
const MAX_HISTORY_LENGTH = 30;

export function createRpcInfoBox(grid) {
  rpcInfoBox = grid.set(5, 7, 2, 1, blessed.box, {
    label: "RPC Calls",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
    tags: true,
  });

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
