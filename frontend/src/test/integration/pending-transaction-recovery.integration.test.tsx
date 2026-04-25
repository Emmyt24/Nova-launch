/**
 * Pending Transaction Recovery — Integration Tests
 *
 * Verifies that the app correctly recovers in-flight transactions after a
 * page refresh or app reopen. Covers deploy, burn, campaign, and governance
 * transaction types.
 *
 * Scenarios:
 *   1. Refresh during pending deploy → monitoring resumes, status tracked
 *   2. Confirmed tx after refresh → final UI state updated correctly
 *   3. Stale / timed-out tx → labelled as timeout, not re-monitored
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  transactionHistoryStorage,
  TransactionHistoryStorage,
} from '../../services/TransactionHistoryStorage';
import type { PersistedPendingTx } from '../../services/TransactionHistoryStorage';
import { TransactionMonitor } from '../../services/transactionMonitor';

// ── Constants ─────────────────────────────────────────────────────────────────

const WALLET = 'GRECOVERY_WALLET_ADDRESS_ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEPLOY_HASH = 'deploy_hash_' + 'a'.repeat(52);
const BURN_HASH = 'burn_hash_' + 'b'.repeat(54);
const CAMPAIGN_HASH = 'campaign_hash_' + 'c'.repeat(50);
const GOVERNANCE_HASH = 'governance_hash_' + 'd'.repeat(48);
const TOKEN_ADDRESS = 'CTOKEN_RECOVERY_ADDRESS_ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePendingTx(
  overrides: Partial<PersistedPendingTx> = {},
): PersistedPendingTx {
  return {
    txHash: DEPLOY_HASH,
    type: 'deploy',
    walletAddress: WALLET,
    submittedAt: new Date().toISOString(),
    entityAddress: TOKEN_ADDRESS,
    ...overrides,
  };
}

/** Simulate a page refresh by clearing in-memory state while keeping localStorage */
function simulatePageRefresh(): TransactionHistoryStorage {
  // Return a fresh instance (same localStorage, new in-memory state)
  return TransactionHistoryStorage.createInstance();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Pending Transaction Recovery', () => {
  beforeEach(() => {
    transactionHistoryStorage.clearAll();
    localStorage.removeItem('pending_transactions');
    vi.clearAllMocks();
  });

  // ── 1. Refresh during pending deploy resumes status tracking ──────────────

  describe('resuming monitoring after refresh', () => {
    it('persists a pending deploy tx to storage', () => {
      const tx = makePendingTx({ txHash: DEPLOY_HASH, type: 'deploy' });
      transactionHistoryStorage.savePendingTx(tx);

      const stored = transactionHistoryStorage.getPendingTxsForWallet(WALLET);
      expect(stored).toHaveLength(1);
      expect(stored[0].txHash).toBe(DEPLOY_HASH);
      expect(stored[0].type).toBe('deploy');
    });

    it('persists burn, campaign, and governance pending txs', () => {
      transactionHistoryStorage.savePendingTx(
        makePendingTx({ txHash: BURN_HASH, type: 'burn' }),
      );
      transactionHistoryStorage.savePendingTx(
        makePendingTx({ txHash: CAMPAIGN_HASH, type: 'campaign' }),
      );
      transactionHistoryStorage.savePendingTx(
        makePendingTx({ txHash: GOVERNANCE_HASH, type: 'governance' }),
      );

      const stored = transactionHistoryStorage.getPendingTxsForWallet(WALLET);
      expect(stored).toHaveLength(3);
      expect(stored.map((t) => t.type)).toEqual(
        expect.arrayContaining(['burn', 'campaign', 'governance']),
      );
    });

    it('survives a simulated page refresh — pending txs still readable', () => {
      transactionHistoryStorage.savePendingTx(
        makePendingTx({ txHash: DEPLOY_HASH }),
      );

      // Simulate refresh: new storage instance reads from same localStorage
      const freshStorage = simulatePageRefresh();
      const recovered = freshStorage.getPendingTxsForWallet(WALLET);

      expect(recovered).toHaveLength(1);
      expect(recovered[0].txHash).toBe(DEPLOY_HASH);
    });

    it('resumes monitoring via TransactionMonitor.resumeMonitoring', async () => {
      const monitor = new TransactionMonitor({ pollingInterval: 50, maxRetries: 5, timeout: 5000, backoffMultiplier: 1 });

      // Persist the pending tx (as would happen before the "refresh")
      transactionHistoryStorage.savePendingTx(makePendingTx({ txHash: DEPLOY_HASH }));

      // Mock RPC to return pending then success
      let rpcCalls = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        rpcCalls++;
        const status = rpcCalls >= 2 ? 'SUCCESS' : 'NOT_FOUND';
        return {
          ok: true,
          json: async () => ({ result: { status } }),
        };
      }) as any;

      const statusUpdates: string[] = [];
      // After "refresh", resume monitoring using the persisted hash
      monitor.resumeMonitoring(DEPLOY_HASH, (update) => {
        statusUpdates.push(update.status);
      });

      // Wait for polling to complete
      await waitFor(
        () => expect(statusUpdates).toContain('success'),
        { timeout: 3000 },
      );

      monitor.destroy();
    });

    it('resumeMonitoring is idempotent — no error if already monitoring', () => {
      const monitor = new TransactionMonitor();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { status: 'NOT_FOUND' } }),
      }) as any;

      monitor.startMonitoring(DEPLOY_HASH);
      // Should not throw
      expect(() => monitor.resumeMonitoring(DEPLOY_HASH)).not.toThrow();

      monitor.destroy();
    });
  });

  // ── 2. Confirmed tx after refresh updates final UI state ──────────────────

  describe('confirmed tx after refresh', () => {
    it('removes pending tx from storage once terminal status is reached', async () => {
      transactionHistoryStorage.savePendingTx(makePendingTx({ txHash: DEPLOY_HASH }));

      // Confirm it's there
      expect(transactionHistoryStorage.getPendingTxsForWallet(WALLET)).toHaveLength(1);

      // Simulate confirmation: remove from pending store
      transactionHistoryStorage.removePendingTx(DEPLOY_HASH);

      expect(transactionHistoryStorage.getPendingTxsForWallet(WALLET)).toHaveLength(0);
    });

    it('does not re-surface a removed pending tx after another refresh', () => {
      transactionHistoryStorage.savePendingTx(makePendingTx({ txHash: DEPLOY_HASH }));
      transactionHistoryStorage.removePendingTx(DEPLOY_HASH);

      const freshStorage = simulatePageRefresh();
      const recovered = freshStorage.getPendingTxsForWallet(WALLET);
      expect(recovered).toHaveLength(0);
    });

    it('monitor emits success and caller can then remove pending tx', async () => {
      const monitor = new TransactionMonitor({ pollingInterval: 50, maxRetries: 5, timeout: 5000, backoffMultiplier: 1 });

      transactionHistoryStorage.savePendingTx(makePendingTx({ txHash: DEPLOY_HASH }));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { status: 'SUCCESS' } }),
      }) as any;

      await new Promise<void>((resolve) => {
        monitor.resumeMonitoring(DEPLOY_HASH, (update) => {
          if (update.status === 'success') {
            transactionHistoryStorage.removePendingTx(DEPLOY_HASH);
            resolve();
          }
        });
      });

      expect(transactionHistoryStorage.getPendingTxsForWallet(WALLET)).toHaveLength(0);
      monitor.destroy();
    });
  });

  // ── 3. Stale / timed-out transactions ─────────────────────────────────────

  describe('stale timed-out transactions', () => {
    it('labels a tx as timeout when max retries are exceeded', async () => {
      const monitor = new TransactionMonitor({
        pollingInterval: 10,
        maxRetries: 2,
        timeout: 60000,
        backoffMultiplier: 1,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { status: 'NOT_FOUND' } }),
      }) as any;

      const statusUpdates: string[] = [];
      monitor.resumeMonitoring(DEPLOY_HASH, (update) => {
        statusUpdates.push(update.status);
      });

      await waitFor(
        () => expect(statusUpdates).toContain('timeout'),
        { timeout: 3000 },
      );

      monitor.destroy();
    });

    it('labels a tx as timeout when the elapsed time exceeds the timeout window', async () => {
      const monitor = new TransactionMonitor({
        pollingInterval: 10,
        maxRetries: 100,
        timeout: 1, // 1 ms — immediately stale
        backoffMultiplier: 1,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { status: 'NOT_FOUND' } }),
      }) as any;

      const statusUpdates: string[] = [];
      monitor.resumeMonitoring(DEPLOY_HASH, (update) => {
        statusUpdates.push(update.status);
      });

      await waitFor(
        () => expect(statusUpdates).toContain('timeout'),
        { timeout: 3000 },
      );

      monitor.destroy();
    });

    it('stale tx from a previous session is not re-monitored if already removed', () => {
      // Tx was submitted, then confirmed before refresh — not in pending store
      const freshStorage = simulatePageRefresh();
      const recovered = freshStorage.getPendingTxsForWallet(WALLET);
      expect(recovered).toHaveLength(0);
    });

    it('deduplicates pending txs — saving the same hash twice keeps one entry', () => {
      const tx = makePendingTx({ txHash: DEPLOY_HASH });
      transactionHistoryStorage.savePendingTx(tx);
      transactionHistoryStorage.savePendingTx(tx); // duplicate

      const stored = transactionHistoryStorage.getPendingTxsForWallet(WALLET);
      expect(stored).toHaveLength(1);
    });

    it('getPendingTxs returns all wallets; getPendingTxsForWallet scopes correctly', () => {
      const otherWallet = 'GOTHER_WALLET_ABCDEFGHIJKLMNOPQRSTUVWXYZ_PADDING';
      transactionHistoryStorage.savePendingTx(makePendingTx({ txHash: DEPLOY_HASH, walletAddress: WALLET }));
      transactionHistoryStorage.savePendingTx(
        makePendingTx({ txHash: BURN_HASH, type: 'burn', walletAddress: otherWallet }),
      );

      expect(transactionHistoryStorage.getPendingTxs()).toHaveLength(2);
      expect(transactionHistoryStorage.getPendingTxsForWallet(WALLET)).toHaveLength(1);
      expect(transactionHistoryStorage.getPendingTxsForWallet(otherWallet)).toHaveLength(1);
    });
  });
});
