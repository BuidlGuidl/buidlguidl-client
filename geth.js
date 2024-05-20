const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const jwtPath = path.join(os.homedir(), "bgnode", "jwt", "jwt.hex");

let gethCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  gethCommand = path.join(os.homedir(), "bgnode", "geth", "geth");
} else if (platform === "win32") {
  gethCommand = path.join(os.homedir(), "bgnode", "geth", "geth.exe");
}

const logFilePath = path.join(
  os.homedir(),
  "bgnode",
  "geth",
  "logs",
  `geth_${getFormattedDateTime()}.log`
);

execution = spawn(
  `${gethCommand}`,
  [
    "--mainnet",
    "--syncmode",
    "snap",
    "--http",
    "--http.api",
    "eth,net,engine,admin",
    "--http.addr",
    "0.0.0.0",
    "--datadir",
    path.join(os.homedir(), "bgnode", "geth", "database"),
    "--log.file",
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
  console.log(`geth process exited with code ${code}`);
});

function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/T/, "_").replace(/\..+/, "");
}
