const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const jwtPath = path.join(os.homedir(), "bgnode", "jwt", "jwt.hex");

let lighthouseCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  lighthouseCommand = path.join(
    os.homedir(),
    "bgnode",
    "lighthouse",
    "lighthouse"
  );
} else if (platform === "win32") {
  lighthouseCommand = path.join(
    os.homedir(),
    "bgnode",
    "lighthouse",
    "lighthouse.exe"
  );
}

const logFilePath = path.join(
  os.homedir(),
  "bgnode",
  "lighthouse",
  "logs",
  `lighthouse_${getFormattedDateTime()}.log`
);

const consensus = spawn(
  `${lighthouseCommand}`,
  [
    "bn",
    "--network",
    "mainnet",
    "--execution-endpoint",
    "http://localhost:8551",
    "--checkpoint-sync-url",
    "https://mainnet.checkpoint.sigp.io",
    "--checkpoint-sync-url-timeout",
    "600",
    "--disable-deposit-contract-sync",
    "--datadir",
    path.join(os.homedir(), "bgnode", "lighthouse", "database"),
    "--logfile",
    logFilePath,
    "--execution-jwt",
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
  console.log(`Lighthouse process exited with code ${code}`);
});

function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/T/, "_").replace(/\..+/, "");
}
