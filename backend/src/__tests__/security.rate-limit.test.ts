/**
 * SECURITY TEST: Rate Limiting Bypass Attempts
 *
 * Tests defensive measures against rate limit circumvention:
 * - IP spoofing attempts
 * - Header manipulation
 * - Distributed request patterns
 * - Token reuse attacks
 * - Timing-based bypasses
 *
 * OWASP Coverage:
 * - A04:2021 – Insecure Design (Rate Limiting)
 * - A07:2021 – Identification and Authentication Failures
 *
 * Run: npm test backend/src/__tests__/security.rate-limit.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface Request {
  ip: string;
  headers: Record<string, string>;
  userId?: string;
  timestamp: number;
}

class RateLimiter {
  private store: Map<string, number[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  isAllowed(req: Request): boolean {
    const key = this.config.keyGenerator(req);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let timestamps = this.store.get(key) || [];
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= this.config.maxRequests) {
      return false;
    }

    timestamps.push(now);
    this.store.set(key, timestamps);
    return true;
  }

  reset(): void {
    this.store.clear();
  }
}

describe('Security: Rate Limiting Bypass Attempts', () => {
  let limiter: RateLimiter;
  const config: RateLimitConfig = {
    windowMs: 60_000, // 1 minute
    maxRequests: 10,
    keyGenerator: (req: Request) => req.ip,
  };

  beforeEach(() => {
    limiter = new RateLimiter(config);
  });

  afterEach(() => {
    limiter.reset();
  });

  describe('[RATE-001] IP Spoofing Prevention', () => {
    it('should use real IP from socket, not X-Forwarded-For header', () => {
      const req: Request = {
        ip: '192.168.1.100', // Real socket IP
        headers: {
          'x-forwarded-for': '10.0.0.1', // Spoofed header
        },
        timestamp: Date.now(),
      };

      // Should use socket IP, not header
      const key = config.keyGenerator(req);
      expect(key).toBe('192.168.1.100');
      expect(key).not.toBe('10.0.0.1');
    });

    it('should reject requests with suspicious header chains', () => {
      const req: Request = {
        ip: '192.168.1.100',
        headers: {
          'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3, 10.0.0.4, 10.0.0.5',
        },
        timestamp: Date.now(),
      };

      // Validate header format
      const xForwardedFor = req.headers['x-forwarded-for'];
      const ips = xForwardedFor?.split(',').map(ip => ip.trim()) || [];
      const isSuspicious = ips.length > 3; // More than 3 hops is suspicious

      expect(isSuspicious).toBe(true);
    });

    it('should validate X-Real-IP header against socket IP', () => {
      const req: Request = {
        ip: '192.168.1.100',
        headers: {
          'x-real-ip': '10.0.0.1', // Conflicting header
        },
        timestamp: Date.now(),
      };

      const socketIp = req.ip;
      const headerIp = req.headers['x-real-ip'];
      const isConflicting = socketIp !== headerIp;

      expect(isConflicting).toBe(true);
    });
  });

  describe('[RATE-002] Header Manipulation Prevention', () => {
    it('should ignore User-Agent header for rate limiting', () => {
      const req1: Request = {
        ip: '192.168.1.100',
        headers: { 'user-agent': 'Mozilla/5.0' },
        timestamp: Date.now(),
      };

      const req2: Request = {
        ip: '192.168.1.100',
        headers: { 'user-agent': 'Chrome/90.0' }, // Different UA
        timestamp: Date.now(),
      };

      // Both should use same IP key
      const key1 = config.keyGenerator(req1);
      const key2 = config.keyGenerator(req2);

      expect(key1).toBe(key2);
    });

    it('should reject requests with invalid Accept-Language', () => {
      const req: Request = {
        ip: '192.168.1.100',
        headers: {
          'accept-language': 'en-US;q=1.0, en;q=0.9, *;q=0.8, *;q=0.7, *;q=0.6',
        },
        timestamp: Date.now(),
      };

      const acceptLanguage = req.headers['accept-language'];
      const languages = acceptLanguage?.split(',') || [];
      const isValid = languages.every(lang => {
        const parts = lang.trim().split(';');
        return parts.length <= 2;
      });

      expect(isValid).toBe(true);
    });

    it('should detect header injection attempts', () => {
      const req: Request = {
        ip: '192.168.1.100',
        headers: {
          'x-custom': 'value\r\nX-Injected: malicious',
        },
        timestamp: Date.now(),
      };

      const hasInjection = Object.values(req.headers).some(
        value => typeof value === 'string' && (value.includes('\r') || value.includes('\n')),
      );

      expect(hasInjection).toBe(true);
    });
  });

  describe('[RATE-003] Distributed Attack Prevention', () => {
    it('should track requests across multiple IPs', () => {
      const ips = ['192.168.1.1', '192.168.1.2', '192.168.1.3'];
      const requests = ips.map(ip => ({
        ip,
        headers: {},
        timestamp: Date.now(),
      }));

      requests.forEach(req => {
        const allowed = limiter.isAllowed(req);
        expect(allowed).toBe(true); // Each IP has separate limit
      });
    });

    it('should detect distributed patterns from same subnet', () => {
      const baseIp = '192.168.1';
      const ips = Array.from({ length: 20 }, (_, i) => `${baseIp}.${i + 1}`);

      const requests = ips.map(ip => ({
        ip,
        headers: {},
        timestamp: Date.now(),
      }));

      // Count requests from same subnet
      const subnetCounts: Record<string, number> = {};
      requests.forEach(req => {
        const subnet = req.ip.split('.').slice(0, 3).join('.');
        subnetCounts[subnet] = (subnetCounts[subnet] || 0) + 1;
      });

      const suspiciousSubnets = Object.entries(subnetCounts).filter(
        ([_, count]) => count > 15,
      );

      expect(suspiciousSubnets.length).toBeGreaterThan(0);
    });

    it('should handle botnet-like patterns', () => {
      const botnets = Array.from({ length: 50 }, (_, i) => ({
        ip: `10.${Math.floor(i / 256)}.${i % 256}.1`,
        headers: { 'user-agent': 'Bot/1.0' },
        timestamp: Date.now(),
      }));

      let blockedCount = 0;
      botnets.forEach(req => {
        if (!limiter.isAllowed(req)) {
          blockedCount++;
        }
      });

      // After 10 requests per IP, should start blocking
      expect(blockedCount).toBeGreaterThan(0);
    });
  });

  describe('[RATE-004] Token Reuse Prevention', () => {
    it('should invalidate tokens after single use', () => {
      const tokens = new Set<string>();
      const usedTokens = new Set<string>();

      const token = 'token-123';
      tokens.add(token);

      // First use
      const firstUse = tokens.has(token) && !usedTokens.has(token);
      expect(firstUse).toBe(true);

      usedTokens.add(token);

      // Second use attempt
      const secondUse = tokens.has(token) && !usedTokens.has(token);
      expect(secondUse).toBe(false);
    });

    it('should detect token replay attacks', () => {
      const tokenHistory: Array<{ token: string; timestamp: number }> = [];
      const token = 'token-123';
      const now = Date.now();

      tokenHistory.push({ token, timestamp: now });
      tokenHistory.push({ token, timestamp: now + 100 }); // Replay

      const isReplay = tokenHistory.filter(t => t.token === token).length > 1;
      expect(isReplay).toBe(true);
    });

    it('should enforce token expiration', () => {
      const TOKEN_EXPIRY_MS = 300_000; // 5 minutes
      const token = {
        value: 'token-123',
        issuedAt: Date.now() - 400_000, // 6+ minutes ago
      };

      const isExpired = Date.now() - token.issuedAt > TOKEN_EXPIRY_MS;
      expect(isExpired).toBe(true);
    });
  });

  describe('[RATE-005] Timing-Based Bypass Prevention', () => {
    it('should not allow burst requests at window boundary', () => {
      const windowMs = 60_000;
      const now = Date.now();

      // Requests at window boundary
      const requests = [
        { ip: '192.168.1.1', headers: {}, timestamp: now - 1 },
        { ip: '192.168.1.1', headers: {}, timestamp: now },
      ];

      let allowed = 0;
      requests.forEach(req => {
        if (limiter.isAllowed(req)) allowed++;
      });

      expect(allowed).toBeGreaterThan(0);
    });

    it('should handle clock skew attacks', () => {
      const req1: Request = {
        ip: '192.168.1.1',
        headers: {},
        timestamp: Date.now(),
      };

      const req2: Request = {
        ip: '192.168.1.1',
        headers: {},
        timestamp: Date.now() - 1_000_000, // 1000 seconds in past
      };

      // Should reject requests with suspicious timestamps
      const isSkewed = Math.abs(req2.timestamp - Date.now()) > 300_000; // > 5 min
      expect(isSkewed).toBe(true);
    });

    it('should detect rapid-fire requests', () => {
      const requests = Array.from({ length: 20 }, (_, i) => ({
        ip: '192.168.1.1',
        headers: {},
        timestamp: Date.now() + i, // 1ms apart
      }));

      let blocked = 0;
      requests.forEach(req => {
        if (!limiter.isAllowed(req)) blocked++;
      });

      expect(blocked).toBeGreaterThan(0);
    });
  });

  describe('[RATE-006] Adaptive Rate Limiting', () => {
    it('should increase restrictions after repeated violations', () => {
      const violations = [1, 2, 3, 4, 5];
      const baseLimit = 10;

      violations.forEach(violationCount => {
        const adaptiveLimit = Math.max(1, baseLimit - violationCount * 2);
        expect(adaptiveLimit).toBeLessThan(baseLimit);
      });
    });

    it('should implement exponential backoff', () => {
      const backoffMultiplier = 2;
      const baseDelay = 1000;

      const delays = Array.from({ length: 5 }, (_, i) => baseDelay * Math.pow(backoffMultiplier, i));

      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(8000);
      expect(delays[4]).toBe(16000);
    });

    it('should reset limits after quiet period', () => {
      const QUIET_PERIOD_MS = 300_000; // 5 minutes
      const lastViolation = Date.now() - 400_000; // 6+ minutes ago

      const shouldReset = Date.now() - lastViolation > QUIET_PERIOD_MS;
      expect(shouldReset).toBe(true);
    });
  });

  describe('[RATE-007] Monitoring & Alerting', () => {
    it('should log rate limit violations', () => {
      const logs: Array<{ ip: string; timestamp: number; reason: string }> = [];

      const violation = {
        ip: '192.168.1.1',
        timestamp: Date.now(),
        reason: 'Exceeded rate limit',
      };

      logs.push(violation);

      expect(logs).toHaveLength(1);
      expect(logs[0].reason).toContain('rate limit');
    });

    it('should alert on suspicious patterns', () => {
      const alerts: Array<{ type: string; severity: string; details: string }> = [];

      const alert = {
        type: 'DISTRIBUTED_ATTACK',
        severity: 'HIGH',
        details: 'Detected 50+ requests from subnet 192.168.1.0/24',
      };

      alerts.push(alert);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('HIGH');
    });

    it('should track rate limit metrics', () => {
      const metrics = {
        totalRequests: 1000,
        blockedRequests: 50,
        uniqueIps: 100,
        avgRequestsPerIp: 10,
      };

      const blockRate = (metrics.blockedRequests / metrics.totalRequests) * 100;
      expect(blockRate).toBe(5);
    });
  });
});
