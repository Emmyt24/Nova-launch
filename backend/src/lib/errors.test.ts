/**
 * Tests for backend/src/lib/errors.ts
 *
 * Coverage targets:
 *  - All ErrorCode values present and mapped to HTTP status
 *  - AppError base class construction, prototype chain, toHttpResponse()
 *  - Every domain-specific subclass
 *  - isAppError() type-guard
 *  - toAppError() normaliser (Error, string, AppError, unknown)
 *  - Edge cases: empty strings, undefined details, isDev flag
 */

import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  ERROR_HTTP_STATUS,
  AppError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  InvalidTokenError,
  TokenExpiredError,
  RateLimitError,
  ValidationError,
  InvalidAddressError,
  InvalidAmountError,
  StellarNetworkError,
  StellarTransactionError,
  StellarContractError,
  StellarInsufficientFeeError,
  StellarTimeoutError,
  DatabaseError,
  DatabaseConnectionError,
  DuplicateRecordError,
  IpfsError,
  WebhookDeliveryError,
  isAppError,
  toAppError,
} from "./errors";

// ---------------------------------------------------------------------------
// ErrorCode enum
// ---------------------------------------------------------------------------

describe("ErrorCode", () => {
  it("contains all expected codes", () => {
    const expected = [
      "INTERNAL_SERVER_ERROR",
      "NOT_FOUND",
      "BAD_REQUEST",
      "CONFLICT",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "INVALID_TOKEN",
      "TOKEN_EXPIRED",
      "RATE_LIMITED",
      "VALIDATION_ERROR",
      "INVALID_ADDRESS",
      "INVALID_AMOUNT",
      "INVALID_PARAMETERS",
      "STELLAR_NETWORK_ERROR",
      "STELLAR_TRANSACTION_FAILED",
      "STELLAR_CONTRACT_ERROR",
      "STELLAR_INSUFFICIENT_FEE",
      "STELLAR_ACCOUNT_NOT_FOUND",
      "STELLAR_TIMEOUT",
      "STELLAR_SIMULATION_FAILED",
      "DATABASE_ERROR",
      "DATABASE_CONNECTION_ERROR",
      "RECORD_NOT_FOUND",
      "DUPLICATE_RECORD",
      "IPFS_ERROR",
      "WEBHOOK_DELIVERY_FAILED",
      "EXTERNAL_SERVICE_ERROR",
    ];
    for (const code of expected) {
      expect(ErrorCode).toHaveProperty(code);
    }
  });
});

// ---------------------------------------------------------------------------
// ERROR_HTTP_STATUS mapping
// ---------------------------------------------------------------------------

describe("ERROR_HTTP_STATUS", () => {
  it("maps every ErrorCode to a valid HTTP status", () => {
    for (const code of Object.values(ErrorCode)) {
      const status = ERROR_HTTP_STATUS[code];
      expect(status, `Missing HTTP status for ${code}`).toBeDefined();
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it("maps auth errors to 4xx", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED]).toBe(401);
    expect(ERROR_HTTP_STATUS[ErrorCode.FORBIDDEN]).toBe(403);
    expect(ERROR_HTTP_STATUS[ErrorCode.INVALID_TOKEN]).toBe(401);
    expect(ERROR_HTTP_STATUS[ErrorCode.TOKEN_EXPIRED]).toBe(401);
    expect(ERROR_HTTP_STATUS[ErrorCode.RATE_LIMITED]).toBe(429);
  });

  it("maps validation errors to 422", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.VALIDATION_ERROR]).toBe(422);
    expect(ERROR_HTTP_STATUS[ErrorCode.INVALID_ADDRESS]).toBe(422);
    expect(ERROR_HTTP_STATUS[ErrorCode.INVALID_AMOUNT]).toBe(422);
    expect(ERROR_HTTP_STATUS[ErrorCode.INVALID_PARAMETERS]).toBe(422);
  });

  it("maps Stellar errors to 5xx or 402/404", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.STELLAR_NETWORK_ERROR]).toBe(502);
    expect(ERROR_HTTP_STATUS[ErrorCode.STELLAR_TRANSACTION_FAILED]).toBe(502);
    expect(ERROR_HTTP_STATUS[ErrorCode.STELLAR_CONTRACT_ERROR]).toBe(502);
    expect(ERROR_HTTP_STATUS[ErrorCode.STELLAR_INSUFFICIENT_FEE]).toBe(402);
    expect(ERROR_HTTP_STATUS[ErrorCode.STELLAR_ACCOUNT_NOT_FOUND]).toBe(404);
    expect(ERROR_HTTP_STATUS[ErrorCode.STELLAR_TIMEOUT]).toBe(504);
  });

  it("maps database errors to 5xx or 409", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.DATABASE_ERROR]).toBe(500);
    expect(ERROR_HTTP_STATUS[ErrorCode.DATABASE_CONNECTION_ERROR]).toBe(503);
    expect(ERROR_HTTP_STATUS[ErrorCode.DUPLICATE_RECORD]).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// AppError base class
// ---------------------------------------------------------------------------

describe("AppError", () => {
  it("constructs with required fields", () => {
    const err = new AppError({
      code: ErrorCode.BAD_REQUEST,
      message: "bad input",
    });
    expect(err.code).toBe(ErrorCode.BAD_REQUEST);
    expect(err.message).toBe("bad input");
    expect(err.httpStatus).toBe(400);
    expect(err.details).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it("stores optional details and cause", () => {
    const cause = new Error("root cause");
    const err = new AppError({
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: "oops",
      details: { field: "x" },
      cause,
    });
    expect(err.details).toEqual({ field: "x" });
    expect(err.cause).toBe(cause);
  });

  it("is an instance of Error", () => {
    const err = new AppError({ code: ErrorCode.NOT_FOUND, message: "gone" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it("has a stack trace", () => {
    const err = new AppError({ code: ErrorCode.BAD_REQUEST, message: "x" });
    expect(err.stack).toBeDefined();
  });

  describe("toHttpResponse()", () => {
    it("returns success:false with code and message", () => {
      const err = new AppError({ code: ErrorCode.NOT_FOUND, message: "missing" });
      const res = err.toHttpResponse();
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(res.error.message).toBe("missing");
      expect(res.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("includes details for 4xx errors by default", () => {
      const err = new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "invalid",
        details: { field: "email" },
      });
      const res = err.toHttpResponse();
      expect(res.error.details).toEqual({ field: "email" });
    });

    it("omits details for 5xx errors in production (isDev=false)", () => {
      const err = new AppError({
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: "crash",
        details: { secret: "stack" },
      });
      const res = err.toHttpResponse(false);
      expect(res.error.details).toBeUndefined();
    });

    it("includes details for 5xx errors in dev mode (isDev=true)", () => {
      const err = new AppError({
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: "crash",
        details: { stack: "trace" },
      });
      const res = err.toHttpResponse(true);
      expect(res.error.details).toEqual({ stack: "trace" });
    });

    it("omits details key entirely when details is undefined", () => {
      const err = new AppError({ code: ErrorCode.BAD_REQUEST, message: "x" });
      const res = err.toHttpResponse();
      expect("details" in res.error).toBe(false);
    });

    it("never exposes cause or stack", () => {
      const err = new AppError({
        code: ErrorCode.BAD_REQUEST,
        message: "x",
        cause: new Error("root"),
      });
      const res = err.toHttpResponse(true);
      expect(JSON.stringify(res)).not.toContain("cause");
      expect(JSON.stringify(res)).not.toContain("stack");
    });
  });
});

// ---------------------------------------------------------------------------
// Domain-specific subclasses
// ---------------------------------------------------------------------------

describe("BadRequestError", () => {
  it("uses default message", () => {
    const err = new BadRequestError();
    expect(err.httpStatus).toBe(400);
    expect(err.message).toBe("Bad request");
    expect(err.name).toBe("BadRequestError");
  });

  it("accepts custom message and details", () => {
    const err = new BadRequestError("missing field", { field: "name" });
    expect(err.message).toBe("missing field");
    expect(err.details).toEqual({ field: "name" });
  });
});

describe("NotFoundError", () => {
  it("formats message with resource only", () => {
    const err = new NotFoundError("Token");
    expect(err.httpStatus).toBe(404);
    expect(err.message).toBe("Token not found");
  });

  it("formats message with resource and identifier", () => {
    const err = new NotFoundError("Token", "GXYZ");
    expect(err.message).toBe("Token not found: GXYZ");
    expect((err.details as any).identifier).toBe("GXYZ");
  });
});

describe("ConflictError", () => {
  it("defaults to 409", () => {
    const err = new ConflictError();
    expect(err.httpStatus).toBe(409);
    expect(err.name).toBe("ConflictError");
  });
});

describe("UnauthorizedError", () => {
  it("returns 401", () => {
    const err = new UnauthorizedError();
    expect(err.httpStatus).toBe(401);
    expect(err.name).toBe("UnauthorizedError");
  });
});

describe("ForbiddenError", () => {
  it("returns 403", () => {
    const err = new ForbiddenError();
    expect(err.httpStatus).toBe(403);
    expect(err.name).toBe("ForbiddenError");
  });
});

describe("InvalidTokenError", () => {
  it("returns 401", () => {
    const err = new InvalidTokenError();
    expect(err.httpStatus).toBe(401);
    expect(err.code).toBe(ErrorCode.INVALID_TOKEN);
  });
});

describe("TokenExpiredError", () => {
  it("returns 401", () => {
    const err = new TokenExpiredError();
    expect(err.httpStatus).toBe(401);
    expect(err.code).toBe(ErrorCode.TOKEN_EXPIRED);
  });
});

describe("RateLimitError", () => {
  it("returns 429", () => {
    const err = new RateLimitError();
    expect(err.httpStatus).toBe(429);
    expect(err.name).toBe("RateLimitError");
  });
});

describe("ValidationError", () => {
  it("returns 422 with details", () => {
    const err = new ValidationError("email is invalid", { field: "email" });
    expect(err.httpStatus).toBe(422);
    expect(err.details).toEqual({ field: "email" });
  });
});

describe("InvalidAddressError", () => {
  it("includes address in message and details", () => {
    const err = new InvalidAddressError("GBAD");
    expect(err.httpStatus).toBe(422);
    expect(err.message).toContain("GBAD");
    expect((err.details as any).address).toBe("GBAD");
  });
});

describe("InvalidAmountError", () => {
  it("includes amount in message and details", () => {
    const err = new InvalidAmountError(-5);
    expect(err.httpStatus).toBe(422);
    expect(err.message).toContain("-5");
    expect((err.details as any).amount).toBe(-5);
  });

  it("handles zero", () => {
    const err = new InvalidAmountError(0);
    expect(err.message).toContain("0");
  });
});

describe("StellarNetworkError", () => {
  it("returns 502 and stores cause", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new StellarNetworkError("horizon unreachable", cause);
    expect(err.httpStatus).toBe(502);
    expect(err.cause).toBe(cause);
  });
});

describe("StellarTransactionError", () => {
  it("includes txHash in message", () => {
    const err = new StellarTransactionError("abc123", { result: "failed" });
    expect(err.message).toContain("abc123");
    expect(err.httpStatus).toBe(502);
  });
});

describe("StellarContractError", () => {
  it("returns 502", () => {
    const err = new StellarContractError("contract panicked");
    expect(err.httpStatus).toBe(502);
    expect(err.name).toBe("StellarContractError");
  });
});

describe("StellarInsufficientFeeError", () => {
  it("includes required and provided in details", () => {
    const err = new StellarInsufficientFeeError(100, 50);
    expect(err.httpStatus).toBe(402);
    expect(err.message).toContain("100");
    expect(err.message).toContain("50");
    expect((err.details as any).required).toBe(100);
    expect((err.details as any).provided).toBe(50);
  });
});

describe("StellarTimeoutError", () => {
  it("includes operation in message", () => {
    const err = new StellarTimeoutError("create_token");
    expect(err.httpStatus).toBe(504);
    expect(err.message).toContain("create_token");
    expect((err.details as any).operation).toBe("create_token");
  });
});

describe("DatabaseError", () => {
  it("returns 500", () => {
    const err = new DatabaseError("query failed");
    expect(err.httpStatus).toBe(500);
    expect(err.name).toBe("DatabaseError");
  });
});

describe("DatabaseConnectionError", () => {
  it("returns 503 with default message", () => {
    const err = new DatabaseConnectionError();
    expect(err.httpStatus).toBe(503);
    expect(err.message).toBe("Database connection unavailable");
  });

  it("stores cause", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new DatabaseConnectionError(cause);
    expect(err.cause).toBe(cause);
  });
});

describe("DuplicateRecordError", () => {
  it("formats message without field", () => {
    const err = new DuplicateRecordError("Token");
    expect(err.httpStatus).toBe(409);
    expect(err.message).toBe("Token already exists");
  });

  it("formats message with field", () => {
    const err = new DuplicateRecordError("User", "email");
    expect(err.message).toBe("User with this email already exists");
    expect((err.details as any).field).toBe("email");
  });
});

describe("IpfsError", () => {
  it("returns 502", () => {
    const err = new IpfsError("pin failed");
    expect(err.httpStatus).toBe(502);
    expect(err.name).toBe("IpfsError");
  });
});

describe("WebhookDeliveryError", () => {
  it("includes url in message and details", () => {
    const err = new WebhookDeliveryError("https://example.com/hook");
    expect(err.httpStatus).toBe(502);
    expect(err.message).toContain("https://example.com/hook");
    expect((err.details as any).url).toBe("https://example.com/hook");
  });
});

// ---------------------------------------------------------------------------
// isAppError()
// ---------------------------------------------------------------------------

describe("isAppError()", () => {
  it("returns true for AppError instances", () => {
    expect(isAppError(new AppError({ code: ErrorCode.BAD_REQUEST, message: "x" }))).toBe(true);
  });

  it("returns true for subclass instances", () => {
    expect(isAppError(new NotFoundError("Token"))).toBe(true);
    expect(isAppError(new ValidationError("bad"))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
  });

  it("returns false for null, undefined, string, number", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError("error")).toBe(false);
    expect(isAppError(42)).toBe(false);
  });

  it("returns false for plain objects", () => {
    expect(isAppError({ code: "X", message: "y" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toAppError()
// ---------------------------------------------------------------------------

describe("toAppError()", () => {
  it("returns the same AppError unchanged", () => {
    const original = new BadRequestError("already typed");
    expect(toAppError(original)).toBe(original);
  });

  it("wraps a plain Error as INTERNAL_SERVER_ERROR", () => {
    const plain = new Error("boom");
    const result = toAppError(plain);
    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(result.message).toBe("boom");
    expect(result.cause).toBe(plain);
  });

  it("wraps a string as INTERNAL_SERVER_ERROR", () => {
    const result = toAppError("something went wrong");
    expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(result.message).toBe("something went wrong");
  });

  it("wraps null with a generic message", () => {
    const result = toAppError(null);
    expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(result.message).toBe("An unexpected error occurred");
  });

  it("wraps undefined with a generic message", () => {
    const result = toAppError(undefined);
    expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(result.message).toBe("An unexpected error occurred");
  });

  it("wraps a plain object with a generic message", () => {
    const result = toAppError({ weird: true });
    expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(result.message).toBe("An unexpected error occurred");
  });

  it("wraps a number with a generic message", () => {
    const result = toAppError(404);
    expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(result.message).toBe("An unexpected error occurred");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("AppError with empty string message is valid", () => {
    const err = new AppError({ code: ErrorCode.BAD_REQUEST, message: "" });
    expect(err.message).toBe("");
  });

  it("toHttpResponse timestamp is a valid ISO string", () => {
    const err = new BadRequestError();
    const { timestamp } = err.toHttpResponse();
    expect(() => new Date(timestamp)).not.toThrow();
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it("subclasses maintain instanceof chain", () => {
    const err = new StellarNetworkError("down");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(StellarNetworkError);
  });

  it("details with null value is preserved for 4xx", () => {
    const err = new ValidationError("bad", null);
    const res = err.toHttpResponse();
    // null is a defined value, so it should be included
    expect("details" in res.error).toBe(true);
    expect(res.error.details).toBeNull();
  });

  it("toAppError preserves subclass type when passed an AppError subclass", () => {
    const original = new ForbiddenError("no access");
    const result = toAppError(original);
    expect(result).toBeInstanceOf(ForbiddenError);
    expect(result.httpStatus).toBe(403);
  });
});
