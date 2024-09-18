import fetch from "node-fetch";
import { getPublicIPAddress } from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";
import { executionPeerPort } from "../commandLineOptions.js";

export async function fetchBGExecutionPeers(executionClient) {
  try {
    const publicIP = await getPublicIPAddress();
    const response = await fetch("https://rpc.buidlguidl.com:48544/enodes");
    const data = await response.json();

    const ipPortCombination = `${publicIP}:${executionPeerPort}`;

    const filteredEnodes = data.enodes.filter(
      (node) => !node.enode.includes(ipPortCombination)
    );

    return filteredEnodes.map((node) => node.enode);
  } catch (error) {
    debugToFile("fetchBGExecutionPeers():", error);
    return [];
  }
}

export async function configureBGExecutionPeers(bgPeers, executionClient) {
  try {
    if (executionClient === "reth") {
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
    }
  } catch (error) {
    debugToFile(
      `configureBGExecutionPeers() error: ${error.message}\nStack: ${error.stack}`
    );
  }
}
