const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const jwtPath = path.join(os.homedir(), "bgnode", "jwt", "jwt.hex");

let prysmCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  prysmCommand = path.join(os.homedir(), "bgnode", "prysm", "prysm.sh");
} else if (platform === "win32") {
  prysmCommand = path.join(os.homedir(), "bgnode", "prysm", "prysm.exe");
}

const logFilePath = path.join(
  os.homedir(),
  "bgnode",
  "prysm",
  "logs",
  `prysm_${getFormattedDateTime()}.log`
);

consensus = spawn(
  `${prysmCommand}`,
  [
    "beacon-chain",
    "--mainnet",
    "--execution-endpoint",
    "http://localhost:8551",
    "--grpc-gateway-host=0.0.0.0",
    "--grpc-gateway-port=3500",
    "--checkpoint-sync-url=https://mainnet-checkpoint-sync.attestant.io/",
    "--genesis-beacon-api-url=https://mainnet-checkpoint-sync.attestant.io/",
    `--datadir=${path.join(os.homedir(), "bgnode", "prysm", "database")}`,
    `--log-file=${logFilePath}`,
    "--accept-terms-of-use=true",
    "--jwt-secret",
    `${jwtPath}`,
  ],
  { shell: true }
);

consensus.stdout.on("data", (data) => {
  console.log(data.toString());
});

consensus.stderr.on("data", (data) => {
  console.error(data.toString());
});

consensus.on("close", (code) => {
  console.log(`prysm process exited with code ${code}`);
});

function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/T/, "_").replace(/\..+/, "");
}
