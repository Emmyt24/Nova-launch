import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { ApiKeyGuard } from "../guards/api-key.guard";
import { ConfigService } from "@nestjs/config";
import { DECORATORS } from "../auth.constants";

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockContext(overrides: {
  handler?: object;
  class?: object;
  request?: object;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => overrides.request ?? {},
    }),
    getHandler: () => overrides.handler ?? {},
    getClass: () => overrides.class ?? {},
  } as unknown as ExecutionContext;
}

// ─── JwtAuthGuard ───────────────────────────────────────────────────────────

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [JwtAuthGuard, Reflector],
    }).compile();
    guard = module.get(JwtAuthGuard);
    reflector = module.get(Reflector);
  });

  it("should allow public routes without token", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    const ctx = mockContext({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("should throw UnauthorizedException when no user", () => {
    expect(() =>
      guard.handleRequest(null, null, { message: "No token" })
    ).toThrow(UnauthorizedException);
  });

  it("should return user when valid", () => {
    const user = { walletAddress: "GTEST" };
    expect(guard.handleRequest(null, user, null)).toBe(user);
  });

  it("should throw when error present", () => {
    expect(() =>
      guard.handleRequest(new Error("jwt expired"), null, null)
    ).toThrow(UnauthorizedException);
  });
});

// ─── RolesGuard ─────────────────────────────────────────────────────────────

describe("RolesGuard", () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  it("should allow when no roles required", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });

  it("should allow when user has required role", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
    const ctx = mockContext({
      request: { user: { roles: ["admin", "user"] } },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("should throw ForbiddenException when user lacks role", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
    const ctx = mockContext({ request: { user: { roles: ["user"] } } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("should throw ForbiddenException when no user", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
    const ctx = mockContext({ request: {} });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ─── ApiKeyGuard ─────────────────────────────────────────────────────────────

describe("ApiKeyGuard", () => {
  let guard: ApiKeyGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def: string) => {
              if (key === "API_KEYS")
                return "valid-api-key-123,another-key-456";
              return def;
            }),
          },
        },
      ],
    }).compile();
    guard = module.get(ApiKeyGuard);
  });

  it("should allow valid API key from header", () => {
    const ctx = mockContext({
      request: {
        headers: { "x-api-key": "valid-api-key-123" },
        query: {},
        ip: "127.0.0.1",
      },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("should allow valid API key from query param", () => {
    const ctx = mockContext({
      request: {
        headers: {},
        query: { api_key: "another-key-456" },
        ip: "127.0.0.1",
      },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("should throw for invalid key", () => {
    const ctx = mockContext({
      request: {
        headers: { "x-api-key": "wrong-key" },
        query: {},
        ip: "127.0.0.1",
      },
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("should throw when no API key provided", () => {
    const ctx = mockContext({
      request: { headers: {}, query: {}, ip: "127.0.0.1" },
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
