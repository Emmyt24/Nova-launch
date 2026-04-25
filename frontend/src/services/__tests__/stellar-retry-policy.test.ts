/**
 * Tests for Stellar Retry Policy
 * 
 * Verifies that:
 * - Transient 429 and 5xx responses are retried with backoff
 * - Terminal errors are not retried forever
 * - UI still surfaces responsive error states
 * - Bounded retry limits are respected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  isRetryableError,
  calculateBackoffDelay,
  USER_RETRY_CONFIG,
  RateLimiter,
  sleep,
} from '../../utils/retry';

describe('Stellar Retry Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isRetryableError', () => {
    it('identifies 429 as retryable', () => {
      const error = { response: { status: 429 } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('identifies 5xx errors as retryable', () => {
      expect(isRetryableError({ response: { status: 500 } })).toBe(true);
      expect(isRetryableError({ response: { status: 502 } })).toBe(true);
      expect(isRetryableError({ response: { status: 503 } })).toBe(true);
      expect(isRetryableError({ response: { status: 504 } })).toBe(true);
    });

    it('identifies network errors as retryable', () => {
      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryableError({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('identifies timeout messages as retryable', () => {
      expect(isRetryableError({ message: 'Request timeout' })).toBe(true);
      expect(isRetryableError({ message: 'Network timeout occurred' })).toBe(true);
    });

    it('identifies 4xx errors (except 429) as terminal', () => {
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
      expect(isRetryableError({ response: { status: 401 } })).toBe(false);
      expect(isRetryableError({ response: { status: 403 } })).toBe(false);
      expect(isRetryableError({ response: { status: 404 } })).toBe(false);
      expect(isRetryableError({ response: { status: 422 } })).toBe(false);
    });

    it('identifies validation errors as terminal', () => {
      expect(isRetryableError({ message: 'Invalid address format' })).toBe(false);
      expect(isRetryableError({ code: 'INVALID_INPUT' })).toBe(false);
    });
  });

  describe('calculateBackoffDelay', () => {
    it('calculates exponential backoff correctly', () => {
      const config = USER_RETRY_CONFIG;
      
      // Attempt 1: initialDelay * backoffFactor^0 = 500 * 1 = 500ms
      const delay1 = calculateBackoffDelay(1, config);
      expect(delay1).toBeGreaterThanOrEqual(450); // 500 - 10% jitter
      expect(delay1).toBeLessThanOrEqual(550); // 500 + 10% jitter
      
      // Attempt 2: initialDelay * backoffFactor^1 = 500 * 2 = 1000ms
      const delay2 = calculateBackoffDelay(2, config);
      expect(delay2).toBeGreaterThanOrEqual(900);
      expect(delay2).toBeLessThanOrEqual(1100);
      
      // Attempt 3: initialDelay * backoffFactor^2 = 500 * 4 = 2000ms
      const delay3 = calculateBackoffDelay(3, config);
      expect(delay3).toBeGreaterThanOrEqual(1800);
      expect(delay3).toBeLessThanOrEqual(2200);
    });

    it('respects maxDelay cap', () => {
      const config = { ...USER_RETRY_CONFIG, maxDelay: 1000 };
      
      // Even with high attempt number, should not exceed maxDelay
      const delay = calculateBackoffDelay(10, config);
      expect(delay).toBeLessThanOrEqual(1100); // maxDelay + jitter
    });

    it('applies jitter to prevent thundering herd', () => {
      const config = USER_RETRY_CONFIG;
      const delays: number[] = [];
      
      // Generate multiple delays for same attempt
      for (let i = 0; i < 10; i++) {
        delays.push(calculateBackoffDelay(2, config));
      }
      
      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('withRetry', () => {
    it('succeeds on first attempt without retry', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation, USER_RETRY_CONFIG, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries transient 429 errors with backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, USER_RETRY_CONFIG, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('retries 5xx server errors', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, USER_RETRY_CONFIG, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('does not retry terminal 4xx errors', async () => {
      const operation = vi.fn()
        .mockRejectedValue({ response: { status: 400 } });
      
      await expect(
        withRetry(operation, USER_RETRY_CONFIG, 'test-op')
      ).rejects.toEqual({ response: { status: 400 } });
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('respects maxAttempts limit', async () => {
      const operation = vi.fn()
        .mockRejectedValue({ response: { status: 503 } });
      
      const config = { ...USER_RETRY_CONFIG, maxAttempts: 3 };
      
      await expect(
        withRetry(operation, config, 'test-op')
      ).rejects.toEqual({ response: { status: 503 } });
      
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('applies timeout to operations', async () => {
      const operation = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );
      
      const config = { ...USER_RETRY_CONFIG, timeout: 100 };
      
      await expect(
        withRetry(operation, config, 'test-op')
      ).rejects.toThrow('timeout');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('surfaces responsive error states to UI', async () => {
      const operation = vi.fn()
        .mockRejectedValue({ response: { status: 400 }, message: 'Bad request' });
      
      const startTime = Date.now();
      
      try {
        await withRetry(operation, USER_RETRY_CONFIG, 'test-op');
      } catch (error: any) {
        const elapsed = Date.now() - startTime;
        
        // Should fail fast (< 100ms) for terminal errors
        expect(elapsed).toBeLessThan(100);
        expect(error.message).toBe('Bad request');
      }
    });

    it('waits with backoff between retries', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      
      await withRetry(operation, USER_RETRY_CONFIG, 'test-op');
      
      const elapsed = Date.now() - startTime;
      
      // Should have waited ~500ms (initialDelay) between attempts
      expect(elapsed).toBeGreaterThanOrEqual(400); // Account for jitter
      expect(elapsed).toBeLessThan(1000); // Should not wait too long
    });
  });

  describe('RateLimiter', () => {
    it('allows requests under the limit', () => {
      const limiter = new RateLimiter(5, 1000);
      
      expect(() => {
        for (let i = 0; i < 5; i++) {
          limiter.checkLimit();
        }
      }).not.toThrow();
    });

    it('throws when limit is exceeded', () => {
      const limiter = new RateLimiter(3, 1000);
      
      limiter.checkLimit();
      limiter.checkLimit();
      limiter.checkLimit();
      
      expect(() => limiter.checkLimit()).toThrow('Rate limit exceeded');
    });

    it('returns correct remaining requests', () => {
      const limiter = new RateLimiter(5, 1000);
      
      expect(limiter.getRemainingRequests()).toBe(5);
      limiter.checkLimit();
      expect(limiter.getRemainingRequests()).toBe(4);
      limiter.checkLimit();
      expect(limiter.getRemainingRequests()).toBe(3);
    });

    it('resets correctly', () => {
      const limiter = new RateLimiter(3, 1000);
      
      limiter.checkLimit();
      limiter.checkLimit();
      limiter.checkLimit();
      
      limiter.reset();
      
      expect(limiter.getRemainingRequests()).toBe(3);
      expect(() => limiter.checkLimit()).not.toThrow();
    });

    it('allows requests after window expires', async () => {
      const limiter = new RateLimiter(2, 50); // 50ms window
      
      limiter.checkLimit();
      limiter.checkLimit();
      
      expect(() => limiter.checkLimit()).toThrow();
      
      // Wait for window to expire
      await sleep(60);
      
      expect(() => limiter.checkLimit()).not.toThrow();
    });
  });

  describe('Integration: Retry with Rate Limiting', () => {
    it('handles rate limit errors with backoff', async () => {
      const limiter = new RateLimiter(2, 1000);
      let callCount = 0;
      
      const operation = async () => {
        callCount++;
        limiter.checkLimit();
        
        if (callCount <= 2) {
          throw { response: { status: 429 } };
        }
        
        return 'success';
      };
      
      const result = await withRetry(operation, USER_RETRY_CONFIG, 'rate-limited-op');
      
      expect(result).toBe('success');
      expect(callCount).toBe(3);
    });
  });

  describe('User-Path vs Background Retry Behavior', () => {
    it('user-path retries fail fast (3 attempts)', async () => {
      const operation = vi.fn().mockRejectedValue({ response: { status: 503 } });
      
      await expect(
        withRetry(operation, USER_RETRY_CONFIG, 'user-op')
      ).rejects.toBeDefined();
      
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('background retries use longer backoff', () => {
      const backgroundConfig = {
        maxAttempts: 10,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffFactor: 2,
        jitterFactor: 0.2,
      };
      
      // Attempt 1: ~2000ms
      const delay1 = calculateBackoffDelay(1, backgroundConfig);
      expect(delay1).toBeGreaterThanOrEqual(1600);
      expect(delay1).toBeLessThanOrEqual(2400);
      
      // Attempt 5: ~32000ms
      const delay5 = calculateBackoffDelay(5, backgroundConfig);
      expect(delay5).toBeGreaterThanOrEqual(25600);
      expect(delay5).toBeLessThanOrEqual(38400);
    });
  });
});
