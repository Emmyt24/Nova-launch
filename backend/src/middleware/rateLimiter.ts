import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";

/**
 * Configuration for a rate limit rule.
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window */
  max: number;
  /** Message sent when limit is exceeded */
  message?: string;
  /** Key prefix for Redis namespacing */
  keyPrefix?: string;
}

/**
 * Creates a Redis client from environment variables.
 * Falls back to localhost:6379 if REDIS_URL is not set.
 */
export function createRedisClient(): Redis {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const client = new Redis(url, {
    // Fail fast on connection errors rather than blocking requests
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  client.on("error", (err) => {
    // Log but don't crash — fallback logic handles unavailability
    console.error("[RateLimiter] Redis error:", err.message);
  });
  return client;
}

/**
 * Sliding-window counter using Redis ZADD / ZREMRANGEBYSCORE.
 *
 * Each request is recorded as a member with score = timestamp (ms).
 * Old entries outside the window are pruned on every check.
 * The key expires automatically after the window to avoid stale data.
 *
 * @returns number of requests in the current window (after recording this one)
 */
export async function incrementSlidingWindow(
  redis: Redis,
  key: string,
  windowMs: number
): Promise<number> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const expireSeconds = Math.ceil(windowMs / 1000) + 1;

  // Atomic pipeline: prune old entries, add current, count, set TTL
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, "-inf", windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, expireSeconds);

  const results = await pipeline.exec();
  // zcard result is at index 2
  const count = (results?.[2]?.[1] as number) ?? 1;
  return count;
}

/**
 * Builds the rate-limit key for a request.
 * Uses authenticated wallet address when available, otherwise falls back to IP.
 */
export function resolveKey(req: Request, prefix: string): string {
  const user = (req as any).user;
  if (user?.walletAddress) return `${prefix}:wallet:${user.walletAddress}`;
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  return `${prefix}:ip:${ip}`;
}

/**
 * Creates an Express rate-limiting middleware backed by Redis.
 *
 * When Redis is unavailable the middleware fails open (allows the request)
 * to avoid taking down the API due to a cache outage.
 *
 * Standard rate-limit response headers are set on every response:
 *   X-RateLimit-Limit     – configured maximum
 *   X-RateLimit-Remaining – requests left in the current window
 *   X-RateLimit-Reset     – Unix timestamp (seconds) when the window resets
 *
 * @param redis  Shared Redis client instance
 * @param config Rate-limit configuration
 */
export function createRateLimiter(redis: Redis, config: RateLimitConfig) {
  const {
    windowMs,
    max,
    message = "Too many requests, please try again later.",
    keyPrefix = "rl",
  } = config;

  return async function rateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const key = resolveKey(req, keyPrefix);
    const resetAt = Math.ceil((Date.now() + windowMs) / 1000);

    let count: number;
    try {
      count = await incrementSlidingWindow(redis, key, windowMs);
    } catch {
      // Redis unavailable — fail open
      next();
      return;
    }

    const remaining = Math.max(0, max - count);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetAt);

    if (count > max) {
      res.setHeader("Retry-After", resetAt - Math.floor(Date.now() / 1000));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Pre-configured limiters (drop-in replacements for the express-rate-limit ones)
// ---------------------------------------------------------------------------

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"); // 15 min
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100");

/** Lazily-initialised shared Redis client */
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) _redis = createRedisClient();
  return _redis;
}

/**
 * Global rate limiter for all API endpoints.
 * 100 requests per 15-minute window per IP / wallet.
 */
export function globalRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  createRateLimiter(getRedis(), {
    windowMs: WINDOW_MS,
    max: MAX_REQUESTS,
    message: "Too many requests from this IP, please try again later.",
    keyPrefix: "rl:global",
  })(req, res, next);
}

/**
 * Stricter rate limiter for webhook subscription endpoints.
 * 20 requests per 15-minute window.
 */
export function webhookRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  createRateLimiter(getRedis(), {
    windowMs: WINDOW_MS,
    max: 20,
    message: "Too many webhook operations, please try again later.",
    keyPrefix: "rl:webhook",
  })(req, res, next);
}
