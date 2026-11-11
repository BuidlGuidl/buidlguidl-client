import fs from "fs";
import path from "path";
import { execFileSync, spawn } from "child_process";

// Geth v1.17.5 moved to pebble v2, which cannot open databases below
// FormatFlushableIngest. Such databases still work (Geth falls back to
// pebble v1 and logs "Pebble database uses legacy v1 format; upgrade offline
// with 'geth db pebble-upgrade'"), but the upgrade has to be run while Geth
// is stopped, so we do it here, right before starting Geth.

// First Geth release that ships `geth db pebble-upgrade`.
export const MIN_GETH_PEBBLE_UPGRADE_VER = "1.17.5";

// pebble FormatFlushableIngest: the minimum format pebble v2 supports and the
// target of `geth db pebble-upgrade`. The value is persisted on disk and is
// the same in pebble v1 and v2.
export const PEBBLE_FORMAT_MIN_V2 = 13;

// pebble FormatMostCompatible: databases written before pebble introduced the
// format-version marker file (old Geth never set a format version).
const PEBBLE_FORMAT_MOST_COMPATIBLE = 1;

// Matches pebble's atomicfs marker file name: marker.<name>.<iter>.<value>
const FORMAT_MARKER_RE = /^marker\.format-version\.(\d+)\.(\d*)$/;

/**
 * Reads the pebble format major version of a database from its files, without
 * opening it. Mirrors pebble's lookupFormatMajorVersion.
 *
 * Returns null when there is no pebble database in the directory (missing,
 * empty, or LevelDB).
 */
export function readPebbleFormatVersion(chaindataDir) {
  let entries;
  try {
    entries = fs.readdirSync(chaindataDir);
  } catch {
    return null;
  }

  // Same test Geth uses (rawdb.PreexistingDatabase): a database exists if
  // there is a CURRENT file, and it is pebble if there is an OPTIONS-* file.
  if (!entries.includes("CURRENT")) return null;
  if (!entries.some((name) => name.startsWith("OPTIONS-"))) return null;

  // Stale markers can linger after a crash. Pebble uses the highest iteration.
  let best = null;
  for (const name of entries) {
    const m = name.match(FORMAT_MARKER_RE);
    if (!m) continue;
    const iter = Number(m[1]);
    if (best === null || iter > best.iter) best = { iter, value: m[2] };
  }

  if (best === null || best.value === "") return PEBBLE_FORMAT_MOST_COMPATIBLE;
  const version = Number(best.value);
  return Number.isInteger(version) ? version : null;
}

export function compareVersions(v1, v2) {
  const a = v1.split(".").map(Number);
  const b = v2.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
}

/** Returns the installed Geth version (e.g. "1.17.10"), or null. */
export function getGethVersion(gethCommand) {
  try {
    const out = execFileSync(gethCommand, ["--version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const m = out.match(/geth version (\d+\.\d+\.\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Decides whether `geth db pebble-upgrade` should run before Geth starts.
 * Returns { upgrade: boolean, reason: string, format, gethVersion }.
 */
export function checkPebbleUpgrade(gethCommand, datadir) {
  const chaindataDir = path.join(datadir, "geth", "chaindata");
  const format = readPebbleFormatVersion(chaindataDir);

  if (format === null) {
    return { upgrade: false, reason: "no existing pebble database", format };
  }
  if (format >= PEBBLE_FORMAT_MIN_V2) {
    return {
      upgrade: false,
      reason: `pebble format ${format} is already v2-compatible`,
      format,
    };
  }

  const gethVersion = getGethVersion(gethCommand);
  if (!gethVersion) {
    return {
      upgrade: false,
      reason: "could not determine installed Geth version",
      format,
    };
  }
  if (compareVersions(gethVersion, MIN_GETH_PEBBLE_UPGRADE_VER) < 0) {
    return {
      upgrade: false,
      reason: `Geth ${gethVersion} predates pebble-upgrade (needs >= ${MIN_GETH_PEBBLE_UPGRADE_VER})`,
      format,
      gethVersion,
    };
  }

  return {
    upgrade: true,
    reason: `pebble format ${format} < ${PEBBLE_FORMAT_MIN_V2}`,
    format,
    gethVersion,
  };
}

/**
 * Runs `geth db pebble-upgrade` and resolves with its exit code (-1 if it
 * could not be started). `onData` receives the command's output (Geth logs to
 * stderr). `onSpawn` receives the child process so the caller can forward
 * signals to it.
 */
export function runPebbleUpgrade(gethCommand, datadir, { onData, onSpawn } = {}) {
  return new Promise((resolve) => {
    const proc = spawn(
      gethCommand,
      ["db", "pebble-upgrade", "--mainnet", "--datadir", datadir],
      { cwd: process.env.HOME, env: process.env, stdio: ["ignore", "pipe", "pipe"] }
    );
    onSpawn?.(proc);
    proc.stdout.on("data", (data) => onData?.(data.toString()));
    proc.stderr.on("data", (data) => onData?.(data.toString()));
    proc.on("error", (err) => {
      onData?.(`Failed to run pebble upgrade: ${err.message}\n`);
      resolve(-1);
    });
    proc.on("close", (code, signal) => resolve(code ?? (signal ? -1 : 0)));
  });
}
