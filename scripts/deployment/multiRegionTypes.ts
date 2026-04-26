/**
 * Multi-region deployment types.
 *
 * A "region" in the Stellar context maps to a network endpoint cluster
 * (e.g. a specific Horizon + Soroban RPC pair).  Geo-replication means
 * deploying the same contract WASM to multiple regions and keeping a
 * registry of all contract IDs so the frontend / gateway can route to
 * the nearest healthy endpoint.
 */

import type { DeploymentResult } from './types.js';

/** Supported Stellar network environments. */
export type StellarNetwork = 'testnet' | 'mainnet';

/**
 * Configuration for a single deployment region.
 *
 * Each region targets a specific Horizon + Soroban RPC pair.
 * Multiple regions on the same logical network (e.g. mainnet) allow
 * geo-distributed read traffic while sharing the same ledger state.
 */
export interface RegionConfig {
  /** Unique region identifier, e.g. "us-east", "eu-west", "ap-south". */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Stellar network this region belongs to. */
  network: StellarNetwork;
  /** Horizon REST API URL for this region. */
  horizonUrl: string;
  /** Soroban RPC URL for this region. */
  sorobanRpcUrl: string;
  /** Admin key name in the local Soroban keystore. */
  adminKeyName: string;
  /** Treasury key name in the local Soroban keystore. */
  treasuryKeyName: string;
  /** Base fee in stroops. */
  baseFee: number;
  /** Metadata fee in stroops. */
  metadataFee: number;
  /** Path to the compiled WASM file. */
  wasmPath: string;
  /** Path to the env file to update after deployment. */
  envFile: string;
}

/** Result of deploying to a single region. */
export interface RegionDeploymentResult {
  regionId: string;
  /** Undefined when the region deployment failed. */
  result?: DeploymentResult;
  /** Error message when deployment failed. */
  error?: string;
  /** Whether this region's deployment succeeded. */
  success: boolean;
}

/** Aggregated result of a multi-region deployment run. */
export interface MultiRegionDeploymentResult {
  /** ISO timestamp when the run started. */
  startedAt: string;
  /** ISO timestamp when the run finished. */
  completedAt: string;
  /** Per-region outcomes. */
  regions: RegionDeploymentResult[];
  /** Number of regions that succeeded. */
  successCount: number;
  /** Number of regions that failed. */
  failureCount: number;
  /** True only when every region succeeded. */
  allSucceeded: boolean;
}

/**
 * Registry entry written to `multi-region-deployments.json`.
 * Consumers (frontend, gateway) read this file to discover the
 * contract ID and RPC URL for each region.
 */
export interface RegionRegistry {
  /** ISO timestamp of the last successful deployment to this region. */
  deployedAt: string;
  regionId: string;
  network: StellarNetwork;
  contractId: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  wasmHash: string;
}

/** Full registry file shape. */
export type MultiRegionRegistry = Record<string, RegionRegistry>;

// ── Well-known region presets ─────────────────────────────────────────────────

const WASM_PATH =
  '../../contracts/token-factory/target/wasm32-unknown-unknown/release/token_factory.wasm';

export const TESTNET_REGIONS: RegionConfig[] = [
  {
    id: 'testnet-primary',
    label: 'Testnet Primary (SDF)',
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    adminKeyName: 'admin',
    treasuryKeyName: 'treasury',
    baseFee: 70_000_000,
    metadataFee: 30_000_000,
    wasmPath: WASM_PATH,
    envFile: '../../.env.testnet',
  },
];

export const MAINNET_REGIONS: RegionConfig[] = [
  {
    id: 'mainnet-us-east',
    label: 'Mainnet US-East (SDF)',
    network: 'mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
    adminKeyName: 'admin-mainnet',
    treasuryKeyName: 'treasury-mainnet',
    baseFee: 70_000_000,
    metadataFee: 30_000_000,
    wasmPath: WASM_PATH,
    envFile: '../../.env.mainnet',
  },
  {
    id: 'mainnet-eu-west',
    label: 'Mainnet EU-West (Lobstr)',
    network: 'mainnet',
    horizonUrl: 'https://horizon.stellar.lobstr.co',
    sorobanRpcUrl: 'https://rpc.stellar.lobstr.co',
    adminKeyName: 'admin-mainnet',
    treasuryKeyName: 'treasury-mainnet',
    baseFee: 70_000_000,
    metadataFee: 30_000_000,
    wasmPath: WASM_PATH,
    envFile: '../../.env.mainnet.eu',
  },
  {
    id: 'mainnet-ap-south',
    label: 'Mainnet AP-South (SatoshiPay)',
    network: 'mainnet',
    horizonUrl: 'https://stellar-horizon.satoshipay.io',
    sorobanRpcUrl: 'https://soroban-mainnet.stellar.org', // fallback to SDF RPC
    adminKeyName: 'admin-mainnet',
    treasuryKeyName: 'treasury-mainnet',
    baseFee: 70_000_000,
    metadataFee: 30_000_000,
    wasmPath: WASM_PATH,
    envFile: '../../.env.mainnet.ap',
  },
];
