import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";
import { getExecutionIpcPath } from "./executionIpc.js";
import { checkPebbleUpgrade, runPebbleUpgrade } from "./gethPebbleUpgrade.js";

let installDir = os.homedir();

const argv = minimist(process.argv.slice(2));

const executionPeerPort = argv.executionpeerport;

const executionType = argv.executiontype;
// Opt-in (--debug-trace): adds debug to the public API list.
const rpcApi = argv.debugtrace ? "eth,net,web3,debug" : "eth,net,web3";
debugToFile(`From geth.js: executionType: ${executionType}`);

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");

let gethCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  gethCommand = path.join(installDir, "ethereum_clients", "geth", "geth");
} else if (platform === "win32") {
  gethCommand = path.join(installDir, "ethereum_clients", "geth", "geth.exe");
}

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "geth",
  "logs",
  `geth_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

const datadir = path.join(installDir, "ethereum_clients", "geth", "database");

function writeLog(data) {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data });
  }
}

// Whichever process is running (pebble upgrade, then Geth) gets the SIGINT.
let currentProcess = null;
let shuttingDown = false;
process.on("SIGINT", () => {
  shuttingDown = true;
  if (currentProcess) currentProcess.kill("SIGINT");
});

// Upgrade a legacy pebble v1 database before starting Geth. This has to run
// while Geth is stopped. If it fails, Geth still opens the database in
// legacy mode, so we log the failure and start anyway.
const pebbleCheck = checkPebbleUpgrade(gethCommand, datadir);
debugToFile(
  `From geth.js: pebble upgrade check: ${pebbleCheck.reason} (upgrade=${pebbleCheck.upgrade})`
);
if (pebbleCheck.upgrade) {
  writeLog(
    `Upgrading legacy Geth pebble database (format ${pebbleCheck.format}) for Geth ${pebbleCheck.gethVersion}. This may take a few minutes...\n`
  );
  const code = await runPebbleUpgrade(gethCommand, datadir, {
    onData: writeLog,
    onSpawn: (proc) => {
      currentProcess = proc;
    },
  });
  currentProcess = null;
  if (code === 0) {
    writeLog("Geth pebble database upgrade complete.\n");
  } else {
    writeLog(
      `Geth pebble database upgrade failed (exit code ${code}); starting Geth with the legacy database.\n`
    );
    debugToFile(`From geth.js: pebble upgrade failed with exit code ${code}`);
  }
}

if (shuttingDown) {
  logStream.end();
  process.exit(0);
}

const execution = pty.spawn(
  gethCommand,
  [
    "--mainnet",
    "--syncmode",
    // "snap",
    ...(executionType === "full"
      ? ["snap"]
      : executionType === "archive"
      ? ["full", "--gcmode", "archive"]
      : []),
    "--port",
    executionPeerPort,
    "--discovery.port",
    executionPeerPort,
    "--http",
    // HTTP and WebSocket share 8545 (Interfold ciphernodes need both on one
    // port) with the same API list. `admin` stays off the network; the client
    // uses it over IPC (--ipcpath). `engine` is served only on the
    // JWT-protected auth port.
    "--http.api",
    rpcApi,
    "--http.addr",
    "0.0.0.0",
    "--http.port",
    "8545",
    "--http.corsdomain",
    "*",
    "--datadir",
    datadir,
    "--authrpc.jwtsecret",
    jwtPath,
    "--metrics",
    "--metrics.addr",
    "127.0.0.1",
    "--ws",
    "--ws.api",
    rpcApi,
    "--ws.origins",
    "*",
    "--ws.addr",
    "0.0.0.0",
    "--ws.port",
    "8545",
    "--ipcpath",
    getExecutionIpcPath("geth", installDir),
  ],
  {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: { ...process.env, INSTALL_DIR: installDir },
  }
);

currentProcess = execution;

// Pipe stdout and stderr to the log file and to the parent process
execution.on("data", writeLog);

execution.on("exit", (code) => {
  // const exitMessage = `geth process exited with code ${code}`;
  // logStream.write(exitMessage);
  logStream.end();
});

execution.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage }); // Send error message to parent process
  }
  debugToFile(`From geth.js: ${errorMessage}`);
});
