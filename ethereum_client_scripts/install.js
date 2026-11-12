import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";
import crypto from "crypto";
import { installDir } from "../commandLineOptions.js";
import { debugToFile } from "./../helpers.js";

export const latestGethVer = "1.17.10";
export const latestRethVer = "2.11.0";
export const latestLighthouseVer = "8.3.3";
export const latestNethermindVer = "2.2.2";

// Nethermind release assets are named <version>-<commit>-<os>-<arch>.zip, so
// the commit has to be pinned with the version. SHA-256 digests are from the
// GitHub release (asset `digest` field); the download is checked against them.
const nethermindRelease = {
  "2.2.2": {
    commit: "be201120",
    sha256: {
      "linux-x64":
        "ab37ee6900ca86db4209e8f44409897a32587b29084c19274cc54cf8b8e23d59",
      "linux-arm64":
        "e7fe1dc3a104ef4ba4656a803802598d60c33490f6104cea53900d5a8bcde496",
      "macos-x64":
        "fb7eb6dae7aeab7f2243d861cdfc3cb101efb8fee98da8b051fa9a5f7c73a18d",
      "macos-arm64":
        "85ee284870f00a37369e658898f997c4955fa492dcc44477a617d1670b5f00d1",
    },
  },
};

function nethermindAsset(osArch) {
  const { commit } = nethermindRelease[latestNethermindVer];
  return `nethermind-${latestNethermindVer}-${commit}-${osArch}`;
}

// Nethermind ships as a self-contained directory (executable plus configs/,
// plugins/, ...), unpacked into ethereum_clients/nethermind/nethermind/ so the
// executable is ethereum_clients/nethermind/nethermind/nethermind and
// removeClient() (--update) removes the whole release.
export function getNethermindCommand(dir = installDir) {
  return path.join(dir, "ethereum_clients", "nethermind", "nethermind", "nethermind");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function installNethermind(clientDir, osArch) {
  try {
    execSync("command -v unzip", { stdio: "ignore" });
  } catch {
    console.log(
      "❌ Installing Nethermind needs 'unzip'. Install it (e.g. 'sudo apt install unzip') and re-run."
    );
    process.exit(1);
  }

  const asset = nethermindAsset(osArch);
  const zipName = `${asset}.zip`;
  const zipPath = path.join(clientDir, zipName);
  const url = `https://github.com/NethermindEth/nethermind/releases/download/${latestNethermindVer}/${zipName}`;

  console.log("Downloading nethermind.");
  execSync(`cd "${clientDir}" && curl -L -f -O -# ${url}`, { stdio: "inherit" });

  const expected = nethermindRelease[latestNethermindVer].sha256[osArch];
  const actual = sha256File(zipPath);
  if (actual !== expected) {
    fs.rmSync(zipPath, { force: true });
    console.log(
      `❌ Nethermind download failed its checksum (expected ${expected}, got ${actual}). Re-run to try again.`
    );
    process.exit(1);
  }

  console.log("Uncompressing nethermind.");
  const releaseDir = path.join(clientDir, "nethermind");
  const tmpDir = `${releaseDir}.tmp`;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`, { stdio: "inherit" });
  fs.chmodSync(path.join(tmpDir, "nethermind"), 0o755);
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.renameSync(tmpDir, releaseDir);

  console.log("Cleaning up nethermind directory.");
  fs.rmSync(zipPath, { force: true });
}

export function installMacLinuxClient(clientName, platform) {
  const arch = os.arch();

  const gethHash = {
    "1.14.3": "ab48ba42",
    "1.14.12": "293a300d",
    "1.15.10": "2bf8a789",
    "1.15.11": "36b2371c",
    "1.16.3": "d818a9af",
    "1.16.5": "737ffd1b",
    "1.16.7": "b9f3a3d9",
    "1.17.1": "16783c16",
    "1.17.3": "117e067f",
    "1.17.4": "36a7dc72",
    "1.17.10": "1df30b18",
  };

  const configs = {
    darwin: {
      x64: {
        geth: `geth-darwin-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-x86_64-apple-darwin`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-aarch64-apple-darwin`,
        prysm: "prysm.sh",
        nethermind: "macos-x64",
      },
      arm64: {
        geth: `geth-darwin-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-aarch64-apple-darwin`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-aarch64-apple-darwin`,
        prysm: "prysm.sh",
        nethermind: "macos-arm64",
      },
    },
    linux: {
      x64: {
        geth: `geth-linux-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-x86_64-unknown-linux-gnu`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-unknown-linux-gnu`,
        prysm: "prysm.sh",
        nethermind: "linux-x64",
      },
      arm64: {
        geth: `geth-linux-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-aarch64-unknown-linux-gnu`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-aarch64-unknown-linux-gnu`,
        prysm: "prysm.sh",
        nethermind: "linux-arm64",
      },
    },
  };

  const fileName = configs[platform][arch][clientName];
  const clientDir = path.join(installDir, "ethereum_clients", clientName);
  const clientScript =
    clientName === "nethermind"
      ? getNethermindCommand()
      : path.join(clientDir, clientName === "prysm" ? "prysm.sh" : clientName);

  if (!fs.existsSync(clientScript)) {
    console.log(`\nInstalling ${clientName}.`);
    if (!fs.existsSync(clientDir)) {
      console.log(`Creating '${clientDir}'`);
      fs.mkdirSync(`${clientDir}/database`, { recursive: true });
      fs.mkdirSync(`${clientDir}/logs`, { recursive: true });
    }

    const downloadUrls = {
      geth: `https://gethstore.blob.core.windows.net/builds/${fileName}.tar.gz`,
      reth: `https://github.com/paradigmxyz/reth/releases/download/v${latestRethVer}/${fileName}.tar.gz`,
      lighthouse: `https://github.com/sigp/lighthouse/releases/download/v${latestLighthouseVer}/${fileName}.tar.gz`,
      prysm:
        "https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.sh",
    };

    if (clientName === "nethermind") {
      installNethermind(clientDir, fileName);
    } else if (clientName === "prysm") {
      console.log("Downloading Prysm.");
      execSync(
        `cd "${clientDir}" && curl -L -O -# ${downloadUrls.prysm} && chmod +x prysm.sh`,
        { stdio: "inherit" },
      );
    } else {
      console.log(`Downloading ${clientName}.`);
      execSync(
        `cd "${clientDir}" && curl -L -O -# ${downloadUrls[clientName]}`,
        { stdio: "inherit" },
      );
      console.log(`Uncompressing ${clientName}.`);
      execSync(`cd "${clientDir}" && tar -xzvf "${fileName}.tar.gz"`, {
        stdio: "inherit",
      });

      if (clientName === "geth") {
        execSync(`cd "${clientDir}/${fileName}" && mv geth ..`, {
          stdio: "inherit",
        });
        execSync(`cd "${clientDir}" && rm -r "${fileName}"`, {
          stdio: "inherit",
        });
      }

      console.log(`Cleaning up ${clientName} directory.`);
      execSync(`cd "${clientDir}" && rm "${fileName}.tar.gz"`, {
        stdio: "inherit",
      });
    }
  } else {
    console.log(`${clientName} is already installed.`);
  }
}

export function getVersionNumber(client) {
  const platform = os.platform();
  let clientCommand;
  let argument;
  let versionOutput;
  let versionMatch;

  if (
    client === "reth" ||
    client === "lighthouse" ||
    client === "geth" ||
    client === "nethermind"
  ) {
    argument = "--version";
  } else if (client === "prysm") {
    argument = "beacon-chain --version";
  }

  if (["darwin", "linux"].includes(platform) && client === "nethermind") {
    clientCommand = getNethermindCommand();
  } else if (["darwin", "linux"].includes(platform)) {
    clientCommand = path.join(
      installDir,
      "ethereum_clients",
      `${client}`,
      client === "prysm" ? `${client}.sh` : `${client}`,
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
      },
    );
    versionOutput = versionCommand.trim();

    if (client === "reth") {
      versionMatch = versionOutput.match(
        /[Rr]eth(?:-ethereum-cli)? Version: (\d+\.\d+\.\d+)/,
      );
    } else if (client === "lighthouse") {
      versionMatch = versionOutput.match(/Lighthouse v(\d+\.\d+\.\d+)/);
    } else if (client === "geth") {
      versionMatch = versionOutput.match(/geth version (\d+\.\d+\.\d+)/);
    } else if (client === "nethermind") {
      versionMatch = versionOutput.match(/Version:\s+(\d+\.\d+\.\d+)/);
    } else if (client === "prysm") {
      versionMatch = versionOutput.match(/beacon-chain-v(\d+\.\d+\.\d+)-/);
    }

    const parsedVersion = versionMatch ? versionMatch[1] : null;

    if (parsedVersion) {
      return parsedVersion;
    } else {
      debugToFile(`Unable to parse version number for ${client}`);
      return null;
    }
  } catch (error) {
    debugToFile(`Error getting version for ${client}:`, error.message);
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
  } else if (client === "nethermind") {
    latestVersion = latestNethermindVer;
  }
  if (compareVersions(installedVersion, latestVersion) < 0) {
    isLatest = false;
  }
  return [isLatest, latestVersion];
}

export function removeClient(client) {
  const clientDir = path.join(installDir, "ethereum_clients", client, client);
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
