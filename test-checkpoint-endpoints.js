import fetch from "node-fetch";

// List of checkpoint sync URLs to test
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

// Common Beacon API endpoints to test
const ENDPOINTS = [
  // Headers endpoints
  "/eth/v1/beacon/headers/finalized",
  "/eth/v2/beacon/headers/finalized",

  // Block endpoints
  "/eth/v1/beacon/blocks/finalized",
  "/eth/v2/beacon/blocks/finalized",
  "/eth/v1/beacon/blocks/head",
  "/eth/v2/beacon/blocks/head",

  // State endpoints
  "/eth/v1/beacon/states/finalized",
  "/eth/v2/beacon/states/finalized",
  "/eth/v1/beacon/states/finalized/root",
  "/eth/v2/beacon/states/finalized/root",

  // Node endpoints
  "/eth/v1/node/version",
  "/eth/v1/node/health",
  "/eth/v1/node/syncing",

  // Genesis
  "/eth/v1/beacon/genesis",

  // Config
  "/eth/v1/config/spec",
];

/**
 * Test a single endpoint for a checkpoint URL
 */
async function testEndpoint(url, endpoint, timeout = 5000) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${url}${endpoint}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: response.status,
        success: false,
        responseTime,
        error: `HTTP ${response.status}`,
        data: null,
      };
    }

    // Try to parse JSON
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      // Not JSON or parsing failed
    }

    return {
      status: response.status,
      success: true,
      responseTime,
      error: null,
      data,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      status: null,
      success: false,
      responseTime: null,
      error: error.name === "AbortError" ? "Timeout" : error.message,
      data: null,
    };
  }
}

/**
 * Test all endpoints for a single checkpoint URL
 */
async function testCheckpointServer(url) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Testing: ${url}`);
  console.log(`${"=".repeat(80)}`);

  const results = await Promise.all(
    ENDPOINTS.map((endpoint) => testEndpoint(url, endpoint))
  );

  // Group results by success/failure
  const successful = [];
  const failed = [];

  ENDPOINTS.forEach((endpoint, index) => {
    const result = results[index];
    if (result.success) {
      successful.push({ endpoint, ...result });
    } else {
      failed.push({ endpoint, ...result });
    }
  });

  // Display successful endpoints
  if (successful.length > 0) {
    console.log(`\n✅ SUCCESSFUL ENDPOINTS (${successful.length}):`);
    successful.forEach((result) => {
      console.log(
        `  ${result.endpoint.padEnd(45)} ${result.responseTime}ms (HTTP ${
          result.status
        })`
      );

      // Try to extract slot information
      if (result.data) {
        const slot =
          result.data?.data?.header?.message?.slot ||
          result.data?.data?.message?.slot ||
          result.data?.data?.slot;

        if (slot) {
          console.log(`    └─ Slot: ${slot}`);
        }

        // Show data structure (first level keys)
        if (result.data.data) {
          const keys = Object.keys(result.data.data);
          console.log(`    └─ Data keys: ${keys.join(", ")}`);
        }
      }
    });
  }

  // Display failed endpoints
  if (failed.length > 0) {
    console.log(`\n❌ FAILED ENDPOINTS (${failed.length}):`);
    failed.forEach((result) => {
      console.log(`  ${result.endpoint.padEnd(45)} ${result.error}`);
    });
  }

  // Summary
  console.log(`\n📊 SUMMARY:`);
  console.log(`  Total tested: ${ENDPOINTS.length}`);
  console.log(`  Successful: ${successful.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(
    `  Success rate: ${((successful.length / ENDPOINTS.length) * 100).toFixed(
      1
    )}%`
  );

  // Recommend best endpoint for checkpoint sync
  if (successful.length > 0) {
    // Prefer endpoints with slot data, sorted by response time
    const withSlotData = successful.filter((r) => {
      return (
        r.data?.data?.header?.message?.slot ||
        r.data?.data?.message?.slot ||
        r.data?.data?.slot
      );
    });

    if (withSlotData.length > 0) {
      withSlotData.sort((a, b) => a.responseTime - b.responseTime);
      console.log(
        `\n🎯 RECOMMENDED ENDPOINT: ${withSlotData[0].endpoint} (${withSlotData[0].responseTime}ms)`
      );
    } else {
      successful.sort((a, b) => a.responseTime - b.responseTime);
      console.log(
        `\n⚠️  FALLBACK ENDPOINT: ${successful[0].endpoint} (${successful[0].responseTime}ms, no slot data)`
      );
    }
  } else {
    console.log(`\n❌ NO WORKING ENDPOINTS FOUND`);
  }
}

/**
 * Main function to test all checkpoint servers
 */
async function main() {
  console.log("🔍 Testing Checkpoint Sync Endpoints");
  console.log(
    `Testing ${CHECKPOINT_URLS.length} servers with ${ENDPOINTS.length} endpoints each\n`
  );

  for (const url of CHECKPOINT_URLS) {
    await testCheckpointServer(url);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("✅ Testing complete!");
  console.log(`${"=".repeat(80)}\n`);
}

// Run the tests
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
