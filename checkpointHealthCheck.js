import fs from "fs";
import path from "path";
import { debugToFile } from "./helpers.js";

// List of public checkpoint sync URLs
const CHECKPOINT_URLS = [
  "https://checkpointz.pietjepuk.net",
  "https://sync-mainnet.beaconcha.in",
  "https://beaconstate-mainnet.chainsafe.io",
  "https://mainnet-checkpoint-sync.stakely.io",
  "https://mainnet-checkpoint-sync.attestant.io",
  "https://beaconstate.ethstaker.cc",
  "https://mainnet.checkpoint.sigp.io",
  "https://beaconstate.info",
];

// Current Ethereum slot time (12 seconds per slot, 32 slots per epoch)
const SECONDS_PER_SLOT = 12;
const SLOTS_PER_EPOCH = 32;
const ETHEREUM_GENESIS_TIMESTAMP = 1606824023; // Dec 1, 2020

/**
 * Calculate the expected current slot number
 */
function getCurrentSlot() {
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(
    (now - ETHEREUM_GENESIS_TIMESTAMP) / SECONDS_PER_SLOT
  );
  return slot;
}

/**
 * Check health of a single checkpoint URL
 */
async function checkCheckpointHealth(url, timeout = 5000) {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Try to fetch the finalized checkpoint header
    const response = await fetch(`${url}/eth/v1/beacon/headers/finalized`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url,
        success: false,
        error: `HTTP ${response.status}`,
        responseTime: null,
        slot: null,
        slotAge: null,
      };
    }

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    // Extract slot number from the finalized checkpoint
    const slot = parseInt(data?.data?.header?.message?.slot || 0);
    const currentSlot = getCurrentSlot();
    const slotAge = currentSlot - slot;

    // Calculate freshness score (newer is better)
    const freshnessScore = Math.max(0, 100 - slotAge / 100);

    // Calculate response time score (faster is better)
    // 0ms = 100, 500ms = 75, 1000ms = 50, 2000ms = 0
    const responseTimeScore = Math.max(0, 100 - responseTime / 20);

    // Combined health score (40% response time, 60% freshness)
    const healthScore = responseTimeScore * 0.4 + freshnessScore * 0.6;

    return {
      url,
      success: true,
      responseTime,
      slot,
      slotAge,
      healthScore,
      error: null,
    };
  } catch (error) {
    return {
      url,
      success: false,
      error: error.name === "AbortError" ? "Timeout" : error.message,
      responseTime: null,
      slot: null,
      slotAge: null,
    };
  }
}

/**
 * Check if Lighthouse database exists
 */
function lighthouseDatabaseExists(installDir) {
  const beaconDbPath = path.join(
    installDir,
    "ethereum_clients",
    "lighthouse",
    "database",
    "beacon"
  );

  try {
    if (!fs.existsSync(beaconDbPath)) {
      return false;
    }

    const files = fs.readdirSync(beaconDbPath);
    return files.length > 0;
  } catch (error) {
    debugToFile(`Error checking Lighthouse database: ${error.message}`);
    return false;
  }
}

/**
 * Check if Prysm database exists
 */
function prysmDatabaseExists(installDir) {
  const beaconDbPath = path.join(
    installDir,
    "ethereum_clients",
    "prysm",
    "database",
    "beaconchaindata"
  );

  try {
    if (!fs.existsSync(beaconDbPath)) {
      return false;
    }

    const files = fs.readdirSync(beaconDbPath);
    return files.length > 0;
  } catch (error) {
    debugToFile(`Error checking Prysm database: ${error.message}`);
    return false;
  }
}

/**
 * Select the best checkpoint URL for Lighthouse
 * Returns null if database already exists (checkpoint sync not needed)
 * Returns user-provided URL if specified (no validation)
 * Otherwise, runs health checks and returns the best URL
 */
export async function selectCheckpointUrlForLighthouse(
  installDir,
  userProvidedUrl = null
) {
  console.log("\n🔍 Checking Lighthouse sync requirements...");

  // Check if database already exists
  const dbExists = lighthouseDatabaseExists(installDir);

  if (dbExists) {
    console.log("✅ Lighthouse database found - resuming from local state");
    console.log("   (checkpoint-sync-url not needed)\n");
    debugToFile("Lighthouse: Database exists, skipping checkpoint sync");
    return null; // Return null to indicate checkpoint sync not needed
  }

  console.log("📦 No existing database found - checkpoint sync required");

  // If user provided a checkpoint URL, use it without validation
  if (userProvidedUrl) {
    console.log(`✅ Using user-provided checkpoint URL: ${userProvidedUrl}`);
    console.log("   (skipping health checks per user request)\n");
    debugToFile(
      `Lighthouse: Using user-provided checkpoint URL: ${userProvidedUrl}`
    );
    return userProvidedUrl;
  }

  // Run health checks on all checkpoint URLs
  console.log(`\n🏥 Testing ${CHECKPOINT_URLS.length} checkpoint URLs...`);
  console.log("   (checking response time and data freshness)\n");

  const results = await Promise.all(
    CHECKPOINT_URLS.map((url) => checkCheckpointHealth(url))
  );

  // Filter successful results and sort by health score
  const successfulResults = results
    .filter((r) => r.success)
    .sort((a, b) => b.healthScore - a.healthScore);

  // Log results for user visibility
  results.forEach((result) => {
    if (result.success) {
      const urlDisplay = result.url.replace("https://", "");
      const responseDisplay = `${result.responseTime}ms`.padEnd(8);
      const slotAgeDisplay =
        result.slotAge < 100
          ? "✅ Current"
          : `⚠️  ${result.slotAge} slots behind`;
      console.log(
        `  ✓ ${urlDisplay.padEnd(45)} ${responseDisplay} ${slotAgeDisplay}`
      );
    } else {
      const urlDisplay = result.url.replace("https://", "");
      console.log(`  ✗ ${urlDisplay.padEnd(45)} ${result.error}`);
    }
  });

  if (successfulResults.length === 0) {
    console.log("\n❌ No checkpoint URLs are accessible!");
    console.log(
      "   Please check your internet connection or provide a custom URL with --consensuscheckpoint\n"
    );
    debugToFile("Lighthouse: No checkpoint URLs accessible");
    throw new Error("No accessible checkpoint URLs found");
  }

  const bestUrl = successfulResults[0];
  console.log(`\n🎯 Selected: ${bestUrl.url}`);
  console.log(
    `   Response time: ${
      bestUrl.responseTime
    }ms | Health score: ${bestUrl.healthScore.toFixed(1)}/100\n`
  );

  debugToFile(
    `Lighthouse: Selected checkpoint URL: ${
      bestUrl.url
    } (score: ${bestUrl.healthScore.toFixed(1)})`
  );

  return bestUrl.url;
}

/**
 * Select the best checkpoint URL for Prysm
 * Returns null if database already exists (checkpoint sync not needed)
 * Returns user-provided URL if specified (no validation)
 * Otherwise, runs health checks and returns the best URL
 */
export async function selectCheckpointUrlForPrysm(
  installDir,
  userProvidedUrl = null
) {
  console.log("\n🔍 Checking Prysm sync requirements...");

  // Check if database already exists
  const dbExists = prysmDatabaseExists(installDir);

  if (dbExists) {
    console.log("✅ Prysm database found - resuming from local state");
    console.log("   (checkpoint-sync-url not needed)\n");
    debugToFile("Prysm: Database exists, skipping checkpoint sync");
    return null; // Return null to indicate checkpoint sync not needed
  }

  console.log("📦 No existing database found - checkpoint sync required");

  // If user provided a checkpoint URL, use it without validation
  if (userProvidedUrl) {
    console.log(`✅ Using user-provided checkpoint URL: ${userProvidedUrl}`);
    console.log("   (skipping health checks per user request)\n");
    debugToFile(
      `Prysm: Using user-provided checkpoint URL: ${userProvidedUrl}`
    );
    return userProvidedUrl;
  }

  // Run health checks on all checkpoint URLs
  console.log(`\n🏥 Testing ${CHECKPOINT_URLS.length} checkpoint URLs...`);
  console.log("   (checking response time and data freshness)\n");

  const results = await Promise.all(
    CHECKPOINT_URLS.map((url) => checkCheckpointHealth(url))
  );

  // Filter successful results and sort by health score
  const successfulResults = results
    .filter((r) => r.success)
    .sort((a, b) => b.healthScore - a.healthScore);

  // Log results for user visibility
  results.forEach((result) => {
    if (result.success) {
      const urlDisplay = result.url.replace("https://", "");
      const responseDisplay = `${result.responseTime}ms`.padEnd(8);
      const slotAgeDisplay =
        result.slotAge < 100
          ? "✅ Current"
          : `⚠️  ${result.slotAge} slots behind`;
      console.log(
        `  ✓ ${urlDisplay.padEnd(45)} ${responseDisplay} ${slotAgeDisplay}`
      );
    } else {
      const urlDisplay = result.url.replace("https://", "");
      console.log(`  ✗ ${urlDisplay.padEnd(45)} ${result.error}`);
    }
  });

  if (successfulResults.length === 0) {
    console.log("\n❌ No checkpoint URLs are accessible!");
    console.log(
      "   Please check your internet connection or provide a custom URL with --consensuscheckpoint\n"
    );
    debugToFile("Prysm: No checkpoint URLs accessible");
    throw new Error("No accessible checkpoint URLs found");
  }

  const bestUrl = successfulResults[0];
  console.log(`\n🎯 Selected: ${bestUrl.url}`);
  console.log(
    `   Response time: ${
      bestUrl.responseTime
    }ms | Health score: ${bestUrl.healthScore.toFixed(1)}/100\n`
  );

  debugToFile(
    `Prysm: Selected checkpoint URL: ${
      bestUrl.url
    } (score: ${bestUrl.healthScore.toFixed(1)})`
  );

  return bestUrl.url;
}
