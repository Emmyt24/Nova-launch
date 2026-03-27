import { Test, TestingModule } from "@nestjs/testing";
import { RateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { Request, Response } from "express";
import { AUTH_CONSTANTS } from "../auth.constants";

function mockRes(): Partial<Response> & {
  headers: Record<string, any>;
  statusCode?: number;
  body?: any;
} {
  const headers: Record<string, any> = {};
  let statusCode = 200;
  let resolvedBody: any;

  const res: any = {
    headers,
    setHeader: jest.fn((key: string, value: any) => {
      headers[key] = value;
    }),
    status: jest.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn((body: any) => {
      resolvedBody = body;
      return res;
    }),
    get statusCode() {
      return statusCode;
    },
    get body() {
      return resolvedBody;
    },
  };
  return res;
}

function mockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    ip: "127.0.0.1",
    path: "/api/data",
    user: undefined,
    ...overrides,
  } as any;
}

describe("RateLimitMiddleware", () => {
  let middleware: RateLimitMiddleware;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RateLimitMiddleware],
    }).compile();
    middleware = module.get(RateLimitMiddleware);
  });

  it("should call next() for first request", () => {
    const next = jest.fn();
    middleware.use(mockReq() as any, mockRes() as any, next);
    expect(next).toHaveBeenCalled();
  });

  it("should set rate limit headers", () => {
    const next = jest.fn();
    const res = mockRes();
    middleware.use(mockReq() as any, res as any, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      "X-RateLimit-Limit",
      expect.any(Number)
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-RateLimit-Remaining",
      expect.any(Number)
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-RateLimit-Reset",
      expect.any(Number)
    );
  });

  it("should block after exceeding rate limit on auth endpoints", () => {
    const next = jest.fn();
    const req = mockReq({ path: "/auth/login" });
    const max = AUTH_CONSTANTS.RATE_LIMIT_AUTH_MAX;

    for (let i = 0; i <= max; i++) {
      next.mockClear();
      const res = mockRes();
      middleware.use(req as any, res as any, next);
    }

    // The last call should have been blocked
    expect(next).not.toHaveBeenCalled();
  });

  it("should use wallet address as key when authenticated", () => {
    const next = jest.fn();
    const req = mockReq({ user: { walletAddress: "GTEST" } as any });
    middleware.use(req as any, mockRes() as any, next);

    // Different IP, same wallet — should count as same bucket
    const req2 = mockReq({
      ip: "10.0.0.1",
      user: { walletAddress: "GTEST" } as any,
    });
    const res2 = mockRes();
    middleware.use(req2 as any, res2 as any, next);

    const remaining = res2.headers["X-RateLimit-Remaining"];
    expect(remaining).toBeLessThan(AUTH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS - 1);
  });
});
