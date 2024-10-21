import os from "os";
import { execSync } from "child_process";
import path from "path";
import { installDir } from "../commandLineOptions.js";
import { debugToFile } from "../helpers.js";

export const latestGethVer = "1.14.3";
export const latestRethVer = "1.0.0";
export const latestLighthouseVer = "5.3.0";

export function getVersionNumber(client) {
  const platform = os.platform();
  let clientCommand;
  let argument;
  let versionOutput;
  let versionMatch;

  if (client === "reth" || client === "lighthouse" || client === "geth") {
    argument = "--version";
  } else if (client === "prysm") {
    argument = "beacon-chain --version";
  }

  if (["darwin", "linux"].includes(platform)) {
    clientCommand = path.join(
      installDir,
      "ethereum_clients",
      `${client}`,
      client === "prysm" ? `${client}.sh` : `${client}`
    );
  } else if (platform === "win32") {
    console.log("getVersionNumber() for windows is yet not implemented");
    process.exit(1);
  }

  try {
    const versionCommand = execSync(
      `${clientCommand} ${argument} 2>/dev/null`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }
    );
    versionOutput = versionCommand.trim();

    if (client === "reth") {
      versionMatch = versionOutput.match(/reth Version: (\d+\.\d+\.\d+)/);
    } else if (client === "lighthouse") {
      versionMatch = versionOutput.match(/Lighthouse v(\d+\.\d+\.\d+)/);
    } else if (client === "geth") {
      versionMatch = versionOutput.match(/geth version (\d+\.\d+\.\d+)/);
    } else if (client === "prysm") {
      versionMatch = versionOutput.match(/beacon-chain-v(\d+\.\d+\.\d+)-/);
    }

    const parsedVersion = versionMatch ? versionMatch[1] : null;

    if (parsedVersion) {
      return parsedVersion;
    } else {
      console.error(`Unable to parse version number for ${client}`);
      return null;
    }
  } catch (error) {
    console.error(`Error getting version for ${client}:`, error.message);
    return null;
  }
}
