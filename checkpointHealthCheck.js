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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Based on testing, /eth/v2/beacon/blocks/finalized works on ALL checkpoint servers
    // Try primary endpoint first, then fallback to version check
    let response = null;
    let lastError = null;

    // Try primary endpoint: /eth/v2/beacon/blocks/finalized
    try {
      response = await fetch(`${url}/eth/v2/beacon/blocks/finalized`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;

        // If primary fails, try fallback: /eth/v1/node/version
        try {
          response = await fetch(`${url}/eth/v1/node/version`, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });

          if (!response.ok) {
            lastError = `HTTP ${response.status}`;
            response = null;
          }
        } catch (err) {
          lastError = err.message;
          response = null;
        }
      }
    } catch (err) {
      lastError = err.message;

      // Try fallback on primary error
      try {
        response = await fetch(`${url}/eth/v1/node/version`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          response = null;
        }
      } catch (fallbackErr) {
        lastError = fallbackErr.message;
        response = null;
      }
    }

    clearTimeout(timeoutId);

    if (!response) {
      return {
        url,
        success: false,
        error: lastError || "Connection failed",
        responseTime: null,
        slot: null,
        slotAge: null,
      };
    }

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    // Extract slot number from /eth/v2/beacon/blocks/finalized response
    // Slot is at data.message.slot based on test results
    const slot = parseInt(data?.data?.message?.slot) || null;

    // If we got slot data, calculate slot age
    if (slot) {
      const currentSlot = getCurrentSlot();
      const slotAge = currentSlot - slot;

      return {
        url,
        success: true,
        responseTime,
        slot,
        slotAge,
        error: null,
      };
    }

    // No slot data (version endpoint fallback)
    return {
      url,
      success: true,
      responseTime,
      slot: null,
      slotAge: null,
      error: null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
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
 * Supports custom install directories provided via --directory flag
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
 * Supports custom install directories provided via --directory flag
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
  console.log("   (selecting fastest server with current data)\n");

  const results = await Promise.all(
    CHECKPOINT_URLS.map((url) => checkCheckpointHealth(url))
  );

  // Filter successful results
  const successfulResults = results.filter((r) => r.success);

  // Log results for user visibility
  results.forEach((result) => {
    if (result.success) {
      const urlDisplay = result.url.replace("https://", "");
      const responseDisplay = `${result.responseTime}ms`.padEnd(8);
      const slotAgeDisplay =
        result.slotAge === null
          ? "✅ Online"
          : result.slotAge === 0
          ? "✅ Current"
          : result.slotAge < 100
          ? `⚠️  ${result.slotAge} slots behind`
          : `❌ ${result.slotAge} slots behind`;
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

  // Step 1: Filter for current URLs (0 slots behind or very close)
  let currentUrls = successfulResults.filter(
    (r) => r.slotAge !== null && r.slotAge <= 5
  );

  // Step 2: Sort by response time (fastest first)
  if (currentUrls.length > 0) {
    currentUrls.sort((a, b) => a.responseTime - b.responseTime);
    const bestUrl = currentUrls[0];

    console.log(`\n🎯 Selected: ${bestUrl.url}`);
    console.log(
      `   Response time: ${bestUrl.responseTime}ms | Slot age: ${bestUrl.slotAge} slots\n`
    );

    debugToFile(
      `Lighthouse: Selected checkpoint URL: ${bestUrl.url} (${bestUrl.responseTime}ms, ${bestUrl.slotAge} slots behind)`
    );

    return bestUrl.url;
  }

  // Fallback: No perfectly current URLs, use fastest available
  successfulResults.sort((a, b) => a.responseTime - b.responseTime);
  const bestUrl = successfulResults[0];

  console.log(`\n⚠️  No fully synced checkpoint URLs found`);
  console.log(`🎯 Selected fastest available: ${bestUrl.url}`);
  console.log(
    `   Response time: ${bestUrl.responseTime}ms${
      bestUrl.slotAge !== null ? ` | ${bestUrl.slotAge} slots behind` : ""
    }\n`
  );

  debugToFile(
    `Lighthouse: Selected checkpoint URL (fallback): ${bestUrl.url} (${
      bestUrl.responseTime
    }ms${bestUrl.slotAge !== null ? `, ${bestUrl.slotAge} slots behind` : ""})`
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
  console.log("   (selecting fastest server with current data)\n");

  const results = await Promise.all(
    CHECKPOINT_URLS.map((url) => checkCheckpointHealth(url))
  );

  // Filter successful results
  const successfulResults = results.filter((r) => r.success);

  // Log results for user visibility
  results.forEach((result) => {
    if (result.success) {
      const urlDisplay = result.url.replace("https://", "");
      const responseDisplay = `${result.responseTime}ms`.padEnd(8);
      const slotAgeDisplay =
        result.slotAge === null
          ? "✅ Online"
          : result.slotAge === 0
          ? "✅ Current"
          : result.slotAge < 100
          ? `⚠️  ${result.slotAge} slots behind`
          : `❌ ${result.slotAge} slots behind`;
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

  // Step 1: Filter for current URLs (0 slots behind or very close)
  let currentUrls = successfulResults.filter(
    (r) => r.slotAge !== null && r.slotAge <= 5
  );

  // Step 2: Sort by response time (fastest first)
  if (currentUrls.length > 0) {
    currentUrls.sort((a, b) => a.responseTime - b.responseTime);
    const bestUrl = currentUrls[0];

    console.log(`\n🎯 Selected: ${bestUrl.url}`);
    console.log(
      `   Response time: ${bestUrl.responseTime}ms | Slot age: ${bestUrl.slotAge} slots\n`
    );

    debugToFile(
      `Prysm: Selected checkpoint URL: ${bestUrl.url} (${bestUrl.responseTime}ms, ${bestUrl.slotAge} slots behind)`
    );

    return bestUrl.url;
  }

  // Fallback: No perfectly current URLs, use fastest available
  successfulResults.sort((a, b) => a.responseTime - b.responseTime);
  const bestUrl = successfulResults[0];

  console.log(`\n⚠️  No fully synced checkpoint URLs found`);
  console.log(`🎯 Selected fastest available: ${bestUrl.url}`);
  console.log(
    `   Response time: ${bestUrl.responseTime}ms${
      bestUrl.slotAge !== null ? ` | ${bestUrl.slotAge} slots behind` : ""
    }\n`
  );

  debugToFile(
    `Prysm: Selected checkpoint URL (fallback): ${bestUrl.url} (${
      bestUrl.responseTime
    }ms${bestUrl.slotAge !== null ? `, ${bestUrl.slotAge} slots behind` : ""})`
  );

  return bestUrl.url;
}
