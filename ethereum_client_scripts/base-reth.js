import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";

let installDir = os.homedir();

const argv = minimist(process.argv.slice(2));

const executionPeerPort = argv.executionpeerport;
const executionType = argv.executiontype;

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

// Base L2 uses different ports to avoid conflicts with L1 clients
const BASE_PORT_OFFSET = 1000;
const baseRpcPort = 8545 + BASE_PORT_OFFSET; // 9545
const baseAuthRpcPort = 8551 + BASE_PORT_OFFSET; // 9551
const baseMetricsPort = 9001 + BASE_PORT_OFFSET; // 10001
const baseWsPort = 8546 + BASE_PORT_OFFSET; // 9546

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");
const dataDir = path.join(
  installDir,
  "ethereum_clients",
  "base-reth",
  "database"
);
const logsDir = path.join(installDir, "ethereum_clients", "base-reth", "logs");

// Create directories if they don't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Ensure proper permissions for database directory
try {
  execSync(`chmod 755 "${dataDir}"`, { stdio: "ignore" });
} catch (error) {
  // Ignore permission errors, they might not be necessary on all systems
}

const logFilePath = path.join(
  logsDir,
  `base-reth_${getFormattedDateTime()}.log`
);
const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Get L1 endpoints from command line or environment
const l1RpcEndpoint = argv.l1rpc || process.env.BASE_L1_RPC;
const l1BeaconEndpoint = argv.l1beacon || process.env.BASE_L1_BEACON;

debugToFile(`Base Reth: Using L1 RPC endpoint: ${l1RpcEndpoint}`);
debugToFile(`Base Reth: Using L1 Beacon endpoint: ${l1BeaconEndpoint}`);

// Check if Docker is available
function checkDockerAvailable() {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch (error) {
    console.error(
      "❌ Docker is not available. Please install Docker to use Base clients."
    );
    process.exit(1);
  }
}

// Pull Base container image if not present
function ensureBaseImage() {
  const imageName = "ghcr.io/paradigmxyz/op-reth:latest";
  console.log(`📦 Checking for Base Reth container image...`);

  // Detect system architecture
  const arch = os.arch();
  const isAppleSilicon = arch === "arm64" && os.platform() === "darwin";
  const platform = isAppleSilicon ? "linux/arm64" : "linux/amd64";

  console.log(
    `🏗️  Detected architecture: ${arch}, using platform: ${platform}`
  );

  try {
    // Check if image exists locally
    execSync(`docker image inspect ${imageName}`, { stdio: "ignore" });
    console.log(`✅ Base Reth image already available`);
  } catch (error) {
    console.log(
      `📥 Pulling Base Reth container image: ${imageName} (${platform})`
    );
    execSync(`docker pull --platform=${platform} ${imageName}`, {
      stdio: "inherit",
    });
    console.log(`✅ Base Reth image pulled successfully`);
  }
}

checkDockerAvailable();
ensureBaseImage();

// Container name with timestamp to avoid conflicts
const containerName = `base-reth-bg-${Date.now()}`;

// Create named Docker volume for data persistence to avoid macOS file system issues
const volumeName = `base-reth-data-${containerName}`;

// Detect system architecture for Docker platform
const arch = os.arch();
const isAppleSilicon = arch === "arm64" && os.platform() === "darwin";
const platform = isAppleSilicon ? "linux/arm64" : "linux/amd64";

console.log(`📊 Using Docker volume '${volumeName}' for database storage`);
console.log(`🏗️  Running container with platform: ${platform}`);
if (isAppleSilicon) {
  console.log(
    `✨ Using native ARM64 image for optimal performance on Apple Silicon`
  );
  console.log(
    `🚀 This eliminates MDBX emulation issues and provides better performance`
  );
} else {
  console.log(
    `💡 Using named volumes and MDBX configuration for compatibility`
  );
}

const dockerArgs = [
  "run",
  "--rm",
  "-it",
  `--platform=${platform}`,
  "--tmpfs",
  "/tmp:rw,noexec,nosuid,size=1g",
  "--name",
  containerName,

  // Use named volume for reliable data persistence across all platforms
  "-v",
  `${volumeName}:/data`,
  "-v",
  `${jwtPath}:/jwt.hex:ro`,

  // Port mappings
  "-p",
  `${baseRpcPort}:8545`,
  "-p",
  `${baseAuthRpcPort}:8551`,
  "-p",
  `${baseMetricsPort}:9001`,
  "-p",
  `${baseWsPort}:8546`,
  "-p",
  `${executionPeerPort + BASE_PORT_OFFSET}:30303`, // P2P port

  // Environment variables for Base L2
  "-e",
  `OP_NODE_L1_ETH_RPC=${l1RpcEndpoint}`,
  "-e",
  `OP_NODE_L1_BEACON=${l1BeaconEndpoint}`,
  "-e",
  "OP_NODE_NETWORK=base-mainnet",
  "-e",
  "RETH_CHAIN=base",
  "-e",
  `OP_NODE_L2_ENGINE_RPC=ws://host.docker.internal:${baseAuthRpcPort}`,
  "-e",
  "OP_NODE_L2_ENGINE_AUTH=/jwt.hex",
  // MDBX configuration (only needed for x86_64 emulation on macOS)
  ...(platform === "linux/amd64" && os.platform() === "darwin"
    ? [
        "-e",
        "MDBX_DISABLE_VALIDATION=1",
        "-e",
        "MDBX_ENABLE_REFUND_TABLE=0",
        "-e",
        "MDBX_DISABLE_PAGECHECKS=1",
        "-e",
        "MDBX_ENABLE_GEOMETRY_JITTER=0",
      ]
    : []),

  // Base image - using op-reth instead
  "ghcr.io/paradigmxyz/op-reth:latest",

  // Command for op-reth
  "node",
  "--full",
  "--chain",
  "base",
  "--datadir",
  "/data",
  "--db.exclusive",
  "true",
  "--rollup.sequencer",
  "https://mainnet-sequencer.base.org",
  "--rollup.disable-tx-pool-gossip",
  "--port",
  "30303",
  "--discovery.port",
  "30303",
  "--enable-discv5-discovery",
  "--discovery.v5.addr",
  "0.0.0.0",
  "--discovery.v5.port",
  "30304",
  "--http",
  "--http.addr",
  "0.0.0.0",
  "--http.port",
  "8545",
  "--http.corsdomain",
  "*",
  "--http.api",
  "web3,debug,eth,net",
  "--ws",
  "--ws.addr",
  "0.0.0.0",
  "--ws.port",
  "8546",
  "--ws.origins",
  "*",
  "--ws.api",
  "web3,debug,eth,net",
  "--authrpc.jwtsecret",
  "/jwt.hex",
  "--authrpc.addr",
  "0.0.0.0",
  "--authrpc.port",
  "8551",
  "--metrics",
  "0.0.0.0:9001",
];

debugToFile(`Base Reth: Starting container with name: ${containerName}`);
debugToFile(`Base Reth: Docker args: ${dockerArgs.join(" ")}`);

const execution = pty.spawn("docker", dockerArgs, {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: { ...process.env, INSTALL_DIR: installDir },
});

// Pipe stdout and stderr to the log file and to the parent process
execution.on("data", (data) => {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data });
  }
});

execution.on("exit", (code) => {
  debugToFile(`Base Reth: Container exited with code ${code}`);
  logStream.end();

  // Clean up container if it still exists
  try {
    execSync(`docker rm -f ${containerName}`, { stdio: "ignore" });
  } catch (error) {
    // Container already removed, ignore
  }

  // Clean up the named volume (optional - removes all data)
  // Comment out the lines below if you want to preserve data between runs
  try {
    execSync(`docker volume rm ${volumeName}`, { stdio: "ignore" });
    debugToFile(`Base Reth: Cleaned up volume ${volumeName}`);
  } catch (error) {
    // Volume might not exist or be in use, ignore
  }
});

execution.on("error", (err) => {
  const errorMessage = `Base Reth Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage });
  }
  debugToFile(`From base-reth.js: ${errorMessage}`);
});

// Handle cleanup on process signals
process.on("SIGINT", () => {
  debugToFile(
    `Base Reth: Received SIGINT, stopping container ${containerName}`
  );
  try {
    execSync(`docker stop ${containerName}`, { stdio: "ignore" });
  } catch (error) {
    // Container might already be stopped
  }

  // Clean up the volume
  try {
    execSync(`docker volume rm ${volumeName}`, { stdio: "ignore" });
    debugToFile(`Base Reth: Cleaned up volume ${volumeName}`);
  } catch (error) {
    // Volume might not exist or be in use, ignore
  }

  execution.kill("SIGINT");
});

process.on("SIGTERM", () => {
  debugToFile(
    `Base Reth: Received SIGTERM, stopping container ${containerName}`
  );
  try {
    execSync(`docker stop ${containerName}`, { stdio: "ignore" });
  } catch (error) {
    // Container might already be stopped
  }

  // Clean up the volume
  try {
    execSync(`docker volume rm ${volumeName}`, { stdio: "ignore" });
    debugToFile(`Base Reth: Cleaned up volume ${volumeName}`);
  } catch (error) {
    // Volume might not exist or be in use, ignore
  }

  execution.kill("SIGTERM");
});
