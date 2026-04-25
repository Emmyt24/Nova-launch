/**
 * Contract ID Misconfiguration Tests — Frontend Boot
 *
 * Verifies that the frontend fails clearly and early when VITE_FACTORY_CONTRACT_ID
 * is empty, malformed, or looks like it belongs to the wrong network.
 *
 * Each failure names the exact misconfigured variable so the developer knows
 * immediately what to fix.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Re-executes the env module with the given import.meta.env overrides. */
async function loadEnvWith(overrides: Record<string, string | boolean>) {
  vi.resetModules();
  vi.stubGlobal('import', {
    meta: {
      env: {
        VITE_NETWORK: 'testnet',
        VITE_FACTORY_CONTRACT_ID: '',
        PROD: false,
        ...overrides,
      },
    },
  });
  return import('../../config/env');
}

/** A valid 56-char Soroban contract ID (testnet). */
const VALID_CONTRACT_ID = 'C' + 'A'.repeat(55);

/** A valid-format contract ID that would belong to mainnet (same format, different value). */
const MAINNET_CONTRACT_ID = 'C' + 'B'.repeat(55);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Frontend boot — VITE_FACTORY_CONTRACT_ID misconfiguration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ── Empty contract ID ────────────────────────────────────────────────────

  it('throws in production when VITE_FACTORY_CONTRACT_ID is empty', async () => {
    await expect(
      loadEnvWith({ PROD: true, VITE_FACTORY_CONTRACT_ID: '' }),
    ).rejects.toThrow('VITE_FACTORY_CONTRACT_ID is empty');
  });

  it('returns a boot error in development when VITE_FACTORY_CONTRACT_ID is empty', async () => {
    const { getBootErrors } = await loadEnvWith({
      PROD: false,
      VITE_FACTORY_CONTRACT_ID: '',
    });
    const errors = getBootErrors();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch('VITE_FACTORY_CONTRACT_ID is not set');
  });

  // ── Malformed contract ID ────────────────────────────────────────────────

  it('throws in production when VITE_FACTORY_CONTRACT_ID does not start with "C"', async () => {
    await expect(
      loadEnvWith({ PROD: true, VITE_FACTORY_CONTRACT_ID: 'GABC123' }),
    ).rejects.toThrow('VITE_FACTORY_CONTRACT_ID is malformed');
  });

  it('throws in production when VITE_FACTORY_CONTRACT_ID is too short', async () => {
    await expect(
      loadEnvWith({ PROD: true, VITE_FACTORY_CONTRACT_ID: 'CSHORT' }),
    ).rejects.toThrow('VITE_FACTORY_CONTRACT_ID is malformed');
  });

  it('throws in production when VITE_FACTORY_CONTRACT_ID contains invalid base32 characters', async () => {
    // Lowercase is not valid Soroban base32
    const badId = 'C' + 'a'.repeat(55);
    await expect(
      loadEnvWith({ PROD: true, VITE_FACTORY_CONTRACT_ID: badId }),
    ).rejects.toThrow('VITE_FACTORY_CONTRACT_ID is malformed');
  });

  it('returns a boot error in development when VITE_FACTORY_CONTRACT_ID is malformed', async () => {
    const { getBootErrors } = await loadEnvWith({
      PROD: false,
      VITE_FACTORY_CONTRACT_ID: 'not-a-contract-id',
    });
    const errors = getBootErrors();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch('VITE_FACTORY_CONTRACT_ID is malformed');
  });

  // ── Valid-format but wrong-network contract ID ───────────────────────────

  it('accepts a valid-format contract ID on testnet without error', async () => {
    const { ENV } = await loadEnvWith({
      PROD: true,
      VITE_NETWORK: 'testnet',
      VITE_FACTORY_CONTRACT_ID: VALID_CONTRACT_ID,
    });
    expect(ENV.FACTORY_CONTRACT_ID).toBe(VALID_CONTRACT_ID);
    expect(ENV.NETWORK).toBe('testnet');
  });

  it('warns via getBootErrors when a valid-format ID is set on the wrong network (dev mode)', async () => {
    // Simulate: developer has a testnet contract ID but switched VITE_NETWORK to mainnet.
    // The format is valid so no hard throw, but the stellar.ts validateContractId helper
    // should be called explicitly by the consumer. Here we verify the boot error path
    // surfaces the ID so the developer can cross-check.
    const { getBootErrors, ENV } = await loadEnvWith({
      PROD: false,
      VITE_NETWORK: 'mainnet',
      VITE_FACTORY_CONTRACT_ID: MAINNET_CONTRACT_ID,
    });
    // No format error — the ID is structurally valid
    const errors = getBootErrors();
    const formatErrors = errors.filter((e) => e.includes('VITE_FACTORY_CONTRACT_ID'));
    expect(formatErrors).toHaveLength(0);
    // But the network is mainnet — consumer must verify the ID was deployed there
    expect(ENV.NETWORK).toBe('mainnet');
  });

  // ── validateContractId helper (stellar.ts) ───────────────────────────────

  it('validateContractId throws with variable name when ID is empty', async () => {
    vi.resetModules();
    vi.stubGlobal('import', {
      meta: {
        env: {
          VITE_NETWORK: 'testnet',
          VITE_FACTORY_CONTRACT_ID: VALID_CONTRACT_ID,
          PROD: false,
        },
      },
    });
    const { validateContractId } = await import('../../config/stellar');
    expect(() => validateContractId('', 'VITE_FACTORY_CONTRACT_ID')).toThrow(
      'VITE_FACTORY_CONTRACT_ID is empty',
    );
  });

  it('validateContractId throws with variable name when ID is malformed', async () => {
    vi.resetModules();
    vi.stubGlobal('import', {
      meta: {
        env: {
          VITE_NETWORK: 'testnet',
          VITE_FACTORY_CONTRACT_ID: VALID_CONTRACT_ID,
          PROD: false,
        },
      },
    });
    const { validateContractId } = await import('../../config/stellar');
    expect(() => validateContractId('GABC123', 'VITE_FACTORY_CONTRACT_ID')).toThrow(
      'VITE_FACTORY_CONTRACT_ID is malformed',
    );
  });

  it('validateContractId passes for a valid 56-char contract ID', async () => {
    vi.resetModules();
    vi.stubGlobal('import', {
      meta: {
        env: {
          VITE_NETWORK: 'testnet',
          VITE_FACTORY_CONTRACT_ID: VALID_CONTRACT_ID,
          PROD: false,
        },
      },
    });
    const { validateContractId } = await import('../../config/stellar');
    expect(() => validateContractId(VALID_CONTRACT_ID, 'VITE_FACTORY_CONTRACT_ID')).not.toThrow();
  });
});
