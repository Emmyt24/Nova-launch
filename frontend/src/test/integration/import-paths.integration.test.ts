/**
 * Import path regression tests.
 *
 * Verifies that every service file referenced by barrel exports and key hooks
 * exists on disk with the exact casing used in the import statement.
 * Catches case-sensitive import mismatches that pass on macOS but break Linux CI.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

const SERVICES_DIR = resolve(__dirname, '../../services');
const HOOKS_DIR = resolve(__dirname, '../../hooks');

/** Assert a file exists at the given absolute path (exact casing). */
function assertExists(absolutePath: string) {
  expect(existsSync(absolutePath), `File not found: ${absolutePath}`).toBe(true);
}

describe('service import paths (case-sensitive)', () => {
  it('wallet.ts — canonical WalletService', () => {
    assertExists(resolve(SERVICES_DIR, 'wallet.ts'));
  });

  it('stellar.service.ts — StellarService', () => {
    assertExists(resolve(SERVICES_DIR, 'stellar.service.ts'));
  });

  it('IPFSService.ts — IPFSService', () => {
    assertExists(resolve(SERVICES_DIR, 'IPFSService.ts'));
  });

  it('StellarTransactionMonitor.integration.ts — StellarTransactionMonitor', () => {
    assertExists(resolve(SERVICES_DIR, 'StellarTransactionMonitor.integration.ts'));
  });

  it('TransactionHistoryStorage.ts — TransactionHistoryStorage', () => {
    assertExists(resolve(SERVICES_DIR, 'TransactionHistoryStorage.ts'));
  });

  it('governanceTransactions.ts — GovernanceTransactions', () => {
    assertExists(resolve(SERVICES_DIR, 'governanceTransactions.ts'));
  });

  it('stellarErrors.ts — parseStellarError', () => {
    assertExists(resolve(SERVICES_DIR, 'stellarErrors.ts'));
  });

  it('logging.ts — LoggingService', () => {
    assertExists(resolve(SERVICES_DIR, 'logging.ts'));
  });
});

describe('barrel export paths match filesystem (services/index.ts)', () => {
  // These are the exact strings used in services/index.ts re-exports.
  const barrelExports: [string, string][] = [
    ['LoggingService', 'logging.ts'],
    ['WalletService', 'wallet.ts'],                                    // was ./WalletService (wrong)
    ['IPFSService', 'IPFSService.ts'],
    ['TransactionHistoryStorage', 'TransactionHistoryStorage.ts'],
    ['StellarService', 'stellar.service.ts'],
    ['GovernanceTransactions', 'governanceTransactions.ts'],
    ['parseStellarError', 'stellarErrors.ts'],
    ['StellarTransactionMonitor', 'StellarTransactionMonitor.integration.ts'],
  ];

  for (const [exportName, filename] of barrelExports) {
    it(`${exportName} → ${filename}`, () => {
      assertExists(resolve(SERVICES_DIR, filename));
    });
  }
});

describe('hook import paths (case-sensitive)', () => {
  it('useTokenDeploy.ts exists', () => {
    assertExists(resolve(HOOKS_DIR, 'useTokenDeploy.ts'));
  });
});
