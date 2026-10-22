import { debugToFile } from "../helpers.js";

// Resolves the latest mainnet reth snapshot manifest for `reth download`.
//
// Left to itself, `reth download` discovers the manifest through the snapshot
// API and then fetches it, both with no timeout. The API sometimes hangs on a
// request and answers the next one in milliseconds, so a plain download can sit
// at "Discovering latest snapshot manifest" forever. BG client fetches the
// manifest here with a timeout and retries instead, and hands reth a local copy
// via --manifest-path, which skips both network calls.
const SNAPSHOT_API_URL = "https://snapshots.reth.rs/api/snapshots";
const REQUEST_TIMEOUT_MS = 60000;
const ATTEMPTS = 6;
const RETRY_DELAY_MS = 5000;

async function fetchJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      debugToFile(`rethManifest.js fetchJson(${url}) #${attempt}: ${err}`);
      if (attempt >= ATTEMPTS) {
        throw new Error(`GET ${url} failed after ${ATTEMPTS} tries: ${err}`);
      }
      console.log(
        `   [bg] Snapshot server did not answer (${err.name || err}); retrying (${attempt}/${
          ATTEMPTS - 1
        })...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

/**
 * Fetch the newest mainnet snapshot manifest. `base_url` is set so archive
 * paths still resolve when reth reads the manifest from a local file.
 */
export async function fetchLatestMainnetManifest() {
  const entries = await fetchJson(SNAPSHOT_API_URL);
  const latest = entries
    .filter(
      (e) =>
        String(e.chainId) === "1" &&
        String(e.metadataUrl).endsWith("manifest.json")
    )
    .sort((a, b) => Number(b.block) - Number(a.block))[0];
  if (!latest) {
    throw new Error(`no mainnet snapshot manifest at ${SNAPSHOT_API_URL}`);
  }
  const manifest = await fetchJson(latest.metadataUrl);
  manifest.base_url = latest.metadataUrl.slice(
    0,
    latest.metadataUrl.lastIndexOf("/")
  );
  return manifest;
}
