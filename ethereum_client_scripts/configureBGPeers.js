import { getPublicIPAddress } from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

export async function fetchBGPeers(executionClient) {
  try {
    const publicIP = await getPublicIPAddress();
    const response = await fetch("https://rpc.buidlguidl.com:48544/enodes");
    const data = await response.json();

    const filteredEnodes = data.enodes.filter(
      (node) =>
        node.executionClient === executionClient &&
        !node.enode.includes(publicIP)
    );

    return filteredEnodes.map((node) => node.enode);
  } catch (error) {
    debugToFile("fetchBGPeers():", error);
    return [];
  }
}

export async function configureBGPeers(bgPeers, executionClient) {
  try {
    if (executionClient === "reth") {
      for (const enode of bgPeers) {
        const curlCommandAddPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addPeer","params":["${enode}"]}' http://localhost:8545`;
        const curlCommandAddTrustedPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addTrustedPeer","params":["${enode}"]}' http://localhost:8545`;

        const { exec } = await import("child_process");

        exec(curlCommandAddPeer, (error, stdout, stderr) => {
          if (error) {
            debugToFile(
              `configureBGPeers(): AddPeer: Error executing curl command: ${error}`
            );
            return;
          }
          if (stderr) {
            debugToFile(
              `configureBGPeers(): AddPeer: Curl command stderr: ${stderr}`
            );
            return;
          }
          debugToFile(
            `configureBGPeers(): AddPeer: Curl command stdout: ${stdout}`
          );
        });

        exec(curlCommandAddTrustedPeer, (error, stdout, stderr) => {
          if (error) {
            debugToFile(
              `configureBGPeers(): AddTrustedPeer: Error executing curl command: ${error}`
            );
            return;
          }
          if (stderr) {
            debugToFile(
              `configureBGPeers(): AddTrustedPeer: Curl command stderr: ${stderr}`
            );
            return;
          }
          debugToFile(
            `configureBGPeers(): AddTrustedPeer: Curl command stdout: ${stdout}`
          );
        });
      }
    }
  } catch (error) {
    debugToFile(
      `configureBGPeers() error: ${error.message}\nStack: ${error.stack}`
    );
  }
}
