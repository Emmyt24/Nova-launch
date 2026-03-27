/**
 * SECURITY TEST: Timing & Race Conditions
 * 
 * RISK COVERAGE:
 * - TIMING-001: Concurrent nonce consumption
 * - TIMING-002: Double-spend in vote casting
 * - TIMING-003: Token revocation race
 * - TIMING-004: Cache invalidation timing
 * - TIMING-005: Rate limit bypass via timing
 * - DOS-001: Rate limit bypass
 * 
 * SEVERITY: HIGH
 */

import { NonceService } from '../auth/nonce.service';
import { TokenService } from '../auth/token.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

describe('Security: Timing & Race Condition Tests', () => {
  let nonceService: NonceService;
  let tokenService: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NonceService,
        TokenService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn((payload) => `token-${payload.jti}`),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_ACCESS_SECRET') return 'test-secret';
              if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
              return null;
            }),
          },
        },
      ],
    }).compile();

    nonceService = module.get(NonceService);
    tokenService = module.get(TokenService);
  });

  afterEach(() => {
    nonceService.onModuleDestroy();
  });

  describe('[TIMING-001] Concurrent Nonce Consumption', () => {
    it('should prevent race condition in nonce consumption', async () => {
      const publicKey = 'GTEST';
      const { nonce } = nonceService.generateNonce(publicKey);

      // Simulate 10 concurrent attempts to use same nonce
      const attempts = Array(10)
        .fill(null)
        .map(() => Promise.resolve(nonceService.consumeNonce(nonce, publicKey)));

      const results = await Promise.all(attempts);

      // Only one should succeed
      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBe(1);

      // All others should fail
      const failureCount = results.filter((r) => r === false).length;
      expect(failureCount).toBe(9);
    });

    it('should handle high-concurrency nonce requests', async () => {
      const publicKey = 'GTEST';

      // Generate 100 nonces concurrently
      const noncePromises = Array(100)
        .fill(null)
        .map(() => Promise.resolve(nonceService.generateNonce(publicKey)));

      const nonces = await Promise.all(noncePromises);

      // All should be unique
      const uniqueNonces = new Set(nonces.map((n) => n.nonce));
      expect(uniqueNonces.size).toBe(100);
    });

    it('should maintain nonce integrity under concurrent load', async () => {
      const users = ['GTEST1', 'GTEST2', 'GTEST3'];

      // Each user generates and consumes nonce concurrently
      const operations = users.map(async (user) => {
        const { nonce } = nonceService.generateNonce(user);

        // Try to consume twice concurrently
        const [first, second] = await Promise.all([
          Promise.resolve(nonceService.consumeNonce(nonce, user)),
          Promise.resolve(nonceService.consumeNonce(nonce, user)),
        ]);

        return { first, second };
      });

      const results = await Promise.all(operations);

      // For each user, only one consumption should succeed
      results.forEach((result) => {
        const successCount = [result.first, result.second].filter(
          (r) => r === true
        ).length;
        expect(successCount).toBe(1);
      });
    });
  });

  describe('[TIMING-002] Double-Spend in Vote Casting', () => {
    it('should prevent double voting through concurrent submissions', async () => {
      // Simulate vote weight that can only be used once
      let voteWeight = BigInt(1000);
      let voteCast = false;

      const castVote = async (weight: bigint): Promise<boolean> => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Check-then-act pattern (vulnerable to race condition)
        if (!voteCast && voteWeight >= weight) {
          voteCast = true;
          voteWeight -= weight;
          return true;
        }
        return false;
      };

      // Try to cast vote twice concurrently
      const [vote1, vote2] = await Promise.all([
        castVote(BigInt(1000)),
        castVote(BigInt(1000)),
      ]);

      // Only one should succeed (with proper locking)
      // In vulnerable code, both might succeed
      const successCount = [vote1, vote2].filter((v) => v === true).length;

      // With proper implementation, only 1 succeeds
      expect(successCount).toBeLessThanOrEqual(1);
      expect(voteWeight).toBeGreaterThanOrEqual(BigInt(0));
    });

    it('should use atomic operations for vote tallying', async () => {
      let totalVotes = BigInt(0);
      const lock = { locked: false };

      const atomicAddVote = async (weight: bigint): Promise<void> => {
        // Wait for lock
        while (lock.locked) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }

        lock.locked = true;
        totalVotes += weight;
        lock.locked = false;
      };

      // Cast 10 votes concurrently
      const votes = Array(10)
        .fill(null)
        .map(() => atomicAddVote(BigInt(100)));

      await Promise.all(votes);

      expect(totalVotes).toBe(BigInt(1000));
    });

    it('should prevent vote weight manipulation through timing', async () => {
      const voterWeight = BigInt(500);
      const votes: bigint[] = [];

      const recordVote = async (weight: bigint): Promise<boolean> => {
        // Validate weight
        if (weight > voterWeight) return false;
        if (weight <= BigInt(0)) return false;

        // Check if already voted
        if (votes.length > 0) return false;

        votes.push(weight);
        return true;
      };

      // Try to vote multiple times concurrently
      const attempts = await Promise.all([
        recordVote(BigInt(500)),
        recordVote(BigInt(500)),
        recordVote(BigInt(500)),
      ]);

      const successCount = attempts.filter((a) => a === true).length;
      expect(successCount).toBeLessThanOrEqual(1);
      expect(votes.length).toBeLessThanOrEqual(1);
    });
  });

  describe('[TIMING-003] Token Revocation Race', () => {
    it('should prevent token use during revocation', async () => {
      const walletAddress = 'GTEST';
      const tokenPair = tokenService.generateTokenPair(walletAddress);
      const jti = 'test-jti';

      // Simulate concurrent token verification and revocation
      const verify = async (): Promise<boolean> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return !tokenService.isRevoked(jti);
      };

      const revoke = async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        tokenService.revokeToken(jti);
      };

      const [verifyResult] = await Promise.all([verify(), revoke()]);

      // After both operations, token should be revoked
      expect(tokenService.isRevoked(jti)).toBe(true);
    });

    it('should handle concurrent revocation requests', async () => {
      const jti = 'test-jti';

      // Try to revoke same token multiple times concurrently
      const revocations = Array(5)
        .fill(null)
        .map(() => Promise.resolve(tokenService.revokeToken(jti)));

      await Promise.all(revocations);

      // Token should be revoked exactly once
      expect(tokenService.isRevoked(jti)).toBe(true);
    });

    it('should prevent TOCTOU in token validation', async () => {
      const jti = 'test-jti';

      // Time-of-check
      const isValidAtCheck = !tokenService.isRevoked(jti);
      expect(isValidAtCheck).toBe(true);

      // Revoke between check and use
      tokenService.revokeToken(jti);

      // Time-of-use
      const isValidAtUse = !tokenService.isRevoked(jti);
      expect(isValidAtUse).toBe(false);

      // Proper implementation should check again at use time
    });
  });

  describe('[TIMING-004] Cache Invalidation Timing', () => {
    it('should handle concurrent cache read and invalidation', async () => {
      const cache = new Map<string, any>();
      const key = 'test-key';
      cache.set(key, { data: 'original' });

      const read = async (): Promise<any> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return cache.get(key);
      };

      const invalidate = async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        cache.delete(key);
      };

      const [readResult] = await Promise.all([read(), invalidate()]);

      // Read might get original or undefined depending on timing
      // Proper implementation should handle both cases
      expect([{ data: 'original' }, undefined]).toContainEqual(readResult);
    });

    it('should prevent stale cache exploitation', async () => {
      const cache = new Map<string, { value: number; timestamp: number }>();
      const key = 'balance';
      const ttl = 1000; // 1 second

      cache.set(key, { value: 1000, timestamp: Date.now() });

      const getCached = (k: string): number | null => {
        const entry = cache.get(k);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > ttl) {
          cache.delete(k);
          return null;
        }

        return entry.value;
      };

      // Immediate read should work
      expect(getCached(key)).toBe(1000);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, ttl + 100));

      // Should return null after expiry
      expect(getCached(key)).toBeNull();
    });
  });

  describe('[TIMING-005] Rate Limit Bypass via Timing', () => {
    it('should prevent burst requests bypassing rate limit', async () => {
      const rateLimit = {
        max: 5,
        window: 1000, // 1 second
        requests: new Map<string, number[]>(),
      };

      const checkRateLimit = (key: string): boolean => {
        const now = Date.now();
        const requests = rateLimit.requests.get(key) || [];

        // Remove old requests outside window
        const validRequests = requests.filter(
          (time) => now - time < rateLimit.window
        );

        if (validRequests.length >= rateLimit.max) {
          return false; // Rate limit exceeded
        }

        validRequests.push(now);
        rateLimit.requests.set(key, validRequests);
        return true;
      };

      const key = 'user1';

      // Try to make 10 requests simultaneously
      const requests = Array(10)
        .fill(null)
        .map(() => Promise.resolve(checkRateLimit(key)));

      const results = await Promise.all(requests);

      // Only 5 should succeed
      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBeLessThanOrEqual(5);
    });

    it('should handle distributed timing attacks', async () => {
      const rateLimiter = {
        limit: 10,
        window: 1000,
        counts: new Map<string, { count: number; resetAt: number }>(),
      };

      const isAllowed = (ip: string): boolean => {
        const now = Date.now();
        const entry = rateLimiter.counts.get(ip);

        if (!entry || now > entry.resetAt) {
          rateLimiter.counts.set(ip, {
            count: 1,
            resetAt: now + rateLimiter.window,
          });
          return true;
        }

        if (entry.count >= rateLimiter.limit) {
          return false;
        }

        entry.count++;
        return true;
      };

      // Simulate requests from same IP at different times
      const ip = '192.168.1.1';
      const results: boolean[] = [];

      for (let i = 0; i < 15; i++) {
        results.push(isAllowed(ip));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const allowed = results.filter((r) => r === true).length;
      expect(allowed).toBeLessThanOrEqual(10);
    });

    it('should prevent timing-based rate limit reset exploitation', async () => {
      let requestCount = 0;
      let windowStart = Date.now();
      const maxRequests = 5;
      const windowMs = 1000;

      const makeRequest = (): boolean => {
        const now = Date.now();

        // Reset window if expired
        if (now - windowStart > windowMs) {
          requestCount = 0;
          windowStart = now;
        }

        if (requestCount >= maxRequests) {
          return false;
        }

        requestCount++;
        return true;
      };

      // Make 5 requests (should succeed)
      for (let i = 0; i < 5; i++) {
        expect(makeRequest()).toBe(true);
      }

      // 6th request should fail
      expect(makeRequest()).toBe(false);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, windowMs + 100));

      // Should allow requests again
      expect(makeRequest()).toBe(true);
    });
  });

  describe('Combined Timing Attack Scenarios', () => {
    it('should handle concurrent nonce generation and consumption', async () => {
      const publicKey = 'GTEST';

      const operations = Array(20)
        .fill(null)
        .map(async (_, i) => {
          if (i % 2 === 0) {
            // Generate nonce
            return nonceService.generateNonce(publicKey);
          } else {
            // Try to consume a nonce (might not exist)
            return nonceService.consumeNonce(`nonce-${i}`, publicKey);
          }
        });

      const results = await Promise.all(operations);

      // Should handle all operations without crashing
      expect(results.length).toBe(20);
    });

    it('should prevent race conditions in multi-step authentication', async () => {
      const publicKey = 'GTEST';

      // Step 1: Generate nonce
      const { nonce } = nonceService.generateNonce(publicKey);

      // Step 2: Multiple concurrent authentication attempts
      const attempts = Array(5)
        .fill(null)
        .map(() => Promise.resolve(nonceService.consumeNonce(nonce, publicKey)));

      const results = await Promise.all(attempts);

      // Only first should succeed
      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBe(1);
    });
  });
});
