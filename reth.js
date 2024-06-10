const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const jwtPath = path.join(os.homedir(), "bgnode", "jwt", "jwt.hex");

let rethCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  rethCommand = path.join(os.homedir(), "bgnode", "reth", "reth");
} else if (platform === "win32") {
  rethCommand = path.join(os.homedir(), "bgnode", "reth", "reth.exe");
}

const logFilePath = path.join(
  os.homedir(),
  "bgnode",
  "reth",
  "logs",
  `reth_${getFormattedDateTime()}.log`
);

const execution = spawn(
  `${rethCommand}`,
  [
    "node",
    "--http",
    "--http.addr",
    "0.0.0.0",
    "--http.api",
    // "trace,web3,eth,debug",
    // "trace,web3,eth,debug,net",
    "debug,eth,net,trace,txpool,web3,rpc",
    "--ws",
    "--ws.api",
    "trace,web3,eth,debug",
    "--authrpc.addr",
    "127.0.0.1",
    "--authrpc.port",
    "8551",
    "--datadir",
    path.join(os.homedir(), "bgnode", "reth", "database"),
    "--log.file.directory",
    logFilePath,
    "--authrpc.jwtsecret",
    `${jwtPath}`,
  ],
  { shell: true }
);

execution.stdout.on("data", (data) => {
  console.log(data.toString());
});

execution.stderr.on("data", (data) => {
  console.error(data.toString());
});

execution.on("close", (code) => {
  console.log(`Reth process exited with code ${code}`);
});

function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/T/, "_").replace(/\..+/, "");
}
