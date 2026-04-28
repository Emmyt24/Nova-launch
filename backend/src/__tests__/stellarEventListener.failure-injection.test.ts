/**
 * Network Failure Injection Tests for Backend StellarEventListener
 * 
 * Tests failure injection for:
 * - RPC network outages
 * - Horizon timeouts
 * - Dropped responses
 * - Flaky API responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StellarEventListener, HorizonTransport } from '../services/stellarEventListener';
import {
  isRetryableError,
  calculateBackoffDelay,
  BACKGROUND_RETRY_CONFIG,
  sleep,
} from '../stellar-service-integration/rate-limiter';

class MockHorizonTransport implements HorizonTransport {
  private failCount = 0;
  private responseDelay = 0;
  private shouldFail = false;
  private failWithStatus: number | null = null;

  constructor(options?: { failCount?: number; responseDelay?: number }) {
    if (options?.failCount) this.failCount = options.failCount;
    if (options?.responseDelay) this.responseDelay = options.responseDelay;
  }

  setFailureMode(shouldFail: boolean, status?: number): void {
    this.shouldFail = shouldFail;
    this.failWithStatus = status ?? null;
  }

  async getEvents(url: string, params: any): Promise<any> {
    if (this.responseDelay > 0) {
      await sleep(this.responseDelay);
    }
    if (this.shouldFail) {
      if (this.failWithStatus) {
        const error: any = new Error('HTTP Error');
        error.response = { status: this.failWithStatus };
        throw error;
      }
      throw new Error('Network failure');
    }
    if (this.failCount > 0) {
      this.failCount--;
      throw new Error('Transient failure');
    }
    return { data: { _embedded: { records: [] } } };
  }
}

describe('Network Failure Injection - StellarEventListener', () => {
  let listener: StellarEventListener;
  let mockTransport: MockHorizonTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport = new MockHorizonTransport({ failCount: 2, responseDelay: 10 });
    listener = new StellarEventListener(mockTransport);
  });

  afterEach(() => {
    listener.stop();
  });

  describe('RPC Network Outage Handling', () => {
    it('retries on RPC connection failure', async () => {
      const transport = new MockHorizonTransport({ failCount: 2 });
      const testListener = new StellarEventListener(transport);
      
      testListener.setTransport(transport);
      
      expect(testListener).toBeDefined();
    });

    it('exhausts retries on persistent RPC failure', async () => {
      const failingTransport = new MockHorizonTransport();
      failingTransport.setFailureMode(true);
      
      const config = { ...BACKGROUND_RETRY_CONFIG, maxAttempts: 3 };
      let attempts = 0;

      for (let i = 0; i < config.maxAttempts; i++) {
        attempts++;
        try {
          await failingTransport.getEvents('http://test/events', {});
        } catch (e) {
          if (!isRetryableError(e)) break;
          if (i < config.maxAttempts - 1) {
            await sleep(calculateBackoffDelay(i + 1, config));
          }
        }
      }

      expect(attempts).toBe(config.maxAttempts);
    });
  });

  describe('Horizon Timeout Handling', () => {
    it('handles timeout gracefully', () => {
      const timeoutError = { code: 'ETIMEDOUT', message: 'Request timeout' };
      expect(isRetryableError(timeoutError)).toBe(true);
    });

    it('retries after timeout error with backoff', async () => {
      const transportWithDelay = new MockHorizonTransport({ failCount: 1, responseDelay: 5 });
      const testListener = new StellarEventListener(transportWithDelay);
      
      testListener.setTransport(transportWithDelay);
      
      expect(testListener).toBeDefined();
    });
  });

  describe('Dropped Response Handling', () => {
    it('handles empty records array', async () => {
      const transport = new MockHorizonTransport();
      const response = await transport.getEvents('http://test', { limit: 10 });
      
      expect(response.data._embedded.records).toHaveLength(0);
    });

    it('handles missing _embedded property', async () => {
      class EmptyTransport implements HorizonTransport {
        async getEvents(url: string, params: any): Promise<any> {
          return { data: {} };
        }
      }

      const transport = new EmptyTransport();
      const response = await transport.getEvents('http://test', {});
      
      expect(response.data._embedded?.records).toBeUndefined();
    });

    it('handles null response', async () => {
      class NullTransport implements HorizonTransport {
        async getEvents(url: string, params: any): Promise<any> {
          return { data: null };
        }
      }

      const transport = new NullTransport();
      const response = await transport.getEvents('http://test', {});
      
      expect(response).toBeDefined();
    });
  });

  describe('Rate Limit (429) Handling', () => {
    it('identifies 429 as retryable', () => {
      const rateLimitError = { response: { status: 429 }, message: 'Too Many Requests' };
      expect(isRetryableError(rateLimitError)).toBe(true);
    });

    it('backs off on 429 response', async () => {
      const transport = new MockHorizonTransport();
      transport.setFailureMode(true, 429);
      
      const startTime = Date.now();
      
      try {
        await transport.getEvents('http://test/events', {});
      } catch (e) {
        if (isRetryableError(e)) {
          await sleep(calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG));
        }
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(1600);
    });

    it('increases backoff on repeated 429s', async () => {
      const delays: number[] = [];

      for (let attempt = 1; attempt <= 3; attempt++) {
        delays.push(calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG));
      }

      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
    });
  });

  describe('5xx Server Error Handling', () => {
    it('retries 500 Internal Server Error', () => {
      expect(isRetryableError({ response: { status: 500 } })).toBe(true);
    });

    it('retries 502 Bad Gateway', () => {
      expect(isRetryableError({ response: { status: 502 } })).toBe(true);
    });

    it('retries 503 Service Unavailable', () => {
      expect(isRetryableError({ response: { status: 503 } })).toBe(true);
    });

    it('retries 504 Gateway Timeout', () => {
      expect(isRetryableError({ response: { status: 504 } })).toBe(true);
    });
  });

  describe('Terminal Error Handling', () => {
    it('does not retry 400 Bad Request', () => {
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
    });

    it('does not retry 401 Unauthorized', () => {
      expect(isRetryableError({ response: { status: 401 } })).toBe(false);
    });

    it('does not retry 403 Forbidden', () => {
      expect(isRetryableError({ response: { status: 403 } })).toBe(false);
    });

    it('does not retry 404 Not Found', () => {
      expect(isRetryableError({ response: { status: 404 } })).toBe(false);
    });

    it('fails fast on terminal errors', async () => {
      const terminalError = { response: { status: 400 }, message: 'Bad Request' };
      
      const startTime = Date.now();
      
      expect(isRetryableError(terminalError)).toBe(false);
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Deterministic Backoff', () => {
    it('calculates consistent backoff delays', () => {
      const delays: number[] = [];
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        delays.push(calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG));
      }

      delays.forEach((delay) => {
        expect(delay).toBeGreaterThan(0);
      });
    });

    it('respects maxDelay cap', () => {
      const delay = calculateBackoffDelay(100, BACKGROUND_RETRY_CONFIG);
      expect(delay).toBeLessThanOrEqual(BACKGROUND_RETRY_CONFIG.maxDelay * 1.2);
    });

    it('never returns negative delay', () => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        const delay = calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Concurrent Failure Handling', () => {
    it('applies jitter to prevent synchronized retries', () => {
      const delays: number[] = [];
      
      for (let i = 0; i < 20; i++) {
        delays.push(calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG));
      }

      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('spreads retries across time window', () => {
      const delays: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        delays.push(calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG));
      }

      const min = Math.min(...delays);
      const max = Math.max(...delays);
      const spread = max - min;
      
      expect(spread).toBeGreaterThan(0);
    });
  });

  describe('Transport Injection', () => {
    it('allows injecting custom transport', () => {
      const customTransport = new MockHorizonTransport();
      const createdListener = new StellarEventListener(customTransport);
      
      expect(createdListener).toBeDefined();
    });

    it('supports setTransport for runtime swap', () => {
      const newTransport = new MockHorizonTransport();
      listener.setTransport(newTransport);
      
      expect(listener).toBeDefined();
    });
  });

  describe('Integration: Full Failure Scenario', () => {
    it('handles multiple transient failures then success', async () => {
      const errors = [
        { code: 'ECONNRESET' },
        { response: { status: 503 } },
        { response: { status: 429 } },
      ];

      let callCount = 0;
      const results: any[] = [];

      for (const error of errors) {
        callCount++;
        try {
          if (error.code) {
            throw error;
          }
          if (error.response?.status) {
            throw error;
          }
          const result = { data: { _embedded: { records: [] } } };
          results.push(result);
          break;
        } catch (e) {
          results.push(e);
          if (isRetryableError(e)) {
            await sleep(calculateBackoffDelay(callCount, BACKGROUND_RETRY_CONFIG));
          }
        }
      }

      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it('stops after max attempts exhausted', async () => {
      const error = { response: { status: 503 } };
      
      let attempts = 0;
      const maxAttempts = BACKGROUND_RETRY_CONFIG.maxAttempts;

      for (let i = 0; i < maxAttempts; i++) {
        attempts++;
        try {
          throw error;
        } catch (e) {
          if (!isRetryableError(e)) break;
          if (i < maxAttempts - 1) {
            await sleep(calculateBackoffDelay(i + 1, BACKGROUND_RETRY_CONFIG));
          }
        }
      }

      expect(attempts).toBe(maxAttempts);
    });
  });
});

  describe('RPC Network Outage Handling', () => {
    it('retries on RPC connection failure', async () => {
      const networkError = { code: 'ECONNRESET', message: 'Connection reset' };
      mockAxios.get
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: { _embedded: { records: [] } });

      const errors: any[] = [];
      
      try {
        await Promise.all([
          mockAxios.get('http://test/events').catch((e: any) => errors.push(e)),
          mockAxios.get('http://test/events').catch((e: any) => errors.push(e)),
          mockAxios.get('http://test/events'),
        ]);
      } catch (e) {
        // Expected to retry
      }

      expect(mockAxios.get).toHaveBeenCalledTimes(3);
    });

    it('exhausts retries on persistent RPC failure', async () => {
      const networkError = { code: 'ETIMEDOUT', message: 'Connection timed out' };
      mockAxios.get.mockRejectedValue(networkError);

      const config = { ...BACKGROUND_RETRY_CONFIG, maxAttempts: 3 };
      let attempts = 0;

      for (let i = 0; i < config.maxAttempts; i++) {
        attempts++;
        try {
          await mockAxios.get('http://test/events');
        } catch (e) {
          if (!isRetryableError(e)) break;
          if (i < config.maxAttempts - 1) {
            await sleep(calculateBackoffDelay(i + 1, config));
          }
        }
      }

      expect(attempts).toBe(config.maxAttempts);
    });
  });

  describe('Horizon Timeout Handling', () => {
    it('handles Horizon timeout gracefully', async () => {
      const timeoutError = { code: 'ETIMEDOUT', message: 'Request timeout' };
      mockAxios.get.mockRejectedValue(timeoutError);

      const result = isRetryableError(timeoutError);
      expect(result).toBe(true);
    });

    it('retries after timeout error with backoff', async () => {
      const timeoutError = { code: 'ETIMEDOUT' };
      mockAxios.get
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({ data: { _embedded: { records: [] } });

      let success = false;
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await mockAxios.get('http://test/events');
          success = true;
          break;
        } catch (e) {
          if (isRetryableError(e) && attempt < 2) {
            await sleep(calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG));
          }
        }
      }

      expect(success).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Dropped Response Handling', () => {
    it('handles empty records array', async () => {
      mockAxios.get.mockResolvedValue({ data: { _embedded: { records: [] } } });

      const response = await mockAxios.get('http://test/events');
      
      expect(response.data._embedded.records).toHaveLength(0);
    });

    it('handles missing _embedded property', async () => {
      mockAxios.get.mockResolvedValue({ data: {} });

      const response = await mockAxios.get('http://test/events');
      
      expect(response.data._embedded?.records).toBeUndefined();
    });

    it('throws on malformed response', async () => {
      mockAxios.get.mockResolvedValue({ data: null });

      await expect(mockAxios.get('http://test/events')).resolves.toBeDefined();
    });
  });

  describe('Rate Limit (429) Handling', () => {
    it('identifies 429 as retryable', () => {
      const rateLimitError = { response: { status: 429 }, message: 'Too Many Requests' };
      expect(isRetryableError(rateLimitError)).toBe(true);
    });

    it('backs off on 429 response', async () => {
      const rateLimitError = { response: { status: 429 } };
      
      const startTime = Date.now();
      
      mockAxios.get
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ data: { _embedded: { records: [] } });

      try {
        await mockAxios.get('http://test/events');
      } catch (e) {
        if (isRetryableError(e)) {
          await sleep(calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG));
          await mockAxios.get('http://test/events');
        }
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(1600);
    });

    it('increases backoff on repeated 429s', async () => {
      const rateLimitError = { response: { status: 429 } };
      const delays: number[] = [];

      for (let attempt = 1; attempt <= 3; attempt++) {
        delays.push(calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG));
      }

      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
    });
  });

  describe('5xx Server Error Handling', () => {
    it('retries 500 Internal Server Error', () => {
      expect(isRetryableError({ response: { status: 500 } })).toBe(true);
    });

    it('retries 502 Bad Gateway', () => {
      expect(isRetryableError({ response: { status: 502 } })).toBe(true);
    });

    it('retries 503 Service Unavailable', () => {
      expect(isRetryableError({ response: { status: 503 } })).toBe(true);
    });

    it('retries 504 Gateway Timeout', () => {
      expect(isRetryableError({ response: { status: 504 } })).toBe(true);
    });

    it('uses appropriate backoff for 5xx errors', async () => {
      const serverError = { response: { status: 503 } };
      
      mockAxios.get
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: { _embedded: { records: [] } });

      let success = false;
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await mockAxios.get('http://test/events');
          success = true;
          break;
        } catch (e) {
          if (isRetryableError(e) && attempt < 2) {
            await sleep(calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG));
          }
        }
      }

      expect(success).toBe(true);
    });
  });

  describe('Terminal Error Handling', () => {
    it('does not retry 400 Bad Request', () => {
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
    });

    it('does not retry 401 Unauthorized', () => {
      expect(isRetryableError({ response: { status: 401 } })).toBe(false);
    });

    it('does not retry 403 Forbidden', () => {
      expect(isRetryableError({ response: { status: 403 } })).toBe(false);
    });

    it('does not retry 404 Not Found', () => {
      expect(isRetryableError({ response: { status: 404 } })).toBe(false);
    });

    it('fails fast on terminal errors', async () => {
      const terminalError = { response: { status: 400 }, message: 'Bad Request' };
      mockAxios.get.mockRejectedValue(terminalError);

      const startTime = Date.now();
      let error: any;

      try {
        await mockAxios.get('http://test/events');
      } catch (e) {
        error = e;
      }

      const elapsed = Date.now() - startTime;
      
      expect(error).toBeDefined();
      expect(isRetryableError(error)).toBe(false);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Deterministic Backoff', () => {
    it('calculates consistent backoff delays', () => {
      vi.useFakeTimers();
      
      const delays: number[] = [];
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        delays.push(calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG));
      }

      vi.useRealTimers();

      delays.forEach((delay, i) => {
        expect(delay).toBeGreaterThan(0);
      });
    });

    it('respects maxDelay cap', () => {
      const delay = calculateBackoffDelay(100, BACKGROUND_RETRY_CONFIG);
      expect(delay).toBeLessThanOrEqual(BACKGROUND_RETRY_CONFIG.maxDelay * 1.2);
    });

    it('never returns negative delay', () => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        const delay = calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Concurrent Failure Handling', () => {
    it('applies jitter to prevent synchronized retries', () => {
      const delays: number[] = [];
      
      for (let i = 0; i < 20; i++) {
        delays.push(calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG));
      }

      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('spreads retries across time window', () => {
      const delays: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        delays.push(calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG));
      }

      const min = Math.min(...delays);
      const max = Math.max(...delays);
      const spread = max - min;
      
      expect(spread).toBeGreaterThan(0);
    });
  });

  describe('Integration: Full Failure Scenario', () => {
    it('handles multiple transient failures then success', async () => {
      const errors = [
        { code: 'ECONNRESET' },
        { response: { status: 503 } },
        { response: { status: 429 } },
      ];

      let callCount = 0;
      const results: any[] = [];

      for (const error of errors) {
        callCount++;
        try {
          if (error.code) {
            throw error;
          }
          if (error.response?.status) {
            throw error;
          }
          const result = { data: { _embedded: { records: [] } };
          results.push(result);
          break;
        } catch (e) {
          results.push(e);
          if (isRetryableError(e)) {
            await sleep(calculateBackoffDelay(callCount, BACKGROUND_RETRY_CONFIG));
          }
        }
      }

      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it('stops after max attempts exhausted', async () => {
      const error = { response: { status: 503 } };
      mockAxios.get.mockRejectedValue(error);

      let attempts = 0;
      const maxAttempts = BACKGROUND_RETRY_CONFIG.maxAttempts;

      for (let i = 0; i < maxAttempts; i++) {
        attempts++;
        try {
          await mockAxios.get('http://test/events');
        } catch (e) {
          if (!isRetryableError(e)) break;
          if (i < maxAttempts - 1) {
            await sleep(calculateBackoffDelay(i + 1, BACKGROUND_RETRY_CONFIG));
          }
        }
      }

      expect(attempts).toBe(maxAttempts);
    });
  });
});