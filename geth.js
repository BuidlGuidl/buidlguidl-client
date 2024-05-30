const { spawn } = require("child_process");
const fs = require("fs");
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

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

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
    // "--log.file",
    // logFilePath,
    "--authrpc.jwtsecret",
    `${jwtPath}`,
  ],
  { shell: true }
);

// Pipe stdout and stderr to the log file
execution.stdout.pipe(logStream);
execution.stderr.pipe(logStream);

// Also print stdout and stderr to the terminal
execution.stdout.pipe(process.stdout);
execution.stderr.pipe(process.stderr);

execution.stdout.on("data", (data) => {
  console.log(data.toString());
});

execution.stderr.on("data", (data) => {
  console.error(data.toString());
});

execution.on("close", (code) => {
  console.log(`geth process exited with code ${code}`);
  logStream.end();
});

function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/T/, "_").replace(/\..+/, "");
}