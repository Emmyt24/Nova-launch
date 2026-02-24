import { Test, TestingModule } from "@nestjs/testing";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import {
  TokenCacheService,
  TOKEN_CACHE_PREFIX,
} from "../../src/tokens/token-cache.service";
import { Token } from "../../src/tokens/interfaces/token.interface";

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockToken: Token = {
  basicInfo: {
    name: "TEST",
    symbol: "TEST",
    decimals: 7,
    address: "TEST:GABCDE",
  },
  supplyInfo: { total: "1000000", initial: "1000000", circulating: "900000" },
  burnInfo: { totalBurned: "0", burnCount: 0, percentBurned: "0" },
  creator: { address: "GABCDE", createdAt: "2024-01-01T00:00:00Z" },
  analytics: { volume24h: "0", volume7d: "0" },
};

describe("TokenCacheService", () => {
  let service: TokenCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenCacheService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();
    service = module.get<TokenCacheService>(TokenCacheService);
  });

  describe("buildKey", () => {
    it("should build a cache key with sorted includes", () => {
      const key = service.buildKey("TEST:GABCDE", ["analytics", "metadata"]);
      expect(key).toBe(`${TOKEN_CACHE_PREFIX}TEST:GABCDE:analytics,metadata`);
    });

    it("should build a key with empty includes", () => {
      const key = service.buildKey("TEST:GABCDE", []);
      expect(key).toBe(`${TOKEN_CACHE_PREFIX}TEST:GABCDE:`);
    });

    it("should produce consistent keys regardless of include order", () => {
      const key1 = service.buildKey("TEST:GABCDE", ["burns", "metadata"]);
      const key2 = service.buildKey("TEST:GABCDE", ["metadata", "burns"]);
      expect(key1).toBe(key2);
    });
  });

  describe("get", () => {
    it("should return cached token when present", async () => {
      mockCacheManager.get.mockResolvedValue(mockToken);
      const result = await service.get("some-key");
      expect(result).toEqual(mockToken);
    });

    it("should return null when cache miss", async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      const result = await service.get("some-key");
      expect(result).toBeNull();
    });

    it("should return null on cache error", async () => {
      mockCacheManager.get.mockRejectedValue(new Error("Redis error"));
      const result = await service.get("some-key");
      expect(result).toBeNull();
    });
  });

  describe("set", () => {
    it("should store token in cache with TTL", async () => {
      mockCacheManager.set.mockResolvedValue(undefined);
      await service.set("some-key", mockToken, 120);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        "some-key",
        mockToken,
        120000
      );
    });

    it("should use default TTL when not provided", async () => {
      mockCacheManager.set.mockResolvedValue(undefined);
      await service.set("some-key", mockToken);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        "some-key",
        mockToken,
        60000
      );
    });

    it("should not throw on cache error", async () => {
      mockCacheManager.set.mockRejectedValue(new Error("Redis error"));
      await expect(service.set("some-key", mockToken)).resolves.not.toThrow();
    });
  });

  describe("invalidate", () => {
    it("should delete multiple cache keys for an address", async () => {
      mockCacheManager.del.mockResolvedValue(undefined);
      await service.invalidate("TEST:GABCDE");
      expect(mockCacheManager.del).toHaveBeenCalledTimes(5);
    });

    it("should not throw on partial cache deletion error", async () => {
      mockCacheManager.del
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new Error("Redis error"));
      await expect(service.invalidate("TEST:GABCDE")).resolves.not.toThrow();
    });
  });
});
