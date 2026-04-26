/**
 * Multi-Region Deployment Orchestrator.
 *
 * Deploys the same contract WASM to multiple Stellar endpoint regions in
 * parallel (or sequentially when `parallel=false`).  After each successful
 * region deployment the result is written to `multi-region-deployments.json`
 * so the registry is always up-to-date even if later regions fail.
 *
 * Design decisions:
 *   - Reuses `DeploymentOrchestrator` per region — no duplicated deploy logic.
 *   - Fail-partial: a failure in one region does not abort the others.
 *   - Registry file is written atomically per region (append-on-success).
 *   - WASM hash consistency check: all successful regions must report the
 *     same WASM hash, otherwise a warning is emitted (hash mismatch would
 *     indicate a race condition or tampered build artifact).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DeploymentOrchestrator } from './orchestrator.js';
import type { DeploymentConfig } from './types.js';
import type {
  RegionConfig,
  RegionDeploymentResult,
  MultiRegionDeploymentResult,
  MultiRegionRegistry,
  RegionRegistry,
} from './multiRegionTypes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to the shared registry file. */
const REGISTRY_PATH = join(__dirname, '../../multi-region-deployments.json');

/**
 * Converts a `RegionConfig` to the `DeploymentConfig` shape expected by
 * `DeploymentOrchestrator`.
 */
function toDeploymentConfig(region: RegionConfig): DeploymentConfig {
  return {
    network: region.network,
    horizonUrl: region.horizonUrl,
    sorobanRpcUrl: region.sorobanRpcUrl,
    adminKeyName: region.adminKeyName,
    treasuryKeyName: region.treasuryKeyName,
    baseFee: region.baseFee,
    metadataFee: region.metadataFee,
    wasmPath: region.wasmPath,
    envFile: region.envFile,
  };
}

/**
 * Reads the current registry from disk, or returns an empty object.
 */
export function readRegistry(): MultiRegionRegistry {
  if (!existsSync(REGISTRY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as MultiRegionRegistry;
  } catch {
    return {};
  }
}

/**
 * Persists a single region entry to the registry file.
 * Merges with existing entries so other regions are not overwritten.
 */
export function writeRegistryEntry(entry: RegionRegistry): void {
  const registry = readRegistry();
  registry[entry.regionId] = entry;
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

/**
 * Deploys to a single region and returns the outcome.
 * Never throws — errors are captured in `RegionDeploymentResult.error`.
 */
async function deployRegion(region: RegionConfig): Promise<RegionDeploymentResult> {
  const orchestrator = new DeploymentOrchestrator(toDeploymentConfig(region));
  try {
    const result = await orchestrator.deploy();

    // Persist to registry immediately so partial progress is not lost
    writeRegistryEntry({
      deployedAt: result.deployedAt,
      regionId: region.id,
      network: region.network,
      contractId: result.contractId,
      horizonUrl: region.horizonUrl,
      sorobanRpcUrl: region.sorobanRpcUrl,
      wasmHash: result.wasmHash,
    });

    return { regionId: region.id, result, success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { regionId: region.id, error, success: false };
  }
}

/**
 * Checks that all successful regions report the same WASM hash.
 * Emits a console warning (not an error) when a mismatch is detected —
 * the caller decides whether to treat this as fatal.
 */
export function checkWasmHashConsistency(results: RegionDeploymentResult[]): boolean {
  const hashes = results
    .filter((r) => r.success && r.result?.wasmHash)
    .map((r) => r.result!.wasmHash);

  if (hashes.length === 0) return true;
  const unique = new Set(hashes);
  if (unique.size > 1) {
    console.warn(
      `⚠️  WASM hash inconsistency detected across regions: ${[...unique].join(', ')}`
    );
    return false;
  }
  return true;
}

/**
 * Deploys to all provided regions.
 *
 * @param regions  List of region configs to deploy to.
 * @param parallel When true (default) all regions are deployed concurrently.
 *                 Set to false for sequential deployment (useful for debugging).
 */
export async function deployMultiRegion(
  regions: RegionConfig[],
  parallel = true
): Promise<MultiRegionDeploymentResult> {
  if (regions.length === 0) throw new Error('No regions provided for deployment.');

  const startedAt = new Date().toISOString();
  console.log(`🌍 Starting multi-region deployment to ${regions.length} region(s)...`);
  regions.forEach((r) => console.log(`   • ${r.id} (${r.label})`));

  let regionResults: RegionDeploymentResult[];

  if (parallel) {
    regionResults = await Promise.all(regions.map(deployRegion));
  } else {
    regionResults = [];
    for (const region of regions) {
      regionResults.push(await deployRegion(region));
    }
  }

  const successCount = regionResults.filter((r) => r.success).length;
  const failureCount = regionResults.length - successCount;

  checkWasmHashConsistency(regionResults);

  const completedAt = new Date().toISOString();

  return {
    startedAt,
    completedAt,
    regions: regionResults,
    successCount,
    failureCount,
    allSucceeded: failureCount === 0,
  };
}
