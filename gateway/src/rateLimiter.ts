/**
 * Redis-backed sliding-window rate limiter for the API Gateway.
 *
 * Mirrors the pattern in backend/src/middleware/rateLimiter.ts but is
 * self-contained so the gateway has no dependency on the backend package.
 *
 * Algorithm: sliding-window counter via Redis sorted sets.
 *   - Each request is stored as a member with score = timestamp (ms).
 *   - Entries older than the window are pruned atomically.
 *   - The key TTL is set to window + 1 s to prevent stale data.
 *
 * Fail-open: when Redis is unavailable the middleware calls next() rather
 * than blocking all traffic due to a cache outage.
 *
 * Headers set on every response:
 *   X-RateLimit-Limit     – configured maximum
 *   X-RateLimit-Remaining – requests left in the current window
 *   X-RateLimit-Reset     – Unix timestamp (s) when the window resets
 *   Retry-After           – seconds until reset (only on 429)
 */

import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";

export interface RateLimitConfig {
  /** Time window in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per window. */
  max: number;
  /** Error message returned on 429. */
  message?: string;
  /** Redis key prefix for namespace isolation. */
  keyPrefix?: string;
}

/**
 * Creates a Redis client.  Fails fast on connection errors (enableOfflineQueue=false)
 * so the gateway does not queue requests when Redis is down.
 */
export function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  client.on("error", (err: Error) => {
    console.error("[Gateway:RateLimiter] Redis error:", err.message);
  });
  return client;
}

/**
 * Atomically records a request and returns the count within the window.
 */
export async function incrementSlidingWindow(
  redis: Redis,
  key: string,
  windowMs: number
): Promise<number> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const expireSeconds = Math.ceil(windowMs / 1000) + 1;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, "-inf", windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, expireSeconds);

  const results = await pipeline.exec();
  return (results?.[2]?.[1] as number) ?? 1;
}

/**
 * Resolves the rate-limit key for a request.
 * Authenticated requests are keyed by wallet address; anonymous by IP.
 */
export function resolveRateLimitKey(req: Request, prefix: string): string {
  const walletAddress = req.user?.walletAddress;
  if (walletAddress) return `${prefix}:wallet:${walletAddress}`;
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  return `${prefix}:ip:${ip}`;
}

/**
 * Creates an Express rate-limiting middleware backed by Redis.
 */
export function createRateLimiter(redis: Redis, config: RateLimitConfig) {
  const {
    windowMs,
    max,
    message = "Too many requests, please try again later.",
    keyPrefix = "gw:rl",
  } = config;

  return async function rateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const key = resolveRateLimitKey(req, keyPrefix);
    const resetAt = Math.ceil((Date.now() + windowMs) / 1000);

    let count: number;
    try {
      count = await incrementSlidingWindow(redis, key, windowMs);
    } catch {
      // Redis unavailable — fail open to avoid blocking all traffic
      next();
      return;
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));
    res.setHeader("X-RateLimit-Reset", resetAt);

    if (count > max) {
      res.setHeader("Retry-After", resetAt - Math.floor(Date.now() / 1000));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
