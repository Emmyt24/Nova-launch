import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TransactionHistoryStorage,
  StorageQuotaExceededError,
} from "../TransactionHistoryStorage";
import type { TokenInfo } from "../../types";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
  };
})();

// Mock the TokenInfo for testing
const createMockToken = (overrides: Partial<TokenInfo> = {}): TokenInfo => ({
  address: "GXXXXXXXXXXXXXXXXXXXXXXX",
  name: "Test Token",
  symbol: "TEST",
  decimals: 7,
  totalSupply: "1000000",
  creator: "GCCCCCCCCCCCCCCCCCCCCCC",
  deployedAt: Date.now(),
  transactionHash: "HHHHHHHHHHHHHHHHHHHHHH",
  ...overrides,
});

describe("TransactionHistoryStorage", () => {
  let storage: TransactionHistoryStorage;

  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock.clear();
    vi.stubGlobal("localStorage", localStorageMock);

    // Create fresh instance
    storage = TransactionHistoryStorage.getInstance();
    storage.clearAll();
  });

  describe("getTokens", () => {
    it("should return empty array when no data exists", () => {
      const tokens = storage.getTokens("GXXXXXXXXXXXXXXX");
      expect(tokens).toEqual([]);
    });

    it("should return empty array for unknown wallet", () => {
      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GKNOWN: [createMockToken()],
          },
        }),
      );

      const tokens = storage.getTokens("GUNKNOWN");
      expect(tokens).toEqual([]);
    });

    it("should return tokens for known wallet", () => {
      const token1 = createMockToken({ address: "GTOKEN1" });
      const token2 = createMockToken({ address: "GTOKEN2" });

      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GWALLET: [token1, token2],
          },
        }),
      );

      const tokens = storage.getTokens("GWALLET");
      expect(tokens).toHaveLength(2);
      expect(tokens[0].address).toBe("GTOKEN1");
    });
  });

  describe("addToken", () => {
    it("should add a new token to empty wallet", () => {
      const token = createMockToken();
      storage.addToken("GWALLET", token);

      const tokens = storage.getTokens("GWALLET");
      expect(tokens).toHaveLength(1);
      expect(tokens[0].address).toBe(token.address);
    });

    it("should add token at beginning (most recent first)", () => {
      const token1 = createMockToken({ address: "GTOKEN1", deployedAt: 1000 });
      const token2 = createMockToken({ address: "GTOKEN2", deployedAt: 2000 });

      storage.addToken("GWALLET", token1);
      storage.addToken("GWALLET", token2);

      const tokens = storage.getTokens("GWALLET");
      expect(tokens).toHaveLength(2);
      expect(tokens[0].address).toBe("GTOKEN2"); // Most recent first
    });

    it("should update existing token if address matches", () => {
      const token1 = createMockToken({
        address: "GTOKEN1",
        name: "Original Name",
      });
      storage.addToken("GWALLET", token1);

      const updatedToken = createMockToken({
        address: "GTOKEN1",
        name: "Updated Name",
      });
      storage.addToken("GWALLET", updatedToken);

      const tokens = storage.getTokens("GWALLET");
      expect(tokens).toHaveLength(1);
      expect(tokens[0].name).toBe("Updated Name");
    });

    it("should persist data to localStorage", () => {
      const token = createMockToken();
      storage.addToken("GWALLET", token);

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe("removeToken", () => {
    it("should remove token by address", () => {
      const token1 = createMockToken({ address: "GTOKEN1" });
      const token2 = createMockToken({ address: "GTOKEN2" });

      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GWALLET: [token1, token2],
          },
        }),
      );

      storage.removeToken("GWALLET", "GTOKEN1");

      const tokens = storage.getTokens("GWALLET");
      expect(tokens).toHaveLength(1);
      expect(tokens[0].address).toBe("GTOKEN2");
    });

    it("should handle removing non-existent token", () => {
      const token = createMockToken({ address: "GTOKEN1" });

      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GWALLET: [token],
          },
        }),
      );

      // Should not throw
      storage.removeToken("GWALLET", "G_NONEXISTENT");

      const tokens = storage.getTokens("GWALLET");
      expect(tokens).toHaveLength(1);
    });
  });

  describe("clearWalletHistory", () => {
    it("should clear all tokens for a wallet", () => {
      const token1 = createMockToken({ address: "GTOKEN1" });
      const token2 = createMockToken({ address: "GTOKEN2" });

      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GWALLET: [token1, token2],
            GOTHER: [createMockToken()],
          },
        }),
      );

      storage.clearWalletHistory("GWALLET");

      const tokens = storage.getTokens("GWALLET");
      expect(tokens).toHaveLength(0);

      // Other wallet should be unaffected
      const otherTokens = storage.getTokens("GOTHER");
      expect(otherTokens).toHaveLength(1);
    });
  });

  describe("clearAll", () => {
    it("should clear all transaction history", () => {
      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GWALLET: [createMockToken()],
          },
        }),
      );

      storage.clearAll();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "transaction_history",
      );
    });
  });

  describe("getStorageSize", () => {
    it("should return 0 when no data exists", () => {
      const size = storage.getStorageSize();
      expect(size).toBe(0);
    });

    it("should return approximate size in bytes", () => {
      const token = createMockToken({
        name: "Test Token Name",
        symbol: "TEST",
      });
      storage.addToken("GWALLET", token);

      const size = storage.getStorageSize();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe("getAllWalletAddresses", () => {
    it("should return all wallet addresses with stored tokens", () => {
      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GWALLET1: [createMockToken()],
            GWALLET2: [createMockToken()],
            GWALLET3: [],
          },
        }),
      );

      const addresses = storage.getAllWalletAddresses();
      expect(addresses).toHaveLength(3);
      expect(addresses).toContain("GWALLET1");
      expect(addresses).toContain("GWALLET2");
    });

    it("should return empty array when no data exists", () => {
      const addresses = storage.getAllWalletAddresses();
      expect(addresses).toEqual([]);
    });
  });

  describe("hasWalletData", () => {
    it("should return true when wallet has tokens", () => {
      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GWALLET: [createMockToken()],
          },
        }),
      );

      expect(storage.hasWalletData("GWALLET")).toBe(true);
    });

    it("should return false when wallet has no tokens", () => {
      localStorageMock.setItem(
        "transaction_history",
        JSON.stringify({
          v1: {
            GWALLET: [],
          },
        }),
      );

      expect(storage.hasWalletData("GWALLET")).toBe(false);
    });

    it("should return false for unknown wallet", () => {
      expect(storage.hasWalletData("GUNKNOWN")).toBe(false);
    });
  });

  describe("StorageQuotaExceededError", () => {
    it("should throw StorageQuotaExceededError when quota exceeded", () => {
      const setItemMock = vi.fn(() => {
        const error = new DOMException("Quota exceeded", "QuotaExceededError");
        throw error;
      });

      vi.stubGlobal("localStorage", {
        ...localStorageMock,
        setItem: setItemMock,
      });

      const freshStorage = TransactionHistoryStorage.createInstance();

      expect(() => {
        freshStorage.addToken("GWALLET", createMockToken());
      }).toThrow(StorageQuotaExceededError);
    });

    it("should handle legacy quota error format", () => {
      // Error message contains 'quota' but is not a DOMException
      const setItemMock = vi.fn(() => {
        const error = new Error("Quota exceeded: could not write to storage");
        throw error;
      });

      vi.stubGlobal("localStorage", {
        ...localStorageMock,
        setItem: setItemMock,
      });

      const freshStorage = TransactionHistoryStorage.createInstance();

      // This error should not be caught as quota exceeded since it's not a DOMException
      // The test validates that we handle errors gracefully
      try {
        freshStorage.addToken("GWALLET", createMockToken());
      } catch {
        // Should re-throw the original error
        expect(e).not.toBeInstanceOf(StorageQuotaExceededError);
      }
    });
  });

  describe("data migration", () => {
    it("should handle missing version gracefully", () => {
      // When no version exists, return default data
      localStorageMock.setItem("transaction_history", JSON.stringify({}));

      const freshStorage = TransactionHistoryStorage.getInstance();
      const tokens = freshStorage.getTokens("GWALLET");

      expect(tokens).toEqual([]);
    });

    it("should handle corrupted JSON gracefully", () => {
      vi.stubGlobal("localStorage", {
        ...localStorageMock,
        getItem: vi.fn(() => "invalid json"),
      });

      const freshStorage = TransactionHistoryStorage.getInstance();
      const tokens = freshStorage.getTokens("GWALLET");

      expect(tokens).toEqual([]);
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance", () => {
      const instance1 = TransactionHistoryStorage.getInstance();
      const instance2 = TransactionHistoryStorage.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
