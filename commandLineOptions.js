import fs from "fs";
import minimist from "minimist";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { debugToFile } from "./helpers.js";

/// Set default command line option values
let executionClient = "reth";
let consensusClient = "lighthouse";

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

// If options were not loaded from the file, process command-line arguments
if (!optionsLoaded) {
  const argv = minimist(process.argv.slice(2), {
    string: ["e", "executionclient", "c", "consensusclient", "d", "directory"],
    boolean: ["h", "help"],
    alias: {
      e: "executionclient",
      c: "consensusclient",
      d: "directory",
      h: "help",
    },
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
        "Invalid option for --executionclient. Use 'reth' or 'geth'."
      );
      process.exit(1);
    }
  }

  if (argv.consensusclient) {
    consensusClient = argv.consensusclient;
    if (consensusClient !== "lighthouse" && consensusClient !== "prysm") {
      console.log(
        "Invalid option for --consensusclient. Use 'lighthouse' or 'prysm'."
      );
      process.exit(1);
    }
  }

  if (argv.directory) {
    installDir = argv.directory;
    if (!isValidPath(installDir)) {
      console.log(
        `Invalid option for --directory. '${installDir}' is not a valid path.`
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
  installDir,
  saveOptionsToFile,
  deleteOptionsFile,
};
