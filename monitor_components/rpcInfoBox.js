import blessed from "blessed";
// import { localClient } from "./viemClients.js";
import { debugToFile } from "../helpers.js";

let rpcInfoBox;

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

export async function populateRpcInfoBox() {
  try {
    rpcInfoBox.setContent(content);
  } catch (error) {
    debugToFile(`populateRpcInfoBox(): ${error}`);
  }
}
