import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";

let installDir = os.homedir();

export function installMacLinuxExecutionClient(
  executionClient,
  platform,
  gethVer,
  rethVer
) {
  const arch = os.arch();

  const configs = {
    darwin: {
      x64: {
        gethFileName: `geth-darwin-amd64-${gethVer}-ab48ba42`,
        rethFileName: `reth-v${rethVer}-rc.2-x86_64-apple-darwin`,
      },
      arm64: {
        gethFileName: `geth-darwin-arm64-${gethVer}-ab48ba42`,
        rethFileName: `reth-v${rethVer}-rc.2-aarch64-apple-darwin`,
      },
    },
    linux: {
      x64: {
        gethFileName: `geth-linux-amd64-${gethVer}-ab48ba42`,
        rethFileName: `reth-v${rethVer}-rc.2-x86_64-unknown-linux-gnu`,
      },
      arm64: {
        gethFileName: `geth-linux-arm64-${gethVer}-ab48ba42`,
        rethFileName: `reth-v${rethVer}-rc.2-aarch64-unknown-linux-gnu`,
      },
    },
  };

  const { gethFileName, rethFileName } = configs[platform][arch];

  if (executionClient === "geth") {
    const gethDir = path.join(installDir, "bgnode", "geth");
    const gethScript = path.join(gethDir, "geth");
    if (!fs.existsSync(gethScript)) {
      console.log("\nInstalling Geth.");
      if (!fs.existsSync(gethDir)) {
        console.log(`Creating '${gethDir}'`);
        fs.mkdirSync(`${gethDir}/database`, { recursive: true });
        fs.mkdirSync(`${gethDir}/logs`, { recursive: true });
      }
      console.log("Downloading Geth.");
      execSync(
        `cd "${gethDir}" && curl -L -O -# https://gethstore.blob.core.windows.net/builds/${gethFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Geth.");
      execSync(`cd "${gethDir}" && tar -xzvf "${gethFileName}.tar.gz"`, {
        stdio: "inherit",
      });
      execSync(`cd "${gethDir}/${gethFileName}" && mv geth ..`, {
        stdio: "inherit",
      });
      console.log("Cleaning up Geth directory.");
      execSync(
        `cd "${gethDir}" && rm -r "${gethFileName}" && rm "${gethFileName}.tar.gz"`,
        { stdio: "inherit" }
      );
    } else {
      console.log("Geth is already installed.");
    }
  } else if (executionClient === "reth") {
    const rethDir = path.join(installDir, "bgnode", "reth");
    const rethScript = path.join(rethDir, "reth");
    if (!fs.existsSync(rethScript)) {
      console.log("\nInstalling Reth.");
      if (!fs.existsSync(rethDir)) {
        console.log(`Creating '${rethDir}'`);
        fs.mkdirSync(`${rethDir}/database`, { recursive: true });
        fs.mkdirSync(`${rethDir}/logs`, { recursive: true });
      }
      console.log("Downloading Reth.");
      execSync(
        `cd "${rethDir}" && curl -L -O -# https://github.com/paradigmxyz/reth/releases/download/v${rethVer}-rc.2/${rethFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Reth.");
      execSync(`cd "${rethDir}" && tar -xzvf "${rethFileName}.tar.gz"`, {
        stdio: "inherit",
      });
      console.log("Cleaning up Reth directory.");
      execSync(`cd "${rethDir}" && rm "${rethFileName}.tar.gz"`, {
        stdio: "inherit",
      });

      // downloadRethSnapshot(rethDir, platform);
    } else {
      console.log("Reth is already installed.");
    }
  }
}

export function installMacLinuxConsensusClient(
  consensusClient,
  platform,
  lighthouseVer
) {
  const arch = os.arch();

  const configs = {
    darwin: {
      x64: {
        lighthouseFileName: `lighthouse-v${lighthouseVer}-x86_64-apple-darwin`,
      },
      arm64: {
        lighthouseFileName: `lighthouse-v${lighthouseVer}-x86_64-apple-darwin-portable`,
      },
    },
    linux: {
      x64: {
        lighthouseFileName: `lighthouse-v${lighthouseVer}-x86_64-unknown-linux-gnu`,
      },
      arm64: {
        lighthouseFileName: `lighthouse-v${lighthouseVer}-aarch64-unknown-linux-gnu`,
      },
    },
  };

  const prysmFileName = "prysm";
  const { lighthouseFileName } = configs[platform][arch];

  if (consensusClient === "prysm") {
    const prysmDir = path.join(installDir, "bgnode", "prysm");
    const prysmScript = path.join(prysmDir, "prysm.sh");
    if (!fs.existsSync(prysmScript)) {
      console.log("\nInstalling Prysm.");
      if (!fs.existsSync(prysmDir)) {
        console.log(`Creating '${prysmDir}'`);
        fs.mkdirSync(`${prysmDir}/database`, { recursive: true });
        fs.mkdirSync(`${prysmDir}/logs`, { recursive: true });
      }
      console.log("Downloading Prysm.");
      execSync(
        `cd "${prysmDir}" && curl -L -O -# https://raw.githubusercontent.com/prysmaticlabs/prysm/master/${prysmFileName}.sh && chmod +x prysm.sh`,
        { stdio: "inherit" }
      );
    } else {
      console.log("Prysm is already installed.");
    }
  } else if (consensusClient === "lighthouse") {
    const lighthouseDir = path.join(installDir, "bgnode", "lighthouse");
    const lighthouseScript = path.join(lighthouseDir, "lighthouse");
    if (!fs.existsSync(lighthouseScript)) {
      console.log("\nInstalling Lighthouse.");
      if (!fs.existsSync(lighthouseDir)) {
        console.log(`Creating '${lighthouseDir}'`);
        fs.mkdirSync(`${lighthouseDir}/database`, { recursive: true });
        fs.mkdirSync(`${lighthouseDir}/logs`, { recursive: true });
      }
      console.log("Downloading Lighthouse.");
      execSync(
        `cd "${lighthouseDir}" && curl -L -O -# https://github.com/sigp/lighthouse/releases/download/v${lighthouseVer}/${lighthouseFileName}.tar.gz`,
        { stdio: "inherit" }
      );
      console.log("Uncompressing Lighthouse.");
      execSync(
        `cd "${lighthouseDir}" && tar -xzvf ${lighthouseFileName}.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      console.log("Cleaning up Lighthouse directory.");
      execSync(`cd "${lighthouseDir}" && rm ${lighthouseFileName}.tar.gz`, {
        stdio: "inherit",
      });
    } else {
      console.log("Lighthouse is already installed.");
    }
  }
}

export function installWindowsExecutionClient(executionClient) {
  if (executionClient === "geth") {
    const gethDir = path.join(installDir, "bgnode", "geth");
    const gethScript = path.join(gethDir, "geth.exe");
    if (!fs.existsSync(gethScript)) {
      console.log("\nInstalling Geth.");
      if (!fs.existsSync(gethDir)) {
        console.log(`Creating '${gethDir}'`);
        fs.mkdirSync(`${gethDir}/database`, { recursive: true });
        fs.mkdirSync(`${gethDir}/logs`, { recursive: true });
      }
      execSync(
        `cd "${gethDir}" && curl https://gethstore.blob.core.windows.net/builds/geth-windows-amd64-1.14.3-ab48ba42.zip --output geth.zip`,
        { stdio: "inherit" }
      );
      execSync(`cd "${gethDir}" && tar -xf geth.zip`, {
        stdio: "inherit",
      });
      execSync(
        `cd "${gethDir}/geth-windows-amd64-1.14.3-ab48ba42" && move geth.exe ..`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd "${gethDir}" && del geth.zip && rd /S /Q geth-windows-amd64-1.14.3-ab48ba42`,
        { stdio: "inherit" }
      );
    } else {
      console.log("Geth is already installed.");
    }
  } else if (executionClient === "reth") {
    const rethDir = path.join(installDir, "bgnode", "reth");
    const rethScript = path.join(rethDir, "reth.exe");
    if (!fs.existsSync(rethScript)) {
      console.log("\nInstalling Reth.");
      if (!fs.existsSync(rethDir)) {
        console.log(`Creating '${rethDir}'`);
        fs.mkdirSync(`${rethDir}/database`, { recursive: true });
        fs.mkdirSync(`${rethDir}/logs`, { recursive: true });
      }
      execSync(
        `cd "${rethDir}" && curl -LO https://github.com/paradigmxyz/reth/releases/download/v0.2.0-beta.6/reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        { stdio: "inherit" }
      );
      execSync(
        `cd "${rethDir}" && tar -xzf reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd "${rethDir}" && del reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        {
          stdio: "inherit",
        }
      );
    } else {
      console.log("Reth is already installed.");
    }
  }
}

export function installWindowsConsensusClient(consensusClient) {
  if (consensusClient === "prysm") {
    const prysmDir = path.join(installDir, "bgnode", "prysm");
    const prysmScript = path.join(prysmDir, "prysm.bat");
    if (!fs.existsSync(prysmScript)) {
      console.log("Installing Prysm.");
      if (!fs.existsSync(prysmDir)) {
        console.log(`Creating '${prysmDir}'`);
        fs.mkdirSync(`${prysmDir}/database`, { recursive: true });
        fs.mkdirSync(`${prysmDir}/logs`, { recursive: true });
      }
      execSync(
        `cd "${prysmDir}" && curl https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.bat --output prysm.bat`,
        { stdio: "inherit" }
      );
      execSync(
        "reg add HKCU\\Console /v VirtualTerminalLevel /t REG_DWORD /d 1",
        { stdio: "inherit" }
      );
    } else {
      console.log("Prysm is already installed.");
    }
  } else if (consensusClient === "lighthouse") {
    const lighthouseDir = path.join(installDir, "bgnode", "lighthouse");
    const lighthouseScript = path.join(lighthouseDir, "lighthouse.exe");
    if (!fs.existsSync(lighthouseScript)) {
      console.log("Installing Lighthouse.");
      if (!fs.existsSync(lighthouseDir)) {
        console.log(`Creating '${lighthouseDir}'`);
        fs.mkdirSync(`${lighthouseDir}/database`, { recursive: true });
        fs.mkdirSync(`${lighthouseDir}/logs`, { recursive: true });
      }
      execSync(
        `cd "${lighthouseDir}" && curl -LO https://github.com/sigp/lighthouse/releases/download/v5.1.3/lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        { stdio: "inherit" }
      );
      execSync(
        `cd "${lighthouseDir}" && tar -xzf lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd "${lighthouseDir}" && del lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        {
          stdio: "inherit",
        }
      );
    } else {
      console.log("Lighthouse is already installed.");
    }
  }
}

export function downloadRethSnapshot(rethDir, platform) {
  const snapshotDate = "2024-05-14";

  if (
    !fs.existsSync(
      path.join(installDir, "bgnode", "reth", "database", "db", "mdbx.dat")
    ) ||
    !fs.existsSync(
      path.join(installDir, "bgnode", "reth", "database", "blobstore")
    )
  ) {
    console.log("\nDownloading Reth snapshot.");
    if (platform === "darwin") {
      execSync(
        `cd "${rethDir}/database" && wget -O - https://downloads.merkle.io/reth-${snapshotDate}.tar.lz4 | lz4 -dc | tar -xvf -`,
        { stdio: "inherit" }
      );
    } else if (platform === "linux") {
      execSync(
        `cd "${rethDir}/database" && wget -O - https://downloads.merkle.io/reth-${snapshotDate}.tar.lz4 | tar -I lz4 -xvf -`,
        { stdio: "inherit" }
      );
    } else if (platform === "win32") {
      // TODO: Add code for downloading snapshot on windows
    }
  } else {
    console.log("\nReth snapshot already downloaded.");
  }
}
