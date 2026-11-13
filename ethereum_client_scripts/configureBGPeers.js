import fetch from "node-fetch";
import { getPublicIPAddress } from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";
import {
  executionPeerPort,
  executionClient,
  installDir,
} from "../commandLineOptions.js";
import { getExecutionIpcPath, executionIpcRequest } from "./executionIpc.js";
import os from "os";
import { getMacAddress } from "../getSystemStats.js";
import { consensusClient } from "../commandLineOptions.js";
import { BASE_URL } from "../config.js";

export async function fetchBGExecutionPeers() {
  try {
    const publicIP = await getPublicIPAddress();
    const response = await fetch(`https://${BASE_URL}:48546/enodes`);
    const data = await response.json();

    const filteredEnodes = data.enodes.filter((node) => {
      const nodeUrl = new URL(node.enode);
      return !(
        nodeUrl.hostname === publicIP &&
        nodeUrl.port === executionPeerPort.toString()
      );
    });

    const filteredEnodeValues = filteredEnodes.map((node) => node.enode);

    debugToFile(
      "fetchBGExecutionPeers(): Filtered enodes:\n" +
        filteredEnodeValues.join("\n")
    );

    return filteredEnodeValues;
  } catch (error) {
    debugToFile("fetchBGExecutionPeers() error:", error);
    return [];
  }
}

export async function configureBGExecutionPeers(bgPeers) {
  const ipcPath = getExecutionIpcPath(executionClient, installDir);
  const requests = bgPeers.flatMap((enode) =>
    ["admin_addPeer", "admin_addTrustedPeer"].map(async (method) => {
      try {
        // Runs shortly after startup; the execution client may not have
        // opened its IPC socket yet, so wait up to 5 minutes for it.
        const result = await executionIpcRequest(ipcPath, method, [enode], 5000, {
          waitForSocket: 5 * 60 * 1000,
        });
        debugToFile(`configureBGExecutionPeers(): ${method} ${enode}: ${result}`);
      } catch (error) {
        debugToFile(`configureBGExecutionPeers(): ${enode}: ${error.message}`);
      }
    })
  );
  await Promise.all(requests);
}

export async function fetchBGConsensusPeers() {
  try {
    const response = await fetch(`https://${BASE_URL}:48546/peerids`);
    const data = await response.json();

    const peerIDValues = data.peerids
      .map((peer) => peer.peerid)
      .filter((peerid) => peerid && peerid !== "null"); // Filter out falsy values and "null" strings

    return peerIDValues;
  } catch (error) {
    debugToFile("fetchBGConsensusPeers() error:", error);
    return [];
  }
}

export async function configureBGConsensusPeers() {
  try {
    const response = await fetch(`https://${BASE_URL}:48546/consensuspeeraddr`);
    const data = await response.json();

    const macAddress = await getMacAddress();
    const thisMachineID = `${os.hostname()}-${macAddress}-${os.platform()}-${os.arch()}`;

    const filteredPeers = data.consensusPeerAddrs.filter(
      (peer) =>
        peer.consensusClient === consensusClient &&
        peer.machineID !== thisMachineID
    );

    const peerAddresses = filteredPeers.flatMap((peer) =>
      peer.consensusPeerAddr.split(",")
    );

    const result = peerAddresses.join(",");

    // debugToFile(
    //   `configureBGConsensusPeers(): Filtered peer addresses:\n${result}`
    // );

    return result;
  } catch (error) {
    debugToFile("configureBGConsensusPeers() error:", error);
    return "";
  }
}
