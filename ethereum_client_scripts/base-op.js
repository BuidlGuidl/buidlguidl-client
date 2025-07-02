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

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

// Base L2 uses different ports to avoid conflicts with L1 clients
const BASE_PORT_OFFSET = 1000;
const baseOpRpcPort = 8547 + BASE_PORT_OFFSET; // 9547
const baseOpMetricsPort = 7300 + BASE_PORT_OFFSET; // 8300
const baseOpP2pPort = 9222 + BASE_PORT_OFFSET; // 10222

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");
const dataDir = path.join(
  installDir,
  "ethereum_clients",
  "base-op",
  "database"
);
const logsDir = path.join(installDir, "ethereum_clients", "base-op", "logs");

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

const logFilePath = path.join(logsDir, `base-op_${getFormattedDateTime()}.log`);
const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Get L1 endpoints from command line or environment
const l1RpcEndpoint = argv.l1rpc || process.env.BASE_L1_RPC;
const l1BeaconEndpoint = argv.l1beacon || process.env.BASE_L1_BEACON;

debugToFile(`Base OP: Using L1 RPC endpoint: ${l1RpcEndpoint}`);
debugToFile(`Base OP: Using L1 Beacon endpoint: ${l1BeaconEndpoint}`);

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

// Pull Base OP container image if not present
function ensureBaseOpImage() {
  const imageName =
    "us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:v1.7.7";
  console.log(`📦 Checking for Base OP container image...`);

  // Note: op-node binary is x86_64, so we need to use amd64 platform for proper emulation
  const platform = "linux/amd64";

  try {
    // Check if image exists locally
    execSync(`docker image inspect ${imageName}`, { stdio: "ignore" });
    console.log(`✅ Base OP image already available`);
  } catch (error) {
    console.log(`📥 Pulling Base OP container image: ${imageName}`);
    console.log(`🏗️  Using platform: ${platform}`);
    execSync(`docker pull --platform=${platform} ${imageName}`, {
      stdio: "inherit",
    });
    console.log(`✅ Base OP image pulled successfully`);
  }
}

checkDockerAvailable();
ensureBaseOpImage();

// Container name with timestamp to avoid conflicts
const containerName = `base-op-bg-${Date.now()}`;

// Detect system architecture for Docker platform
const arch = os.arch();
const isAppleSilicon = arch === "arm64" && os.platform() === "darwin";
// Note: op-node binary is x86_64, so we need to use amd64 platform for proper emulation
const platform = "linux/amd64";

console.log(`🏗️  Running container with platform: ${platform}`);
if (isAppleSilicon) {
  console.log(`⚠️  op-node binary requires x86_64 emulation on Apple Silicon`);
  console.log(`🔧 Using optimized emulation settings for compatibility`);
} else {
  console.log(`💡 Using native AMD64 platform`);
}

const dockerArgs = [
  "run",
  "--rm",
  "-it",
  `--platform=${platform}`,
  // Add tmpfs for better emulation performance on Apple Silicon
  ...(isAppleSilicon ? ["--tmpfs", "/tmp:rw,noexec,nosuid,size=512m"] : []),
  "--name",
  containerName,

  // Volume mounts with compatibility flags for macOS
  "-v",
  `${dataDir}:/data:rw,delegated`,
  "-v",
  `${jwtPath}:/jwt.hex:ro`,

  // Port mappings
  "-p",
  `${baseOpRpcPort}:8547`,
  "-p",
  `${baseOpMetricsPort}:7300`,
  "-p",
  `${baseOpP2pPort}:9222`,

  // Base OP image
  "us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:v1.7.7",

  // Command-line arguments for op-node
  "op-node",
  "--l1",
  `${l1RpcEndpoint}`,
  "--l1.beacon",
  `${l1BeaconEndpoint}`,
  "--network",
  "base-mainnet",
  "--l2",
  `http://host.docker.internal:${8551 + BASE_PORT_OFFSET}`,
  "--l2.jwt-secret",
  "/jwt.hex",
  "--sequencer.l1-confs",
  "3",
  "--verifier.l1-confs",
  "3",
  "--rpc.addr",
  "0.0.0.0",
  "--rpc.port",
  "8547",
  "--rpc.enable-admin",
  "--metrics.enabled",
  "--metrics.addr",
  "0.0.0.0",
  "--metrics.port",
  "7300",
  "--p2p.listen.ip",
  "0.0.0.0",
  "--p2p.listen.tcp",
  "9222",
  "--p2p.listen.udp",
  "9222",
  "--l1.trustrpc",
];

debugToFile(`Base OP: Starting container with name: ${containerName}`);
debugToFile(`Base OP: Docker args: ${dockerArgs.join(" ")}`);

const consensus = pty.spawn("docker", dockerArgs, {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: { ...process.env, INSTALL_DIR: installDir },
});

// Pipe stdout and stderr to the log file and to the parent process
consensus.on("data", (data) => {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data });
  }
});

consensus.on("exit", (code) => {
  debugToFile(`Base OP: Container exited with code ${code}`);
  logStream.end();

  // Clean up container if it still exists
  try {
    execSync(`docker rm -f ${containerName}`, { stdio: "ignore" });
  } catch (error) {
    // Container already removed, ignore
  }
});

consensus.on("error", (err) => {
  const errorMessage = `Base OP Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage });
  }
  debugToFile(`From base-op.js: ${errorMessage}`);
});

// Handle cleanup on process signals
process.on("SIGINT", () => {
  debugToFile(`Base OP: Received SIGINT, stopping container ${containerName}`);
  try {
    execSync(`docker stop ${containerName}`, { stdio: "ignore" });
  } catch (error) {
    // Container might already be stopped
  }
  consensus.kill("SIGINT");
});

process.on("SIGTERM", () => {
  debugToFile(`Base OP: Received SIGTERM, stopping container ${containerName}`);
  try {
    execSync(`docker stop ${containerName}`, { stdio: "ignore" });
  } catch (error) {
    // Container might already be stopped
  }
  consensus.kill("SIGTERM");
});
