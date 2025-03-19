import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";
import { installDir } from "../commandLineOptions.js"; // Adjust the path as needed

export const latestGethVer = "1.15.0";
export const latestRethVer = "1.0.0";
export const latestLighthouseVer = "6.0.0";

export function installMacLinuxClient(clientName, platform) {
  const arch = os.arch();
  const clientDir = path.join(installDir, "ethereum_clients", clientName);

  if (clientName === "geth") {
    // The built geth binary is expected at:
    const builtBinary = path.join(clientDir, "go-ethereum", "build", "bin", "geth");

    if (!fs.existsSync(builtBinary)) {
      console.log(`\nInstalling ${clientName} from source.`);
      // Ensure necessary directories exist
      if (!fs.existsSync(clientDir)) {
        console.log(`Creating '${clientDir}'`);
        fs.mkdirSync(path.join(clientDir, "database"), { recursive: true });
        fs.mkdirSync(path.join(clientDir, "logs"), { recursive: true });
      }
      // Define the clone directory for the go-ethereum repository
      const cloneDir = path.join(clientDir, "go-ethereum");
      if (!fs.existsSync(cloneDir)) {
        console.log("Cloning go-ethereum repository...");
        execSync(`git clone https://github.com/gnosischain/go-ethereum "${cloneDir}"`, { stdio: "inherit" });
      } else {
        console.log("go-ethereum repository already exists. Updating repository...");
        execSync(`cd "${cloneDir}" && git pull`, { stdio: "inherit" });
      }
      // Build geth using "make geth"
      execSync(`cd "${cloneDir}" && make geth`, { stdio: "inherit" });
      console.log("Geth installed successfully.");
    } else {
      console.log(`${clientName} is already installed.`);
    }
  } else {
    // Prebuilt binaries for reth, lighthouse, and prysm
    const gethHash = {
      "1.14.3": "ab48ba42",
      "1.14.12": "293a300d",
      "1.15.0": "5543cff6",
    };

    const configs = {
      darwin: {
        x64: {
          geth: `geth-darwin-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
          reth: `reth-v${latestRethVer}-x86_64-apple-darwin`,
          lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-apple-darwin`,
          prysm: "prysm.sh",
        },
        arm64: {
          geth: `geth-darwin-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
          reth: `reth-v${latestRethVer}-aarch64-apple-darwin`,
          lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-apple-darwin`,
          prysm: "prysm.sh",
        },
      },
      linux: {
        x64: {
          geth: `geth-linux-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
          reth: `reth-v${latestRethVer}-x86_64-unknown-linux-gnu`,
          lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-unknown-linux-gnu`,
          prysm: "prysm.sh",
        },
        arm64: {
          geth: `geth-linux-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
          reth: `reth-v${latestRethVer}-aarch64-unknown-linux-gnu`,
          lighthouse: `lighthouse-v${latestLighthouseVer}-aarch64-unknown-linux-gnu`,
          prysm: "prysm.sh",
        },
      },
    };

    const fileName = configs[platform][arch][clientName];

    const clientScript = path.join(
      clientDir,
      clientName === "prysm" ? "prysm.sh" : clientName
    );

    if (!fs.existsSync(clientScript)) {
      console.log(`\nInstalling ${clientName}.`);
      if (!fs.existsSync(clientDir)) {
        console.log(`Creating '${clientDir}'`);
        fs.mkdirSync(path.join(clientDir, "database"), { recursive: true });
        fs.mkdirSync(path.join(clientDir, "logs"), { recursive: true });
      }

      const downloadUrls = {
        geth: `https://gethstore.blob.core.windows.net/builds/${fileName}.tar.gz`,
        reth: `https://github.com/paradigmxyz/reth/releases/download/v${latestRethVer}/${fileName}.tar.gz`,
        lighthouse: `https://github.com/sigp/lighthouse/releases/download/v${latestLighthouseVer}/${fileName}.tar.gz`,
        prysm: "https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.sh",
      };

      if (clientName === "prysm") {
        console.log("Downloading Prysm.");
        execSync(
          `cd "${clientDir}" && curl -L -O -# ${downloadUrls.prysm} && chmod +x prysm.sh`,
          { stdio: "inherit" }
        );
      } else {
        console.log(`Downloading ${clientName}.`);
        execSync(
          `cd "${clientDir}" && curl -L -O -# ${downloadUrls[clientName]}`,
          { stdio: "inherit" }
        );
        console.log(`Uncompressing ${clientName}.`);
        execSync(`cd "${clientDir}" && tar -xzvf "${fileName}.tar.gz"`, {
          stdio: "inherit",
        });

        if (clientName === "geth") {
          execSync(`cd "${clientDir}/${fileName}" && mv geth ..`, {
            stdio: "inherit"
          });
          execSync(`cd "${clientDir}" && rm -r "${fileName}"`, {
            stdio: "inherit"
          });
        }

        console.log(`Cleaning up ${clientName} directory.`);
        execSync(`cd "${clientDir}" && rm "${fileName}.tar.gz"`, {
          stdio: "inherit"
        });
      }
    } else {
      console.log(`${clientName} is already installed.`);
    }
  }
}

export function getVersionNumber(client) {
  let clientCommand;
  let argument;
  let versionOutput;
  let versionMatch;

  if (client === "reth" || client === "lighthouse") {
    clientCommand = path.join(installDir, "ethereum_clients", client, client);
    argument = "--version";
  } else if (client === "geth") {
    clientCommand = path.join(
      installDir,
      "ethereum_clients",
      "geth",
      "go-ethereum",
      "build",
      "bin",
      "geth"
    );
    argument = "--version";
  } else if (client === "prysm") {
    clientCommand = path.join(installDir, "ethereum_clients", "prysm", "prysm.sh");
    argument = "beacon-chain --version";
  }

  try {
    // Capture both stdout and stderr
    const versionCommand = execSync(`${clientCommand} ${argument}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    versionOutput = versionCommand.trim();

    if (client === "reth") {
      versionMatch = versionOutput.match(/reth Version: (\d+\.\d+\.\d+)/i);
    } else if (client === "lighthouse") {
      versionMatch = versionOutput.match(/Lighthouse v(\d+\.\d+\.\d+)/i);
    } else if (client === "geth") {
      // Updated regex to capture "1.15.0" from "geth version 1.15.0-unstable-5543cff6-20250202"
      versionMatch = versionOutput.match(/geth version\s+([\d]+\.[\d]+\.[\d]+)(?:-|$)/i);
    } else if (client === "prysm") {
      versionMatch = versionOutput.match(/beacon-chain-v(\d+\.\d+\.\d+)-/i);
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

export function compareClientVersions(client, installedVersion) {
  let isLatest = true;
  let latestVersion;

  if (client === "reth") {
    latestVersion = latestRethVer;
  } else if (client === "geth") {
    latestVersion = latestGethVer;
  } else if (client === "lighthouse") {
    latestVersion = latestLighthouseVer;
  }
  if (compareVersions(installedVersion, latestVersion) < 0) {
    isLatest = false;
  }
  return [isLatest, latestVersion];
}

export function removeClient(client) {
  const clientDir = path.join(installDir, "ethereum_clients", client);
  if (fs.existsSync(clientDir)) {
    fs.rmSync(clientDir, { recursive: true });
  }
}

function compareVersions(v1, v2) {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }

  return 0;
}
