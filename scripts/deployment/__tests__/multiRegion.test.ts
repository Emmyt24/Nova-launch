import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import {
  readRegistry,
  writeRegistryEntry,
  checkWasmHashConsistency,
  deployMultiRegion,
} from '../multiRegionOrchestrator.js';
import type { RegionConfig, RegionDeploymentResult } from '../multiRegionTypes.js';
import { TESTNET_REGIONS, MAINNET_REGIONS } from '../multiRegionTypes.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('fs');
vi.mock('child_process');
vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mock-wasm-hash'),
  })),
}));

// Mock DeploymentOrchestrator so we don't need soroban CLI
const mockDeploy = vi.fn().mockResolvedValue({
  contractId: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  admin: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  treasury: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  network: 'testnet',
  deployedAt: '2026-01-01T00:00:00.000Z',
  transactionHash: 'tx_mock',
  wasmHash: 'mock-wasm-hash',
});

vi.mock('../orchestrator.js', () => ({
  DeploymentOrchestrator: class {
    deploy = mockDeploy;
  },
}));

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);

// ── Helpers ───────────────────────────────────────────────────────────────────

const REGION: RegionConfig = TESTNET_REGIONS[0];

function makeResult(overrides: Partial<RegionDeploymentResult> = {}): RegionDeploymentResult {
  return {
    regionId: 'testnet-primary',
    success: true,
    result: {
      contractId: 'CXXX',
      admin: 'GXXX',
      treasury: 'GXXX',
      network: 'testnet',
      deployedAt: '2026-01-01T00:00:00.000Z',
      transactionHash: 'tx_1',
      wasmHash: 'hash-a',
    },
    ...overrides,
  };
}

// ── readRegistry ──────────────────────────────────────────────────────────────

describe('readRegistry', () => {
  it('returns empty object when registry file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(readRegistry()).toEqual({});
  });

  it('returns parsed registry when file exists', () => {
    mockExistsSync.mockReturnValue(true);
    const data = { 'testnet-primary': { regionId: 'testnet-primary', contractId: 'CXXX' } };
    mockReadFileSync.mockReturnValue(JSON.stringify(data) as any);
    expect(readRegistry()).toEqual(data);
  });

  it('returns empty object when file contains invalid JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not-json' as any);
    expect(readRegistry()).toEqual({});
  });
});

// ── writeRegistryEntry ────────────────────────────────────────────────────────

describe('writeRegistryEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => undefined);
  });

  it('writes a new entry to an empty registry', () => {
    const entry = {
      deployedAt: '2026-01-01T00:00:00.000Z',
      regionId: 'testnet-primary',
      network: 'testnet' as const,
      contractId: 'CXXX',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
      wasmHash: 'hash-a',
    };
    writeRegistryEntry(entry);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written['testnet-primary']).toMatchObject({ contractId: 'CXXX' });
  });

  it('merges with existing entries without overwriting others', () => {
    const existing = { 'other-region': { contractId: 'CYYY' } };
    mockExistsSync.mockReturnValue(true);
    // Return existing registry JSON (not the WASM buffer)
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(existing) as any);

    writeRegistryEntry({
      deployedAt: '2026-01-01T00:00:00.000Z',
      regionId: 'testnet-primary',
      network: 'testnet',
      contractId: 'CXXX',
      horizonUrl: 'h',
      sorobanRpcUrl: 'r',
      wasmHash: 'w',
    });

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written['other-region']).toMatchObject({ contractId: 'CYYY' });
    expect(written['testnet-primary']).toMatchObject({ contractId: 'CXXX' });
  });
});

// ── checkWasmHashConsistency ──────────────────────────────────────────────────

describe('checkWasmHashConsistency', () => {
  it('returns true when all regions have the same hash', () => {
    const results = [makeResult(), makeResult({ regionId: 'r2' })];
    expect(checkWasmHashConsistency(results)).toBe(true);
  });

  it('returns false and warns when hashes differ', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const results = [
      makeResult({ result: { ...makeResult().result!, wasmHash: 'hash-a' } }),
      makeResult({ regionId: 'r2', result: { ...makeResult().result!, wasmHash: 'hash-b' } }),
    ];
    expect(checkWasmHashConsistency(results)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('inconsistency'));
    warn.mockRestore();
  });

  it('returns true when there are no successful results', () => {
    expect(checkWasmHashConsistency([makeResult({ success: false, result: undefined })])).toBe(true);
  });

  it('returns true for a single successful region', () => {
    expect(checkWasmHashConsistency([makeResult()])).toBe(true);
  });
});

// ── deployMultiRegion ─────────────────────────────────────────────────────────

describe('deployMultiRegion', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Reset to default success behaviour before each test
    mockDeploy.mockResolvedValue({
      contractId: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      admin: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      treasury: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      network: 'testnet',
      deployedAt: '2026-01-01T00:00:00.000Z',
      transactionHash: 'tx_mock',
      wasmHash: 'mock-wasm-hash',
    });
  });

  it('throws when no regions are provided', async () => {
    await expect(deployMultiRegion([])).rejects.toThrow('No regions provided');
  });

  it('returns allSucceeded=true when all regions succeed', async () => {
    const result = await deployMultiRegion([REGION]);
    expect(result.allSucceeded).toBe(true);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
  });

  it('includes startedAt and completedAt timestamps', async () => {
    const result = await deployMultiRegion([REGION]);
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns one result per region', async () => {
    const result = await deployMultiRegion(TESTNET_REGIONS);
    expect(result.regions).toHaveLength(TESTNET_REGIONS.length);
  });

  it('captures failure without aborting other regions', async () => {
    // First call fails, second succeeds
    mockDeploy
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        contractId: 'CYYY',
        admin: 'G',
        treasury: 'G',
        network: 'mainnet',
        deployedAt: '2026-01-01T00:00:00.000Z',
        transactionHash: 'tx_2',
        wasmHash: 'mock-wasm-hash',
      });

    const result = await deployMultiRegion(MAINNET_REGIONS.slice(0, 2), false);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.allSucceeded).toBe(false);
    expect(result.regions[0].error).toContain('network error');
    expect(result.regions[1].success).toBe(true);
  });

  it('runs in parallel by default (Promise.all path)', async () => {
    const start = Date.now();
    await deployMultiRegion(TESTNET_REGIONS);
    // Parallel should be fast; just verify it completes without error
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('runs sequentially when parallel=false', async () => {
    const result = await deployMultiRegion([REGION], false);
    expect(result.allSucceeded).toBe(true);
  });

  it('writes registry entry for each successful region', async () => {
    await deployMultiRegion([REGION]);
    expect(mockWriteFileSync).toHaveBeenCalled();
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written[REGION.id]).toBeDefined();
  });
});

// ── Region presets ────────────────────────────────────────────────────────────

describe('TESTNET_REGIONS', () => {
  it('contains at least one region', () => {
    expect(TESTNET_REGIONS.length).toBeGreaterThan(0);
  });

  it('all regions target testnet network', () => {
    TESTNET_REGIONS.forEach((r) => expect(r.network).toBe('testnet'));
  });

  it('all regions have unique IDs', () => {
    const ids = TESTNET_REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('MAINNET_REGIONS', () => {
  it('contains at least one region', () => {
    expect(MAINNET_REGIONS.length).toBeGreaterThan(0);
  });

  it('all regions target mainnet network', () => {
    MAINNET_REGIONS.forEach((r) => expect(r.network).toBe('mainnet'));
  });

  it('all regions have unique IDs', () => {
    const ids = MAINNET_REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all regions have valid horizon URLs', () => {
    MAINNET_REGIONS.forEach((r) => expect(r.horizonUrl).toMatch(/^https?:\/\//));
  });

  it('all regions have valid soroban RPC URLs', () => {
    MAINNET_REGIONS.forEach((r) => expect(r.sorobanRpcUrl).toMatch(/^https?:\/\//));
  });
});
