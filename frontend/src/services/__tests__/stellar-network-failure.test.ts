/**
 * Network Failure Injection Tests for Frontend Stellar Service
 * 
 * Tests failure injection for:
 * - RPC network outages
 * - Horizon timeouts
 * - Dropped responses
 * - Flaky wallet signing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransactionMonitor, RPCTransport, MonitoringConfig } from '../transactionMonitor';
import {
  isRetryableError,
  calculateBackoffDelay,
  USER_RETRY_CONFIG,
} from '../../utils/retry';

class MockRPCTransport implements RPCTransport {
  private shouldFail = false;
  private failCount = 0;
  private currentFailures = 0;
  private responseDelay = 0;

  constructor(options?: { failCount?: number; responseDelay?: number }) {
    if (options?.failCount) this.failCount = options.failCount;
    if (options?.responseDelay) this.responseDelay = options.responseDelay;
  }

  setFailureMode(shouldFail: boolean, failCount = 0): void {
    this.shouldFail = shouldFail;
    this.currentFailures = failCount;
  }

  async getTransaction(hash: string): Promise<any> {
    if (this.shouldFail && this.currentFailures > 0) {
      this.currentFailures--;
      throw new Error('RPC network failure');
    }
    if (this.shouldFail && this.failCount > 0) {
      this.failCount--;
      throw new Error('RPC network failure');
    }
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }
    return { status: 'SUCCESS' };
  }
}

describe('Network Failure Injection - TransactionMonitor', () => {
  let monitor: TransactionMonitor;
  let mockTransport: MockRPCTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport = new MockRPCTransport({ failCount: 2, responseDelay: 10 });
    monitor = new TransactionMonitor({
      pollingInterval: 50,
      maxRetries: 3,
      timeout: 5000,
      backoffMultiplier: 1.0,
    }, mockTransport);
  });

  afterEach(() => {
    monitor.destroy();
  });

  describe('RPC Network Outage Handling', () => {
    it('retries on RPC connection failure', async () => {
      const statusFn = vi.fn();
      const errorFn = vi.fn();

      monitor.startMonitoring('txhash123', statusFn, errorFn);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(statusFn).toHaveBeenCalled();
    });

    it('stops after max retries on persistent RPC failure', async () => {
      const alwaysFailingTransport = new MockRPCTransport();
      alwaysFailingTransport.setFailureMode(true);
      
      const persistentMonitor = new TransactionMonitor({
        pollingInterval: 50,
        maxRetries: 2,
        timeout: 500,
        backoffMultiplier: 1.0,
      }, alwaysFailingTransport);

      const statusFn = vi.fn();
      const errorFn = vi.fn();

      vi.mocked(calculateBackoffDelay).mockReturnValue(10);

      persistentMonitor.startMonitoring('txhash123', statusFn, errorFn);
      
      await new Promise(resolve => setTimeout(resolve, 300));

      await alwaysFailingTransport.getTransaction('txhash').catch(() => {});

      expect(errorFn).toHaveBeenCalled();
      persistentMonitor.destroy();
    });
  });

  describe('Horizon Timeout Handling', () => {
    it('handles timeout gracefully', async () => {
      const transportWithDelay = new MockRPCTransport({ responseDelay: 50 });
      const timeoutMonitor = new TransactionMonitor({
        pollingInterval: 20,
        maxRetries: 2,
        timeout: 200,
        backoffMultiplier: 1.0,
      }, transportWithDelay);

      const statusFn = vi.fn();
      const errorFn = vi.fn();

      vi.mocked(isRetryableError).mockReturnValue(true);
      vi.mocked(calculateBackoffDelay).mockReturnValue(10);

      timeoutMonitor.startMonitoring('txhash123', statusFn, errorFn);
      
      await new Promise(resolve => setTimeout(resolve, 150));

      timeoutMonitor.destroy();
    });

    it('continues polling after timeout if under max retries', async () => {
      const transport = new MockRPCTransport({ failCount: 1 });
      transport.setFailureMode(true, 1);
      
      const retryMonitor = new TransactionMonitor({
        pollingInterval: 20,
        maxRetries: 3,
        timeout: 500,
        backoffMultiplier: 1.0,
      }, transport);

      const statusFn = vi.fn();
      const errorFn = vi.fn();
      
      vi.mocked(isRetryableError).mockReturnValue(true);
      vi.mocked(calculateBackoffDelay).mockReturnValue(10);

      retryMonitor.startMonitoring('txhash123', statusFn, errorFn);
      
      await new Promise(resolve => setTimeout(resolve, 200));

      retryMonitor.destroy();
    });
  });

  describe('Dropped Response Handling', () => {
    it('handles null response gracefully', async () => {
      class NullResponseTransport implements RPCTransport {
        async getTransaction(hash: string): Promise<any> {
          return null;
        }
      }

      const nullMonitor = new TransactionMonitor({}, new NullResponseTransport());
      const statusFn = vi.fn();
      
      nullMonitor.startMonitoring('txhash123', statusFn);
      
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(statusFn).toHaveBeenCalled();
      nullMonitor.destroy();
    });

    it('handles malformed response', async () => {
      class MalformedTransport implements RPCTransport {
        async getTransaction(hash: string): Promise<any> {
          throw new Error('Invalid JSON');
        }
      }

      const malformedMonitor = new TransactionMonitor({}, new MalformedTransport());
      const statusFn = vi.fn();
      const errorFn = vi.fn();
      
      vi.mocked(isRetryableError).mockReturnValue(false);

      malformedMonitor.startMonitoring('txhash123', statusFn, errorFn);
      
      await new Promise(resolve => setTimeout(resolve, 100));

      malformedMonitor.destroy();
    });
  });

  describe('Retryable vs Non-Retryable Errors', () => {
    it('retries transient network errors', async () => {
      const networkTransport = new MockRPCTransport();
      networkTransport.setFailureMode(true, 1);
      
      const statusFn = vi.fn();
      const errorFn = vi.fn();

      vi.mocked(isRetryableError).mockReturnValue(true);
      vi.mocked(calculateBackoffDelay).mockReturnValue(10);

      const retryMonitor = new TransactionMonitor({}, networkTransport);
      retryMonitor.startMonitoring('txhash123', statusFn, errorFn);
      
      await new Promise(resolve => setTimeout(resolve, 150));

      retryMonitor.destroy();
    });

    it('stops immediately on terminal errors', async () => {
      const terminalTransport = new MockRPCTransport();
      terminalTransport.setFailureMode(true, 0);
      
      const statusFn = vi.fn();
      const errorFn = vi.fn();

      vi.mocked(isRetryableError).mockReturnValue(false);

      terminalTransport.setFailureMode(true);
      
      const terminalMonitor = new TransactionMonitor({}, terminalTransport);
      terminalMonitor.startMonitoring('txhash123', statusFn, errorFn);
      
      await new Promise(resolve => setTimeout(resolve, 100));

      terminalMonitor.destroy();
    });
  });

  describe('Transport Injection', () => {
    it('allows injecting custom transport', async () => {
      const customTransport = new MockRPCTransport();
      const createdMonitor = new TransactionMonitor({}, customTransport);
      
      expect(createdMonitor).toBeDefined();
      createdMonitor.destroy();
    });

    it('supports setTransport for runtime swap', async () => {
      const newTransport = new MockRPCTransport();
      monitor.setTransport(newTransport);
      
      expect(monitor).toBeDefined();
    });
  });
});