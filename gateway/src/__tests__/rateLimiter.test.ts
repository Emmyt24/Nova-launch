import { describe, it, expect, vi } from "vitest";
import { Request, NextFunction } from "express";
import {
  createRateLimiter,
  incrementSlidingWindow,
  resolveRateLimitKey,
} from "../rateLimiter";

const next = (): NextFunction => vi.fn() as unknown as NextFunction;

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRedis(count = 1) {
  const pipeline = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zadd:             vi.fn().mockReturnThis(),
    zcard:            vi.fn().mockReturnThis(),
    expire:           vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, count],
      [null, 1],
    ]),
  };
  return { pipeline: vi.fn().mockReturnValue(pipeline), on: vi.fn(), _pipeline: pipeline } as any;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return { ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" }, headers: {}, ...overrides } as any;
}

function mockRes() {
  const headers: Record<string, any> = {};
  let statusCode = 200;
  let body: any;
  const res: any = {
    headers,
    setHeader: vi.fn((k: string, v: any) => { headers[k] = v; }),
    status:    vi.fn((c: number) => { statusCode = c; return res; }),
    json:      vi.fn((b: any)   => { body = b; return res; }),
    get statusCode() { return statusCode; },
    get body()       { return body; },
  };
  return res;
}

// ── resolveRateLimitKey ───────────────────────────────────────────────────────

describe("resolveRateLimitKey", () => {
  it("uses IP when no user is attached", () => {
    expect(resolveRateLimitKey(mockReq({ ip: "1.2.3.4" }), "gw")).toBe("gw:ip:1.2.3.4");
  });

  it("uses walletAddress when user is authenticated", () => {
    const req = mockReq({ user: { walletAddress: "GWALLET" } } as any);
    expect(resolveRateLimitKey(req, "gw")).toBe("gw:wallet:GWALLET");
  });

  it("falls back to socket.remoteAddress when req.ip is undefined", () => {
    const req = mockReq({ ip: undefined, socket: { remoteAddress: "5.6.7.8" } as any });
    expect(resolveRateLimitKey(req, "gw")).toBe("gw:ip:5.6.7.8");
  });

  it("uses 'unknown' when no address is available", () => {
    const req = mockReq({ ip: undefined, socket: undefined as any });
    expect(resolveRateLimitKey(req, "gw")).toBe("gw:ip:unknown");
  });
});

// ── incrementSlidingWindow ────────────────────────────────────────────────────

describe("incrementSlidingWindow", () => {
  it("executes the correct pipeline commands", async () => {
    const redis = mockRedis();
    await incrementSlidingWindow(redis, "key", 60_000);
    const p = redis._pipeline;
    expect(p.zremrangebyscore).toHaveBeenCalledOnce();
    expect(p.zadd).toHaveBeenCalledOnce();
    expect(p.zcard).toHaveBeenCalledOnce();
    expect(p.expire).toHaveBeenCalledOnce();
  });

  it("returns the zcard count", async () => {
    const redis = mockRedis(7);
    expect(await incrementSlidingWindow(redis, "key", 60_000)).toBe(7);
  });

  it("falls back to 1 when exec returns null", async () => {
    const redis = mockRedis();
    redis._pipeline.exec.mockResolvedValue(null);
    expect(await incrementSlidingWindow(redis, "key", 60_000)).toBe(1);
  });

  it("sets TTL to ceil(windowMs/1000)+1", async () => {
    const redis = mockRedis();
    await incrementSlidingWindow(redis, "key", 60_000);
    const [, ttl] = redis._pipeline.expire.mock.calls[0];
    expect(ttl).toBe(61);
  });
});

// ── createRateLimiter — allows ────────────────────────────────────────────────

describe("createRateLimiter — allows requests under the limit", () => {
  it("calls next() when count ≤ max", async () => {
    const n = next();
    await createRateLimiter(mockRedis(1), { windowMs: 60_000, max: 10 })(mockReq(), mockRes(), n);
    expect(n).toHaveBeenCalledOnce();
  });

  it("sets X-RateLimit-Limit header", async () => {
    const res = mockRes();
    await createRateLimiter(mockRedis(1), { windowMs: 60_000, max: 10 })(mockReq(), res, next());
    expect(res.headers["X-RateLimit-Limit"]).toBe(10);
  });

  it("sets X-RateLimit-Remaining header", async () => {
    const res = mockRes();
    await createRateLimiter(mockRedis(3), { windowMs: 60_000, max: 10 })(mockReq(), res, next());
    expect(res.headers["X-RateLimit-Remaining"]).toBe(7);
  });

  it("sets X-RateLimit-Reset as a future Unix timestamp", async () => {
    const res = mockRes();
    const before = Math.floor(Date.now() / 1000);
    await createRateLimiter(mockRedis(1), { windowMs: 60_000, max: 10 })(mockReq(), res, next());
    expect(res.headers["X-RateLimit-Reset"]).toBeGreaterThanOrEqual(before + 60);
  });

  it("allows exactly max requests (count === max)", async () => {
    const n = next();
    await createRateLimiter(mockRedis(10), { windowMs: 60_000, max: 10 })(mockReq(), mockRes(), n);
    expect(n).toHaveBeenCalledOnce();
  });
});

// ── createRateLimiter — blocks ────────────────────────────────────────────────

describe("createRateLimiter — blocks requests over the limit", () => {
  it("responds 429 when count > max", async () => {
    const res = mockRes();
    await createRateLimiter(mockRedis(11), { windowMs: 60_000, max: 10 })(mockReq(), res, next());
    expect(res.statusCode).toBe(429);
  });

  it("does not call next() on 429", async () => {
    const n = next();
    await createRateLimiter(mockRedis(11), { windowMs: 60_000, max: 10 })(mockReq(), mockRes(), n);
    expect(n).not.toHaveBeenCalled();
  });

  it("uses custom message when provided", async () => {
    const res = mockRes();
    await createRateLimiter(mockRedis(11), { windowMs: 60_000, max: 10, message: "Custom" })(
      mockReq(), res, next()
    );
    expect(res.body.error).toBe("Custom");
  });

  it("sets Retry-After header on 429", async () => {
    const res = mockRes();
    await createRateLimiter(mockRedis(11), { windowMs: 60_000, max: 10 })(mockReq(), res, next());
    expect(res.headers["Retry-After"]).toBeGreaterThan(0);
  });

  it("sets X-RateLimit-Remaining to 0 when over limit", async () => {
    const res = mockRes();
    await createRateLimiter(mockRedis(20), { windowMs: 60_000, max: 10 })(mockReq(), res, next());
    expect(res.headers["X-RateLimit-Remaining"]).toBe(0);
  });
});

// ── createRateLimiter — fail-open ─────────────────────────────────────────────

describe("createRateLimiter — Redis unavailable (fail-open)", () => {
  it("calls next() when Redis throws", async () => {
    const redis = mockRedis();
    redis._pipeline.exec.mockRejectedValue(new Error("ECONNREFUSED"));
    const n = next();
    await createRateLimiter(redis, { windowMs: 60_000, max: 10 })(mockReq(), mockRes(), n);
    expect(n).toHaveBeenCalledOnce();
  });

  it("does not set rate-limit headers when Redis is down", async () => {
    const redis = mockRedis();
    redis._pipeline.exec.mockRejectedValue(new Error("timeout"));
    const res = mockRes();
    await createRateLimiter(redis, { windowMs: 60_000, max: 10 })(mockReq(), res, next());
    expect(res.headers["X-RateLimit-Limit"]).toBeUndefined();
  });
});

// ── Key prefix isolation ──────────────────────────────────────────────────────

describe("createRateLimiter — key prefix", () => {
  it("uses the configured keyPrefix in the Redis key", async () => {
    const redis = mockRedis();
    await createRateLimiter(redis, { windowMs: 60_000, max: 10, keyPrefix: "gw:rl:strict" })(
      mockReq({ ip: "1.2.3.4" }), mockRes(), next()
    );
    const [key] = redis._pipeline.zremrangebyscore.mock.calls[0];
    expect(key).toContain("gw:rl:strict");
    expect(key).toContain("1.2.3.4");
  });
});
