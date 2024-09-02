import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";

let installDir = os.homedir();
let indexingPeerPort = 30303;

const argv = minimist(process.argv.slice(2));

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

if (argv.indexingpeerport) {
  indexingPeerPort = argv.indexingpeerport;
}

let indexingCommand;

const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  indexingCommand = path.join(installDir, "ethereum_clients", "trueBlocks", "trueblocks-node");
} else if (platform === "win32") {
  indexingCommand = path.join(installDir, "ethereum_clients", "trueBlocks", "trueblocks-node.exe");
}

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "trueBlocks",
  "logs",
  `indexing_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

export let trueBlocksDir = path.join(installDir, "ethereum_clients", "trueBlocks");
// TODO: I need the correct rpcProvider here
export let rpcProvider = `http://localhost:23456`;
const indexing = pty.spawn(
  `${indexingCommand}`,
  [],
  {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: { ...process.env, 
      TB_SETTINGS_INDEXPATH: path.join(trueBlocksDir, "database", "unchained"),
      TB_SETTINGS_CACHEPATH: path.join(trueBlocksDir, "database", "cache"),
      TB_CHAINS_MAINNET_SCRAPEROUTPUT: trueBlocksDir,
      TB_CHAINS_MAINNET_RPCPROVIDER: rpcProvider,
     },
  }
);
// debugToFile(`indexingCommand: ${indexingCommand}`, () => {});
// debugToFile(`trueBlocksDir: ${trueBlocksDir}`, () => {});
// debugToFile(`TB_SETTINGS_INDEXPATH: ${path.join(trueBlocksDir, "database", "unchained")}`, () => {});
// debugToFile(`TB_SETTINGS_CACHEPATH: ${path.join(trueBlocksDir, "database", "cache")}`, () => {});
// debugToFile(`TB_CHAINS_MAINNET_SCRAPEROUTPUT: ${trueBlocksDir}`, () => {});
// debugToFile(`TB_CHAINS_MAINNET_RPCPROVIDER: ${rpcProvider}`, () => {});

// Pipe stdout and stderr to the log file and to the parent process
indexing.on("data", (data) => {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data });
  }
});

indexing.on("exit", (code) => {
  // const exitMessage = `geth process exited with code ${code}`;
  // logStream.write(exitMessage);
  logStream.end();
});

indexing.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage }); // Send error message to parent process
  }
  debugToFile(`From reth.js: ${errorMessage}`, () => {});
});

process.on("SIGINT", () => {
  indexing.kill("SIGINT");
});
