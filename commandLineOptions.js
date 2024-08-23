import os from "os";
import fs from "fs";
import minimist from "minimist";

/// Set default command line option values
let executionClient = "reth";
let consensusClient = "lighthouse";
let installDir = os.homedir();

function showHelp() {
  console.log("");
  console.log("Options:");
  console.log("  -e <client>  Specify the execution client ('reth' or 'geth')");
  console.log(
    "  -c <client>  Specify the consensus client ('lighthouse or 'prysm')"
  );
  // console.log("  -d <path>    Specify the install directory (defaults to ~)");
  console.log("  -h           Display this help message and exit");
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
const argv = minimist(process.argv.slice(2));

if (argv.e) {
  executionClient = argv.e;
  if (executionClient !== "reth" && executionClient !== "geth") {
    console.log("Invalid option for -e. Use 'reth' or 'geth'.");
    process.exit(1);
  }
}

if (argv.c) {
  consensusClient = argv.c;
  if (consensusClient !== "lighthouse" && consensusClient !== "prysm") {
    console.log("Invalid option for -c. Use 'lighthouse' or 'prysm'.");
    process.exit(1);
  }
}

if (argv.d) {
  installDir = argv.d;
  if (!isValidPath(installDir)) {
    console.log(`Invalid option for -d. '${installDir}' is not a valid path.`);
    process.exit(1);
  }
}

if (argv.h) {
  showHelp();
  process.exit(0);
}

export { executionClient, consensusClient, installDir };
