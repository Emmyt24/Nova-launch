/**
 * Transaction Monitor Live Shape Tests
 * 
 * Tests status mapping and state transitions for real Stellar transaction monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TransactionMonitor, type TransactionStatusUpdate, DEFAULT_MONITORING_CONFIG } from '../transactionMonitor';

// Mock fetch for RPC calls
globalThis.fetch = vi.fn() as any;

describe('TransactionMonitor - Live Shape Tests', () => {
  let monitor: TransactionMonitor;
  const mockTxHash = 'abc123def456';

  beforeEach(() => {
    monitor = new TransactionMonitor({
      pollingInterval: 100, // Fast polling for tests
      maxRetries: 5,
      timeout: 5000,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    monitor.destroy();
  });

  describe('Status Mapping', () => {
    it('should map SUCCESS RPC status to success', async () => {
      const statusUpdates: TransactionStatusUpdate[] = [];

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'SUCCESS',
            ledger: 12345,
          },
        }),
      });

      monitor.startMonitoring(mockTxHash, (update) => {
        statusUpdates.push(update);
      });

      // Wait for polling to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(statusUpdates).toHaveLength(1);
      expect(statusUpdates[0].status).toBe('success');
      expect(statusUpdates[0].hash).toBe(mockTxHash);
    });

    it('should map FAILED RPC status to failed', async () => {
      const statusUpdates: TransactionStatusUpdate[] = [];

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'FAILED',
            resultXdr: 'failed_xdr_data',
          },
        }),
      });

      monitor.startMonitoring(mockTxHash, (update) => {
        statusUpdates.push(update);
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(statusUpdates).toHaveLength(1);
      expect(statusUpdates[0].status).toBe('failed');
    });

    it('should map NOT_FOUND RPC status to pending', async () => {
      let callCount = 0;

      (globalThis.fetch as any).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              id: 1,
              result: {
                status: 'NOT_FOUND',
              },
            }),
          };
        }
        // Eventually succeed
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {
              status: 'SUCCESS',
              ledger: 12345,
            },
          }),
        };
      });

      const statusUpdates: TransactionStatusUpdate[] = [];
      monitor.startMonitoring(mockTxHash, (update) => {
        statusUpdates.push(update);
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Should eventually get success after pending states
      const finalUpdate = statusUpdates[statusUpdates.length - 1];
      expect(finalUpdate.status).toBe('success');
      expect(callCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('State Transitions', () => {
    it('should transition from pending to success', async () => {
      const statusUpdates: TransactionStatusUpdate[] = [];

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'SUCCESS',
            ledger: 12345,
          },
        }),
      });

      monitor.startMonitoring(mockTxHash, (update) => {
        statusUpdates.push(update);
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(statusUpdates[0].status).toBe('success');
      expect(statusUpdates[0].ledger).toBe(12345);
    });

    it('should transition from pending to failed', async () => {
      const statusUpdates: TransactionStatusUpdate[] = [];

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'FAILED',
            error: 'Contract execution failed',
          },
        }),
      });

      monitor.startMonitoring(mockTxHash, (update) => {
        statusUpdates.push(update);
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(statusUpdates[0].status).toBe('failed');
    });

    it('should transition to timeout after max retries', async () => {
      const statusUpdates: TransactionStatusUpdate[] = [];

      // Always return pending
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'NOT_FOUND',
          },
        }),
      });

      monitor.startMonitoring(mockTxHash, (update) => {
        statusUpdates.push(update);
      });

      // Wait for max retries to be exceeded
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalUpdate = statusUpdates[statusUpdates.length - 1];
      expect(finalUpdate.status).toBe('timeout');
      expect(finalUpdate.error).toContain('Max retries exceeded');
    });

    it('should transition to timeout after time limit', async () => {
      const shortTimeoutMonitor = new TransactionMonitor({
        pollingInterval: 100,
        maxRetries: 100,
        timeout: 300, // Very short timeout
      });

      const statusUpdates: TransactionStatusUpdate[] = [];

      // Always return pending
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'NOT_FOUND',
          },
        }),
      });

      shortTimeoutMonitor.startMonitoring(mockTxHash, (update) => {
        statusUpdates.push(update);
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const finalUpdate = statusUpdates[statusUpdates.length - 1];
      expect(finalUpdate.status).toBe('timeout');
      expect(finalUpdate.error).toContain('timeout');

      shortTimeoutMonitor.destroy();
    });
  });

  describe('Polling Behavior', () => {
    it('should stop polling after terminal state (success)', async () => {
      let callCount = 0;

      (globalThis.fetch as any).mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {
              status: 'SUCCESS',
              ledger: 12345,
            },
          }),
        };
      });

      monitor.startMonitoring(mockTxHash);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Should only call once since it succeeded immediately
      expect(callCount).toBe(1);
    });

    it('should stop polling after terminal state (failed)', async () => {
      let callCount = 0;

      (globalThis.fetch as any).mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {
              status: 'FAILED',
            },
          }),
        };
      });

      monitor.startMonitoring(mockTxHash);

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(callCount).toBe(1);
    });

    it('should continue polling while pending', async () => {
      let callCount = 0;

      (globalThis.fetch as any).mockImplementation(async () => {
        callCount++;
        if (callCount < 4) {
          return {
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              id: 1,
              result: {
                status: 'NOT_FOUND',
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {
              status: 'SUCCESS',
            },
          }),
        };
      });

      monitor.startMonitoring(mockTxHash);

      await new Promise(resolve => setTimeout(resolve, 600));

      expect(callCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const errors: Error[] = [];

      (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

      monitor.startMonitoring(
        mockTxHash,
        () => {},
        (error) => {
          errors.push(error);
        }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Network error');
    });

    it('should retry after transient errors', async () => {
      let callCount = 0;

      (globalThis.fetch as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Transient error');
        }
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {
              status: 'SUCCESS',
            },
          }),
        };
      });

      const statusUpdates: TransactionStatusUpdate[] = [];
      monitor.startMonitoring(mockTxHash, (update) => {
        statusUpdates.push(update);
      });

      await new Promise(resolve => setTimeout(resolve, 400));

      expect(callCount).toBeGreaterThanOrEqual(2);
      const finalUpdate = statusUpdates[statusUpdates.length - 1];
      expect(finalUpdate.status).toBe('success');
    });

    it('should handle RPC error responses', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32600,
            message: 'Invalid request',
          },
        }),
      });

      const errors: Error[] = [];
      monitor.startMonitoring(
        mockTxHash,
        () => {},
        (error) => {
          errors.push(error);
        }
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Session Management', () => {
    it('should track monitoring session details', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'NOT_FOUND',
          },
        }),
      });

      monitor.startMonitoring(mockTxHash);

      await new Promise(resolve => setTimeout(resolve, 200));

      const session = monitor.getSession(mockTxHash);
      expect(session).toBeDefined();
      expect(session?.hash).toBe(mockTxHash);
      expect(session?.status).toBe('pending');
      expect(session?.attempts).toBeGreaterThan(0);
      expect(session?.startTime).toBeDefined();
    });

    it('should update session on completion', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'SUCCESS',
            ledger: 12345,
          },
        }),
      });

      monitor.startMonitoring(mockTxHash);

      await new Promise(resolve => setTimeout(resolve, 200));

      const session = monitor.getSession(mockTxHash);
      expect(session?.status).toBe('success');
      expect(session?.endTime).toBeDefined();
    });

    it('should allow manual stop of monitoring', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: 'NOT_FOUND',
          },
        }),
      });

      monitor.startMonitoring(mockTxHash);
      await new Promise(resolve => setTimeout(resolve, 100));

      monitor.stopMonitoring(mockTxHash);

      const callCountBefore = (globalThis.fetch as any).mock.calls.length;
      await new Promise(resolve => setTimeout(resolve, 300));
      const callCountAfter = (globalThis.fetch as any).mock.calls.length;

      // Should not have made additional calls after stopping
      expect(callCountAfter).toBe(callCountBefore);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const defaultMonitor = new TransactionMonitor();
      expect(DEFAULT_MONITORING_CONFIG.pollingInterval).toBe(3000);
      expect(DEFAULT_MONITORING_CONFIG.maxRetries).toBe(40);
      expect(DEFAULT_MONITORING_CONFIG.timeout).toBe(120000);
    });

    it('should allow custom configuration', () => {
      const customMonitor = new TransactionMonitor({
        pollingInterval: 5000,
        maxRetries: 20,
        timeout: 60000,
      });

      expect(customMonitor).toBeDefined();
      customMonitor.destroy();
    });
  });
});
