import fs from "fs";
import minimist from "minimist";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { debugToFile } from "./helpers.js";

/// Set default command line option values
let executionClient = "reth";
let consensusClient = "lighthouse";
let executionPeerPort = null;

const filename = fileURLToPath(import.meta.url);
let installDir = dirname(filename);

const optionsFilePath = join(installDir, "options.json");

function showHelp() {
  console.log("");
  console.log(
    "  -e, --executionclient <client>  Specify the execution client ('reth' or 'geth')"
  );
  console.log(
    "  -c, --consensusclient <client>  Specify the consensus client ('lighthouse' or 'prysm')"
  );
  console.log(
    "  -ep, --executionpeerport <port> Specify the execution peer port (must be a number)"
  );
  console.log(
    "  -d, --directory <path>          Specify ethereum client executable, database, and logs directory (defaults to buidlguidl-client/ethereum_clients)"
  );
  console.log(
    "  -h, --help                      Display this help message and exit"
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

// Preprocess arguments to handle "-ep" as an alias for "--executionpeerport"
const args = process.argv
  .slice(2)
  .flatMap((arg) => (arg === "-ep" ? "--executionpeerport" : arg));

// If options were not loaded from the file, process command-line arguments
if (!optionsLoaded) {
  const argv = minimist(args, {
    string: [
      "e",
      "executionclient",
      "c",
      "consensusclient",
      "executionpeerport",
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

  // Save the options to a file after processing command-line arguments
  // saveOptionsToFile();
}

export {
  executionClient,
  consensusClient,
  executionPeerPort,
  installDir,
  saveOptionsToFile,
  deleteOptionsFile,
};
