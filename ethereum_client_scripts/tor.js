// --tor: serve this node's RPC as a Tor onion service.
//
//   Tor (.onion, port 80) -> torRpcFilter.js (127.0.0.1:8547) -> node (127.0.0.1:8545)
//
// Traffic never goes through a BuidlGuidl server and never leaves the Tor
// network. Callers don't learn this machine's IP; this node doesn't learn
// theirs. No port forwarding needed: the onion service only dials out.
//
// Tor comes from the Tor Project's "expert bundle" (a standalone tor binary),
// checked against the sha256 pinned below. Everything lives in
// <installDir>/ethereum_clients/tor. The onion address is derived from the key
// in tor/hs/ — keep that folder to keep the address.

import fs from "fs";
import os from "os";
import path from "path";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import { debugToFile } from "../helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const torVersion = "16.0.1"; // Tor Browser release; ships tor 0.4.9.16
const TOR_SHA256 = {
  "linux-x86_64": "7039cb16060ab22e669852e55774d894b55f25ea8bd0ab7194d3478429a58725",
  "linux-aarch64": "67040520d44c87ccaaf5aa7df0dc1ff122eb938dbb600ae7722e8b6b75282a4b",
  "macos-x86_64": "15464d99adc3bb4de1308260d79878336b04a1ac1aeff83e10f192de7d235946",
  "macos-aarch64": "0b7d022017c31e3f972d06465bcd7ac50feb66ac825547419a934914fe4bb156",
};

export const TOR_FILTER_PORT = 8547;
const RESTART_DELAY_MS = 5000;

const children = {};
let stopping = false;

export function torDir(installDir) {
  return path.join(installDir, "ethereum_clients", "tor");
}

function bundleTarget() {
  const osName = { linux: "linux", darwin: "macos" }[os.platform()];
  const arch = { x64: "x86_64", arm64: "aarch64" }[os.arch()];
  if (!osName || !arch) throw new Error(`no Tor bundle for ${os.platform()}/${os.arch()}`);
  return `${osName}-${arch}`;
}

function torBinary(dir) {
  return path.join(dir, "bin", "tor", "tor");
}

function sha256(file) {
  const cmd =
    os.platform() === "darwin" ? `shasum -a 256 "${file}"` : `sha256sum "${file}"`;
  return execSync(cmd).toString().trim().split(/\s+/)[0];
}

export function installTor(installDir) {
  const dir = torDir(installDir);
  const versionFile = path.join(dir, "bin", "VERSION");
  if (
    fs.existsSync(torBinary(dir)) &&
    fs.existsSync(versionFile) &&
    fs.readFileSync(versionFile, "utf8").trim() === torVersion
  ) {
    console.log("tor is already installed.");
    return;
  }

  const target = bundleTarget();
  const fileName = `tor-expert-bundle-${target}-${torVersion}.tar.gz`;
  const url = `https://dist.torproject.org/torbrowser/${torVersion}/${fileName}`;
  const binDir = path.join(dir, "bin");

  console.log(`\nInstalling tor ${torVersion}.`);
  fs.rmSync(binDir, { recursive: true, force: true });
  fs.mkdirSync(binDir, { recursive: true });
  execSync(`cd "${binDir}" && curl -fL -O -# ${url}`, { stdio: "inherit" });

  const got = sha256(path.join(binDir, fileName));
  if (got !== TOR_SHA256[target]) {
    fs.rmSync(binDir, { recursive: true, force: true });
    throw new Error(`tor download checksum mismatch (got ${got})`);
  }
  execSync(`cd "${binDir}" && tar -xzf "${fileName}" && rm "${fileName}"`, {
    stdio: "inherit",
  });
  // The macOS bundle's ad-hoc signature doesn't verify, so macOS kills tor on
  // launch. The bytes were checked against the pinned sha256 above; re-sign
  // them ad-hoc so they run.
  if (os.platform() === "darwin") {
    const torBin = path.dirname(torBinary(dir));
    execSync(`codesign --force --sign - "${torBin}/tor" "${torBin}"/*.dylib`, { stdio: "ignore" });
  }
  fs.writeFileSync(versionFile, torVersion);
}

function writeTorrc(dir) {
  for (const sub of ["data", "hs", "logs"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.join(dir, sub), 0o700); // tor refuses group/world-readable dirs
  }
  const torrc = [
    "SocksPort 0", // no client proxy: this tor only hosts the onion service
    `DataDirectory ${path.join(dir, "data")}`,
    `HiddenServiceDir ${path.join(dir, "hs")}`,
    `HiddenServicePort 80 127.0.0.1:${TOR_FILTER_PORT}`,
    "HiddenServicePoWDefensesEnabled 1", // proof-of-work spam protection
    `Log notice file ${path.join(dir, "logs", "tor.log")}`,
    "",
  ].join("\n");
  const file = path.join(dir, "torrc");
  fs.writeFileSync(file, torrc);
  return file;
}

// If the client was killed hard last time, its tor and filter may still be
// running and holding the port and the onion key. Stop them first. Only kills
// a pid whose command line still points into our tor folder.
function stopLeftovers(dir) {
  const file = path.join(dir, "pids.json");
  let pids = [];
  try {
    pids = Object.values(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return;
  }
  for (const pid of pids) {
    try {
      const cmd = execSync(`ps -p ${Number(pid)} -o command=`).toString();
      if (cmd.includes(dir)) {
        process.kill(Number(pid), "SIGTERM");
        debugToFile(`tor: stopped leftover process ${pid}`);
      }
    } catch {} // not running
  }
  try {
    execSync("sleep 1");
  } catch {}
}

function savePids(dir) {
  const pids = Object.fromEntries(Object.entries(children).map(([k, c]) => [k, c.pid]));
  try {
    fs.writeFileSync(path.join(dir, "pids.json"), JSON.stringify(pids));
  } catch {}
}

// Starts a child and restarts it if it dies, until stopTor().
function keepRunning(name, command, args, options, logFile, dir) {
  const start = () => {
    if (stopping) return;
    const log = fs.openSync(logFile, "a");
    const child = spawn(command, args, { ...options, stdio: ["ignore", log, log] });
    fs.closeSync(log);
    children[name] = child;
    savePids(dir);
    child.on("exit", (code, signal) => {
      delete children[name];
      if (stopping) return;
      debugToFile(`tor: ${name} exited (${code ?? signal}); restarting`);
      setTimeout(start, RESTART_DELAY_MS);
    });
    child.on("error", (err) => debugToFile(`tor: ${name} error: ${err.message}`));
  };
  start();
}

export function startTor(installDir) {
  const dir = torDir(installDir);
  stopLeftovers(dir);
  const torrc = writeTorrc(dir);
  const logs = path.join(dir, "logs");

  keepRunning(
    "filter",
    process.execPath,
    [
      path.join(__dirname, "torRpcFilter.js"),
      "--port",
      String(TOR_FILTER_PORT),
      "--upstream",
      "http://127.0.0.1:8545",
      "--datadir",
      dir,
    ],
    { cwd: dir },
    path.join(logs, "filter.log"),
    dir
  );

  const torBinDir = path.dirname(torBinary(dir));
  keepRunning(
    "tor",
    torBinary(dir),
    ["-f", torrc],
    {
      cwd: dir,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: torBinDir, // linux bundle ships its own libevent/openssl
        DYLD_LIBRARY_PATH: torBinDir,
      },
    },
    path.join(logs, "tor-stdout.log"),
    dir
  );
}

// Tor writes the address within a second or two of starting.
export async function waitForOnionAddress(installDir, timeoutMs = 15000) {
  const file = path.join(torDir(installDir), "hs", "hostname");
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

export function stopTor() {
  stopping = true;
  for (const child of Object.values(children)) {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}
