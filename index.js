const { exec, execSync, spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const si = require("systeminformation");

const blessed = require("blessed");
const contrib = require("blessed-contrib");

// Set default values
let executionClient = "geth";
let consensusClient = "prysm";

// Function to display usage information
function showHelp() {
  console.log("Usage: node script.js [options]");
  console.log("");
  console.log("Options:");
  console.log("  -e <client>  Specify the execution client ('geth' or 'reth')");
  console.log(
    "  -c <client>  Specify the consensus client ('prysm' or 'lighthouse')"
  );
  console.log("  -h           Display this help message and exit");
  console.log("");
}

// Function to add color to console output
function color(code, text) {
  // Usage: color "31;5" "string"
  // Some valid values for color:
  // - 5 blink, 1 strong, 4 underlined
  // - fg: 31 red,  32 green, 33 yellow, 34 blue, 35 purple, 36 cyan, 37 white
  // - bg: 40 black, 41 red, 44 blue, 45 purple
  console.log(`\x1b[${code}m${text}\x1b[0m`);
}

// Process command-line arguments
const args = process.argv.slice(2);
args.forEach((val, index) => {
  switch (val) {
    case "-e":
      executionClient = args[index + 1];
      if (!["geth", "reth"].includes(executionClient)) {
        color("31", "Invalid option for -e. Use 'geth' or 'reth'.");
        process.exit(1);
      }
      break;
    case "-c":
      consensusClient = args[index + 1];
      if (!["prysm", "lighthouse"].includes(consensusClient)) {
        color("31", "Invalid option for -c. Use 'prysm' or 'lighthouse'.");
        process.exit(1);
      }
      break;
    case "-h":
      showHelp();
      process.exit(0);
      break;
  }
});

function checkMacLinuxPrereqs(platform) {
  // All these are required to be installed for linux: node, npm, yarn
  // TODO: Figure out best way to: npm install -g blessed blessed-contrib

  if (platform === "linux") {
    try {
      execSync(`command -v curl`, { stdio: "ignore" });
      const version = execSync(`curl --version`).toString().trim();
      color("36", `\nCurl is already installed. Version:\n${version}`);
    } catch {
      color("1", `\nPlease install Curl by running this command:`);
      color("1", `sudo apt-get install curl`);
      process.exit(0);
    }
  }

  // Git will have to already be installed by now
  // try {
  //   execSync(`command -v git`, { stdio: "ignore" });
  //   const version = execSync(`git --version`).toString().trim();
  //   color("36", `git is already installed. Version:\n${version}`);
  // } catch {
  //   console.log(`Please install git by running this command:`);
  //   if (platform === "linux") {
  //     color("4", `sudo apt-get install git`);
  //   } else {
  //     color("4", `sudo apt-get install git`);
  //   }
  //   process.exit(0);
  // }

  try {
    execSync(`command -v brew`, { stdio: "ignore" });
    const version = execSync(`brew -v`).toString().trim();
    color("36", `\nHomebrew is already installed. Version:\n${version}`);
  } catch {
    color(
      "1",
      `\nPlease install Homebrew (https://brew.sh/). Make sure to follow "next steps" instructions shown after install!`
    );
    process.exit(0);
  }

  try {
    execSync(`command -v openssl`, { stdio: "ignore" });
    const version = execSync(`openssl -v`).toString().trim();
    color("36", `\nopenssl is already installed. Version:\n${version}`);
  } catch {
    console.log(`\nInstalling openssl.`);
    execSync("brew install openssl", { stdio: "inherit" });
  }
  // execSync(`npm install -g blessed blessed-contrib`, { stdio: "inherit" });
}

function checkWindowsPrereqs() {
  try {
    const version = execSync(`choco -v`).toString().trim();
    color("36", `\nChocolatey is already installed. Version:\n${version}`);
  } catch {
    color(
      "1",
      `\nPlease install Chocolatey (https://community.chocolatey.org/).`
    );
    process.exit(0);
  }

  try {
    const version = execSync(`openssl -v`).toString().trim();
    color("36", `\nOpenssl is already installed. Version:\n${version}`);
  } catch {
    color("1", `\nPlease install openssl`);
    color(
      "1",
      `Open Command Prompt as Administrator and run 'choco install openssl'`
    );
    process.exit(0);
  }

  // try {
  //   const output = execSync("git --version", { encoding: "utf-8" }); // ensures the output is a string
  //   console.log("Git is installed:", output);
  // } catch (error) {
  //   console.error("Please install Git (https://git-scm.com/downloads).");
  //   process.exit(0);
  // }
}

function createJwtSecret(jwtDir) {
  if (!fs.existsSync(jwtDir)) {
    console.log(`Creating '${jwtDir}'`);
    fs.mkdirSync(jwtDir, { recursive: true });
  }

  if (!fs.existsSync(`${jwtDir}/jwt.hex`)) {
    execSync(`cd ${jwtDir} && openssl rand -hex 32 > jwt.hex`, {
      stdio: "inherit",
    });
  }
}

function installMacLinuxExecutionClient(executionClient) {
  try {
    execSync(`command -v ${executionClient}`, { stdio: "ignore" });
    const version = execSync(`${executionClient} --version`).toString().trim();
    color(
      "36",
      `${executionClient} is already installed. Version:\n${version}`
    );
  } catch {
    console.log(`Installing ${executionClient}.`);
    if (executionClient === "geth") {
      execSync("brew tap ethereum/ethereum", { stdio: "inherit" });
      execSync("brew install ethereum", { stdio: "inherit" });
    } else if (executionClient === "reth") {
      execSync("brew install paradigmxyz/brew/reth", { stdio: "inherit" });
    }
  }
}

function installWindowsExecutionClient(executionClient) {
  if (executionClient === "geth") {
    const gethDir = path.join(os.homedir(), "bgnode", "geth");
    const gethScript = path.join(gethDir, "geth.exe");
    if (!fs.existsSync(gethScript)) {
      console.log("Installing Geth.");
      if (!fs.existsSync(gethDir)) {
        console.log(`Creating '${gethDir}'`);
        fs.mkdirSync(gethDir, { recursive: true });
      }
      execSync(
        `cd ${gethDir} && curl https://gethstore.blob.core.windows.net/builds/geth-windows-amd64-1.14.0-87246f3c.zip --output geth.zip`,
        { stdio: "inherit" }
      );
      execSync(`cd ${gethDir} && tar -xf ${gethDir}/geth.zip`, {
        stdio: "inherit",
      });
      execSync(
        `cd ${gethDir}/geth-windows-amd64-1.14.0-87246f3c && move geth.exe .. `,
        { stdio: "inherit" }
      );
      execSync(
        `cd ${gethDir} && del geth.zip && rd /S /Q geth-windows-amd64-1.14.0-87246f3c`,
        { stdio: "inherit" }
      );
    } else {
      color("36", "Geth is already installed.");
    }
  } else if (executionClient === "reth") {
    const rethDir = path.join(os.homedir(), "bgnode", "reth");
    const rethScript = path.join(rethDir, "reth.exe");
    if (!fs.existsSync(rethScript)) {
      console.log("Installing Reth.");
      if (!fs.existsSync(rethDir)) {
        console.log(`Creating '${rethDir}'`);
        fs.mkdirSync(rethDir, { recursive: true });
      }
      execSync(
        `cd ${rethDir} && curl -LO https://github.com/paradigmxyz/reth/releases/download/v0.2.0-beta.6/reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        { stdio: "inherit" }
      );
      execSync(
        `cd ${rethDir} && tar -xzf ${rethDir}/reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd ${rethDir} && del reth-v0.2.0-beta.6-x86_64-pc-windows-gnu.tar.gz`,
        { stdio: "inherit" }
      );
    } else {
      color("36", "Reth is already installed.");
    }
  }
}

function installMacLinuxConsensusClient(consensusClient) {
  if (consensusClient === "prysm") {
    const prysmDir = path.join(os.homedir(), "bgnode", "prysm");
    const prysmScript = path.join(prysmDir, "prysm.sh");
    if (!fs.existsSync(prysmScript)) {
      console.log("Installing Prysm.");
      if (!fs.existsSync(prysmDir)) {
        console.log(`Creating '${prysmDir}'`);
        fs.mkdirSync(prysmDir, { recursive: true });
      }
      execSync(
        `curl https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.sh --output ${prysmScript}`
      );
      execSync(`chmod +x ${prysmScript}`);
    } else {
      color("36", "Prysm is already installed.");
    }
  } else if (consensusClient === "lighthouse") {
    try {
      execSync("command -v lighthouse", { stdio: "ignore" });
      const version = execSync("lighthouse --version").toString().trim();
      color("36", `Lighthouse is already installed. Version:\n${version}`);
    } catch {
      console.log("Installing Lighthouse.");
      execSync("brew install lighthouse", { stdio: "inherit" });
    }
  }
}

function installWindowsConsensusClient(consensusClient) {
  if (consensusClient === "prysm") {
    const prysmDir = path.join(os.homedir(), "bgnode", "prysm");
    const prysmScript = path.join(prysmDir, "prysm.bat");
    if (!fs.existsSync(prysmScript)) {
      console.log("Installing Prysm.");
      if (!fs.existsSync(prysmDir)) {
        console.log(`Creating '${prysmDir}'`);
        fs.mkdirSync(prysmDir, { recursive: true });
      }
      execSync(
        `cd ${prysmDir} && curl https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.bat --output prysm.bat`,
        { stdio: "inherit" }
      );
      execSync(
        "reg add HKCU\\Console /v VirtualTerminalLevel /t REG_DWORD /d 1",
        { stdio: "inherit" }
      );
      // console.log("Creating JWT secret.");
      // execSync(`cd ${prysmDir} && prysm.bat beacon-chain generate-auth-secret`, { stdio: "inherit" });
      // fs.renameSync(path.join(prysmDir, "jwt.hex"), path.join(jwtDir, "jwt.hex"));
    } else {
      color("36", "Prysm is already installed.");
    }
  } else if (consensusClient === "lighthouse") {
    const lighthouseDir = path.join(os.homedir(), "bgnode", "lighthouse");
    const lighthouseScript = path.join(lighthouseDir, "lighthouse.exe");
    if (!fs.existsSync(lighthouseScript)) {
      console.log("Installing Lighthouse.");
      if (!fs.existsSync(lighthouseDir)) {
        console.log(`Creating '${lighthouseDir}'`);
        fs.mkdirSync(lighthouseDir, { recursive: true });
      }
      execSync(
        `cd ${lighthouseDir} && curl -LO https://github.com/sigp/lighthouse/releases/download/v5.1.3/lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        { stdio: "inherit" }
      );
      execSync(
        `cd ${lighthouseDir} && tar -xzf ${lighthouseDir}/lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        {
          stdio: "inherit",
        }
      );
      execSync(
        `cd ${lighthouseDir} && del lighthouse-v5.1.3-x86_64-windows.tar.gz`,
        { stdio: "inherit" }
      );
    } else {
      color("36", "Lighthouse is already installed.");
    }
  }
}

function startChain(executionClient, consensusClient, jwtDir, platform) {
  jwtPath = path.join(jwtDir, "jwt.hex");
  // Create a screen object
  const screen = blessed.screen();

  // Create two log boxes
  const executionLog = contrib.log({
    fg: "green",
    selectedFg: "green",
    label: "Geth Logs",
    top: "0%",
    height: "50%",
    width: "100%",
  });

  const consensusLog = contrib.log({
    fg: "yellow",
    selectedFg: "yellow",
    label: "Prysm Logs",
    top: "50%",
    height: "50%",
    width: "100%",
  });

  screen.append(executionLog);
  screen.append(consensusLog);
  screen.render();

  let execution;
  if (executionClient === "geth") {
    let gethCommand;
    if (["darwin", "linux"].includes(platform)) {
      gethCommand = "geth";
    } else if (platform === "win32") {
      gethCommand = path.join(os.homedir(), "bgnode", "geth", "geth.exe");
    }
    execution = spawn(
      `${gethCommand}`,
      [
        "--mainnet",
        "--http",
        "--http.api",
        "eth,net,engine,admin",
        "--http.addr",
        "0.0.0.0",
        "--syncmode",
        "full",
        "--authrpc.jwtsecret",
        `${jwtPath}`,
      ],
      { shell: true }
    );
  } else if (executionClient === "reth") {
    let rethCommand;
    if (["darwin", "linux"].includes(platform)) {
      rethCommand = "reth";
    } else if (platform === "win32") {
      rethCommand = path.join(os.homedir(), "bgnode", "reth", "reth.exe");
    }
    execution = spawn(
      `${rethCommand}`,
      [
        "node",
        "--full",
        "--http",
        "--authrpc.addr",
        "127.0.0.1",
        "--authrpc.port",
        "8551",
        "--authrpc.jwtsecret",
        `${jwtPath}`,
      ],
      { shell: true }
    );
  }

  execution.stdout.on("data", (data) => {
    executionLog.log(data.toString());
  });

  execution.stderr.on("data", (data) => {
    executionLog.log(data.toString());
  });

  let consensus;
  if (consensusClient === "prysm") {
    let prysmCommand;
    if (["darwin", "linux"].includes(platform)) {
      prysmCommand = path.join(os.homedir(), "bgnode", "prysm", "prysm.sh");
    } else if (platform === "win32") {
      prysmCommand = path.join(os.homedir(), "bgnode", "prysm", "prysm.bat");
    }
    consensus = spawn(
      `${prysmCommand}`,
      [
        "beacon-chain",
        "--execution-endpoint",
        "http://localhost:8551",
        "--mainnet",
        "--jwt-secret",
        `${jwtPath}`,
      ],
      { shell: true }
    );
  } else if (consensusClient === "lighthouse") {
    let lighthouseCommand;
    if (["darwin", "linux"].includes(platform)) {
      lighthouseCommand = "lighthouse";
    } else if (platform === "win32") {
      lighthouseCommand = path.join(
        os.homedir(),
        "bgnode",
        "lighthouse",
        "lighthouse.exe"
      );
    }
    consensus = spawn(
      `${lighthouseCommand}`,
      [
        "bn",
        "--network",
        "mainnet",
        "--execution-endpoint",
        "http://localhost:8551",
        "--execution-jwt",
        `${jwtPath}`,
        "--checkpoint-sync-url",
        "https://mainnet.checkpoint.sigp.io",
        "--disable-deposit-contract-sync",
      ],
      { shell: true }
    );
  }

  consensus.stdout.on("data", (data) => {
    consensusLog.log(data.toString());
  });

  consensus.stderr.on("data", (data) => {
    consensusLog.log(data.toString());
  });

  // Handle close
  execution.on("close", (code) => {
    executionLog.log(`Geth process exited with code ${code}`);
  });

  consensus.on("close", (code) => {
    consensusLog.log(`Prysm process exited with code ${code}`);
  });

  // Quit on Escape, q, or Control-C.
  screen.key(["escape", "q", "C-c"], function (ch, key) {
    if (["darwin", "linux"].includes(platform)) {
      if (executionClient === "geth") {
        execSync("pkill -SIGINT geth", { stdio: "ignore" });
      } else if (executionClient === "reth") {
        execSync("pkill -SIGINT reth", { stdio: "ignore" });
      }

      if (consensusClient === "lighthouse") {
        execSync("pkill -SIGINT lighthouse", { stdio: "ignore" });
      }
    } else if (platform === "win32") {
      if (executionClient === "geth") {
        execSync(`powershell -Command "Get-Process geth | Stop-Process"`);
      } else if (executionClient === "reth") {
        execSync(`powershell -Command "Get-Process reth | Stop-Process"`);
      }

      if (consensusClient === "prysm") {
        execSync(
          `powershell -Command "Get-Process beacon-chain* | Stop-Process"`
        );
      } else if (consensusClient === "lighthouse") {
        execSync(
          `powershell -Command "Get-Process beacon-chain* | Stop-Process"`
        );
      }
    }

    return process.exit(0);
  });

  screen.render();
}

console.log(`Execution client selected: ${executionClient}`);
console.log(`Consensus client selected: ${consensusClient}\n`);

const jwtDir = path.join(os.homedir(), "bgnode", "jwt");
createJwtSecret(jwtDir);

const platform = os.platform();

if (["darwin", "linux"].includes(platform)) {
  checkMacLinuxPrereqs(platform);
  installMacLinuxExecutionClient(executionClient);
  installMacLinuxConsensusClient(consensusClient);
} else if (platform === "win32") {
  checkWindowsPrereqs();
  installWindowsExecutionClient(executionClient);
  installWindowsConsensusClient(consensusClient);
}

startChain(executionClient, consensusClient, jwtDir, platform);
