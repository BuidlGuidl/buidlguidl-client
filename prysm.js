const { spawn } = require("child_process");
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

const consensus = spawn(
  `"${prysmCommand}"`,
  [
    "beacon-chain",
    "--mainnet",
    "--execution-endpoint",
    "http://localhost:8551",
    "--grpc-gateway-host=0.0.0.0",
    "--grpc-gateway-port=3500",
    "--checkpoint-sync-url=https://mainnet-checkpoint-sync.attestant.io/",
    "--genesis-beacon-api-url=https://mainnet-checkpoint-sync.attestant.io/",
    `--datadir="${path.join(installDir, "bgnode", "prysm", "database")}"`,
    // `--log-file="${logFilePath}"`,
    "--accept-terms-of-use=true",
    "--jwt-secret",
    `"${jwtPath}"`,
  ],
  { shell: true }
);

// Pipe stdout and stderr to the log file
consensus.stdout.pipe(logStream);
consensus.stderr.pipe(logStream);

// Also print stdout and stderr to the terminal
// consensus.stdout.pipe(process.stdout);
// consensus.stderr.pipe(process.stderr);

consensus.stdout.on("data", (data) => {
  console.log(data.toString());
});

consensus.stderr.on("data", (data) => {
  console.error(data.toString());
});

consensus.on("close", (code) => {
  console.log(`prysm process exited with code ${code}`);
  logStream.end();
});

function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/T/, "_").replace(/\..+/, "");
}
