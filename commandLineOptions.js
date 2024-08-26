import fs from "fs";
import minimist from "minimist";
import { fileURLToPath } from "url";
import { dirname } from "path";

/// Set default command line option values
let executionClient = "reth";
let consensusClient = "lighthouse";

const filename = fileURLToPath(import.meta.url);
let installDir = dirname(filename);

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

// Process command-line arguments
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
    console.log("Invalid option for --executionclient. Use 'reth' or 'geth'.");
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

export { executionClient, consensusClient, installDir };
