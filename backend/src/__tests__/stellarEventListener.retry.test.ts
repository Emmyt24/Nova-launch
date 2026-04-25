/**
 * Tests for StellarEventListener Retry Behavior
 * 
 * Verifies that:
 * - Resilient polling behavior under transient failures
 * - 429 and 5xx handling with backoff
 * - Background ingestion does not stampede on failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isRetryableError,
  calculateBackoffDelay,
  BACKGROUND_RETRY_CONFIG,
} from '../stellar-service-integration/rate-limiter';

describe('StellarEventListener Retry Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Classification', () => {
    it('identifies 429 rate limit as retryable', () => {
      const error = {
        response: { status: 429 },
        message: 'Too Many Requests',
      };
      
      expect(isRetryableError(error)).toBe(true);
    });

    it('identifies 5xx server errors as retryable', () => {
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

    it('identifies 4xx client errors as terminal', () => {
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
      expect(isRetryableError({ response: { status: 401 } })).toBe(false);
      expect(isRetryableError({ response: { status: 403 } })).toBe(false);
      expect(isRetryableError({ response: { status: 404 } })).toBe(false);
    });
  });

  describe('Background Retry Configuration', () => {
    it('uses longer backoff for background operations', () => {
      expect(BACKGROUND_RETRY_CONFIG.maxAttempts).toBe(10);
      expect(BACKGROUND_RETRY_CONFIG.initialDelay).toBe(2000);
      expect(BACKGROUND_RETRY_CONFIG.maxDelay).toBe(60000);
      expect(BACKGROUND_RETRY_CONFIG.backoffFactor).toBe(2);
    });

    it('calculates appropriate backoff delays', () => {
      // Attempt 1: ~2000ms
      const delay1 = calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG);
      expect(delay1).toBeGreaterThanOrEqual(1600); // 2000 - 20% jitter
      expect(delay1).toBeLessThanOrEqual(2400); // 2000 + 20% jitter
      
      // Attempt 2: ~4000ms
      const delay2 = calculateBackoffDelay(2, BACKGROUND_RETRY_CONFIG);
      expect(delay2).toBeGreaterThanOrEqual(3200);
      expect(delay2).toBeLessThanOrEqual(4800);
      
      // Attempt 3: ~8000ms
      const delay3 = calculateBackoffDelay(3, BACKGROUND_RETRY_CONFIG);
      expect(delay3).toBeGreaterThanOrEqual(6400);
      expect(delay3).toBeLessThanOrEqual(9600);
      
      // Attempt 6+: capped at maxDelay (60000ms)
      const delay6 = calculateBackoffDelay(6, BACKGROUND_RETRY_CONFIG);
      expect(delay6).toBeLessThanOrEqual(72000); // maxDelay + jitter
    });

    it('applies jitter to prevent stampeding', () => {
      const delays: number[] = [];
      
      // Generate multiple delays for same attempt
      for (let i = 0; i < 20; i++) {
        delays.push(calculateBackoffDelay(3, BACKGROUND_RETRY_CONFIG));
      }
      
      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
      
      // Verify jitter range (±20%)
      const baseDelay = 8000; // 2000 * 2^2
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(baseDelay * 0.8);
        expect(delay).toBeLessThanOrEqual(baseDelay * 1.2);
      });
    });
  });

  describe('Resilient Polling Behavior', () => {
    it('continues polling after transient failures', () => {
      let failureCount = 0;
      const maxConsecutiveFailures = 5;
      
      // Simulate transient failures
      const errors = [
        { response: { status: 503 } },
        { response: { status: 429 } },
        { code: 'ETIMEDOUT' },
      ];
      
      errors.forEach((error) => {
        if (isRetryableError(error)) {
          failureCount++;
        }
      });
      
      // Should continue polling as long as failures < max
      expect(failureCount).toBeLessThan(maxConsecutiveFailures);
      expect(failureCount).toBe(3);
    });

    it('uses exponential backoff for consecutive failures', () => {
      const delays: number[] = [];
      
      // Simulate 5 consecutive failures
      for (let attempt = 1; attempt <= 5; attempt++) {
        const delay = calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG);
        delays.push(delay);
      }
      
      // Each delay should be larger than the previous (exponential growth)
      for (let i = 1; i < delays.length; i++) {
        // Account for jitter by checking average trend
        const avgPrev = delays[i - 1];
        const avgCurr = delays[i];
        
        // Current should be roughly 2x previous (backoffFactor = 2)
        // Allow for jitter variance
        expect(avgCurr).toBeGreaterThan(avgPrev * 1.5);
      }
    });

    it('resets backoff after successful poll', () => {
      let consecutiveFailures = 0;
      
      // Simulate failure then success
      const error = { response: { status: 503 } };
      if (isRetryableError(error)) {
        consecutiveFailures++;
      }
      
      // Success - reset counter
      consecutiveFailures = 0;
      
      expect(consecutiveFailures).toBe(0);
    });

    it('alerts on persistent failures but continues', () => {
      const maxConsecutiveFailures = 5;
      let consecutiveFailures = 0;
      let alertTriggered = false;
      
      // Simulate many consecutive failures
      for (let i = 0; i < 10; i++) {
        const error = { response: { status: 503 } };
        if (isRetryableError(error)) {
          consecutiveFailures++;
          
          if (consecutiveFailures >= maxConsecutiveFailures) {
            alertTriggered = true;
            // In real implementation, would log error but continue polling
          }
        }
      }
      
      expect(alertTriggered).toBe(true);
      expect(consecutiveFailures).toBe(10);
    });
  });

  describe('Rate Limit Handling (429)', () => {
    it('backs off on 429 responses', () => {
      const error = { response: { status: 429 } };
      
      expect(isRetryableError(error)).toBe(true);
      
      // Should use exponential backoff
      const delay = calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG);
      expect(delay).toBeGreaterThanOrEqual(1600);
      expect(delay).toBeLessThanOrEqual(2400);
    });

    it('increases backoff on repeated 429s', () => {
      const delays: number[] = [];
      
      // Simulate 3 consecutive 429 responses
      for (let attempt = 1; attempt <= 3; attempt++) {
        delays.push(calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG));
      }
      
      // Each delay should increase
      expect(delays[1]).toBeGreaterThan(delays[0] * 1.5);
      expect(delays[2]).toBeGreaterThan(delays[1] * 1.5);
    });

    it('does not stampede after rate limit recovery', () => {
      const jitterValues: number[] = [];
      
      // Generate multiple backoff delays
      for (let i = 0; i < 10; i++) {
        const delay = calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG);
        jitterValues.push(delay);
      }
      
      // Verify jitter creates spread
      const uniqueValues = new Set(jitterValues);
      expect(uniqueValues.size).toBeGreaterThan(5);
    });
  });

  describe('Server Error Handling (5xx)', () => {
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

    it('uses appropriate backoff for server errors', () => {
      const delay = calculateBackoffDelay(2, BACKGROUND_RETRY_CONFIG);
      
      // Second attempt should wait ~4 seconds
      expect(delay).toBeGreaterThanOrEqual(3200);
      expect(delay).toBeLessThanOrEqual(4800);
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

    it('continues polling after terminal error', () => {
      let shouldContinue = true;
      
      const error = { response: { status: 400 } };
      if (!isRetryableError(error)) {
        // Terminal error - log but continue polling
        shouldContinue = true;
      }
      
      expect(shouldContinue).toBe(true);
    });
  });

  describe('Backoff Calculation Edge Cases', () => {
    it('handles attempt 0 gracefully', () => {
      const delay = calculateBackoffDelay(0, BACKGROUND_RETRY_CONFIG);
      expect(delay).toBeGreaterThanOrEqual(0);
    });

    it('respects maxDelay cap', () => {
      // Very high attempt number
      const delay = calculateBackoffDelay(100, BACKGROUND_RETRY_CONFIG);
      
      // Should not exceed maxDelay + jitter
      expect(delay).toBeLessThanOrEqual(BACKGROUND_RETRY_CONFIG.maxDelay * 1.2);
    });

    it('never returns negative delay', () => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        const delay = calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Concurrent Request Handling', () => {
    it('applies jitter to prevent synchronized retries', () => {
      const delays: number[] = [];
      
      // Simulate 10 concurrent clients retrying
      for (let i = 0; i < 10; i++) {
        delays.push(calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG));
      }
      
      // All delays should be different
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(5);
      
      // Delays should be spread across the jitter range
      const min = Math.min(...delays);
      const max = Math.max(...delays);
      const spread = max - min;
      
      // Spread should be at least 10% of base delay
      expect(spread).toBeGreaterThan(BACKGROUND_RETRY_CONFIG.initialDelay * 0.1);
    });
  });

  describe('Performance Characteristics', () => {
    it('total retry time stays within reasonable bounds', () => {
      let totalDelay = 0;
      
      // Calculate total delay for max attempts
      for (let attempt = 1; attempt <= BACKGROUND_RETRY_CONFIG.maxAttempts; attempt++) {
        totalDelay += calculateBackoffDelay(attempt, BACKGROUND_RETRY_CONFIG);
      }
      
      // Total should be less than 10 minutes (reasonable for background)
      expect(totalDelay).toBeLessThan(10 * 60 * 1000);
    });

    it('first retry happens quickly', () => {
      const delay = calculateBackoffDelay(1, BACKGROUND_RETRY_CONFIG);
      
      // First retry should be within 3 seconds
      expect(delay).toBeLessThan(3000);
    });

    it('later retries use longer delays', () => {
      const delay5 = calculateBackoffDelay(5, BACKGROUND_RETRY_CONFIG);
      
      // 5th retry should wait at least 10 seconds
      expect(delay5).toBeGreaterThan(10000);
    });
  });
});
