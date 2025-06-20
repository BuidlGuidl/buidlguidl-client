import fetch from "node-fetch";
import { getPublicIPAddress } from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";
import { executionPeerPort } from "../commandLineOptions.js";
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
  try {
    for (const enode of bgPeers) {
      const curlCommandAddPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addPeer","params":["${enode}"]}' http://localhost:8545`;
      const curlCommandAddTrustedPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addTrustedPeer","params":["${enode}"]}' http://localhost:8545`;

      const { exec } = await import("child_process");

      exec(curlCommandAddPeer, (error, stdout, stderr) => {
        if (error) {
          debugToFile(
            `configureBGExecutionPeers(): AddPeer: Error executing curl command: ${error}`
          );
          return;
        }
        if (stderr) {
          debugToFile(
            `configureBGExecutionPeers(): AddPeer: Curl command stderr: ${stderr}`
          );
          return;
        }
        debugToFile(
          `configureBGExecutionPeers(): AddPeer: Curl command stdout: ${stdout}`
        );
      });

      exec(curlCommandAddTrustedPeer, (error, stdout, stderr) => {
        if (error) {
          debugToFile(
            `configureBGExecutionPeers(): AddTrustedPeer: Error executing curl command: ${error}`
          );
          return;
        }
        if (stderr) {
          debugToFile(
            `configureBGExecutionPeers(): AddTrustedPeer: Curl command stderr: ${stderr}`
          );
          return;
        }
        debugToFile(
          `configureBGExecutionPeers(): AddTrustedPeer: Curl command stdout: ${stdout}`
        );
      });
    }
  } catch (error) {
    debugToFile(
      `configureBGExecutionPeers() error: ${error.message}\nStack: ${error.stack}`
    );
  }
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
