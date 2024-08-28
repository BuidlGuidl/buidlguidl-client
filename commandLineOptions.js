import fs from "fs";
import minimist from "minimist";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { debugToFile } from "./helpers.js";

/// Set default command line option values
let executionClient = "reth";
let consensusClient = "lighthouse";
let executionPeerPort = null;
let consensusPeerPorts = [null, null];

const filename = fileURLToPath(import.meta.url);
let installDir = dirname(filename);

const optionsFilePath = join(installDir, "options.json");

function showHelp() {
  console.log("");
  console.log(
    "  -e, --executionclient <client>            Specify the execution client ('reth' or 'geth')"
  );
  console.log("                                            Default: reth\n");
  console.log(
    "  -c, --consensusclient <client>            Specify the consensus client ('lighthouse' or 'prysm')"
  );
  console.log(
    "                                            Default: lighthouse\n"
  );
  console.log(
    "  -ep, --executionpeerport <port>           Specify the execution peer port (must be a number)"
  );
  console.log("                                            Default: 30303\n");
  console.log(
    "  -cp, --consensuspeerports <port>,<port>   Specify the execution peer ports (must be two comma-separated numbers)"
  );
  console.log(
    "                                            lighthouse defaults: 9000,9001. prysm defaults: 12000,13000\n"
  );
  console.log(
    "  -d, --directory <path>                    Specify ethereum client executable, database, and logs directory"
  );
  console.log(
    "                                            Default: buidlguidl-client/ethereum_clients\n"
  );
  console.log(
    "  -h, --help                                Display this help message and exit"
  );
  console.log("");
}

function isValidPath(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch (err) {
    return false;
  }
}

// Function to save options to a file
function saveOptionsToFile() {
  const options = {
    executionClient,
    consensusClient,
    executionPeerPort,
    consensusPeerPorts,
    installDir,
  };
  fs.writeFileSync(optionsFilePath, JSON.stringify(options), "utf8");
}

// Function to load options from a file
function loadOptionsFromFile() {
  if (fs.existsSync(optionsFilePath)) {
    const options = JSON.parse(fs.readFileSync(optionsFilePath, "utf8"));
    return options;
  } else {
    debugToFile(`loadOptionsFromFile(): Options file not found`, () => {});
  }
}

// Check if the options file already exists
let optionsLoaded = false;
if (fs.existsSync(optionsFilePath)) {
  try {
    const options = loadOptionsFromFile();
    executionClient = options.executionClient;
    consensusClient = options.consensusClient;
    executionPeerPort = options.executionPeerPort;
    consensusPeerPorts = options.consensusPeerPorts;
    installDir = options.installDir;
    optionsLoaded = true;
  } catch (error) {
    debugToFile(`Failed to load options from file: ${error}`, () => {});
  }
}

function deleteOptionsFile() {
  try {
    if (fs.existsSync(optionsFilePath)) {
      fs.unlinkSync(optionsFilePath);
    }
  } catch (error) {
    debugToFile(`deleteOptionsFile(): ${error}`, () => {});
  }
}

// Preprocess arguments to handle "-ep" and "-cp" as aliases
const args = process.argv.slice(2).flatMap((arg) => {
  if (arg === "-ep") {
    return "--executionpeerport";
  } else if (arg === "-cp") {
    return "--consensuspeerports";
  }
  return arg;
});

// If options were not loaded from the file, process command-line arguments
if (!optionsLoaded) {
  const argv = minimist(args, {
    string: [
      "e",
      "executionclient",
      "c",
      "consensusclient",
      "executionpeerport",
      "consensuspeerports",
      "d",
      "directory",
    ],
    alias: {
      e: "executionclient",
      c: "consensusclient",
      d: "directory",
      h: "help",
    },
    boolean: ["h", "help"],
    unknown: (option) => {
      console.log(`Invalid option: ${option}`);
      showHelp();
      process.exit(1);
    },
  });

  if (argv.executionclient) {
    executionClient = argv.executionclient;
    if (executionClient !== "reth" && executionClient !== "geth") {
      console.log(
        "Invalid option for --executionclient (-e). Use 'reth' or 'geth'."
      );
      process.exit(1);
    }
  }

  if (argv.consensusclient) {
    consensusClient = argv.consensusclient;
    if (consensusClient !== "lighthouse" && consensusClient !== "prysm") {
      console.log(
        "Invalid option for --consensusclient (-c). Use 'lighthouse' or 'prysm'."
      );
      process.exit(1);
    }
  }

  if (argv.executionpeerport) {
    executionPeerPort = parseInt(argv.executionpeerport, 10);
    if (executionPeerPort === "number" && !isNaN(executionPeerPort)) {
      console.log(
        "Invalid option for --executionpeerport (-ep). Must be a number."
      );
      process.exit(1);
    }
  }

  if (argv.consensuspeerports) {
    consensusPeerPorts = argv.consensuspeerports
      .split(",")
      .map((port) => parseInt(port.trim(), 10));

    // Check if there are exactly two ports and if both are valid numbers
    if (consensusPeerPorts.length !== 2 || consensusPeerPorts.some(isNaN)) {
      console.log(
        "Invalid option for --consensuspeerports (-cp). Must be two comma-separated numbers (e.g., 9000,9001)."
      );
      process.exit(1);
    }
  }

  console.log(
    `Consensus peer ports: ${consensusPeerPorts[0]}, ${consensusPeerPorts[1]}`
  );
  // process.exit(0);

  if (argv.directory) {
    installDir = argv.directory;
    if (!isValidPath(installDir)) {
      console.log(
        `Invalid option for --directory (-d). '${installDir}' is not a valid path.`
      );
      process.exit(1);
    }
  }

  if (argv.help) {
    showHelp();
    process.exit(0);
  }
}

export {
  executionClient,
  consensusClient,
  executionPeerPort,
  consensusPeerPorts,
  installDir,
  saveOptionsToFile,
  deleteOptionsFile,
};
