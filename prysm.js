const pty = require("node-pty");
const fs = require("fs");
const path = require("path");
const os = require("os");

const installDir = process.env.INSTALL_DIR || os.homedir();

const jwtPath = path.join(installDir, "bgnode", "jwt", "jwt.hex");

let prysmCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  prysmCommand = path.join(installDir, "bgnode", "prysm", "prysm.sh");
} else if (platform === "win32") {
  prysmCommand = path.join(installDir, "bgnode", "prysm", "prysm.exe");
}

const logFilePath = path.join(
  installDir,
  "bgnode",
  "prysm",
  "logs",
  `prysm_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

function stripAnsiCodes(input) {
  return input.replace(
    /[\u001b\u009b][[()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nq-uy=><~])/g,
    ""
  );
}

const consensus = pty.spawn(
  prysmCommand,
  [
    "beacon-chain",
    "--mainnet",
    "--execution-endpoint",
    "http://localhost:8551",
    "--grpc-gateway-host=0.0.0.0",
    "--grpc-gateway-port=3500",
    "--checkpoint-sync-url=https://mainnet-checkpoint-sync.attestant.io/",
    "--genesis-beacon-api-url=https://mainnet-checkpoint-sync.attestant.io/",
    "--datadir",
    path.join(installDir, "bgnode", "prysm", "database"),
    "--accept-terms-of-use=true",
    "--jwt-secret",
    jwtPath,
  ],
  {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: { ...process.env, INSTALL_DIR: installDir },
  }
);

// Pipe stdout and stderr to the log file and to the parent process
consensus.on("data", (data) => {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data }); // No need for .toString(), pty preserves colors
  }
  process.stdout.write(data); // Also log to console for real-time feedback
});

consensus.on("exit", (code) => {
  const exitMessage = `prysm process exited with code ${code}`;
  logStream.write(exitMessage);
  logStream.end();
  if (process.send) {
    process.send({ log: exitMessage }); // Send exit code to parent process
  }
  console.log(exitMessage); // Log exit message to console
});

consensus.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage }); // Send error message to parent process
  }
  console.error(errorMessage); // Log error message to console
});

function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/T/, "_").replace(/\..+/, "");
}
