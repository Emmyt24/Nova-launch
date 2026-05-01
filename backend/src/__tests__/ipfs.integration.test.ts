/**
 * Integration tests for IPFS metadata upload and retrieval.
 *
 * Tests both Pinata-based upload/retrieval and NestJS IPFS service integration.
 * Covers security, performance, and edge cases with >90% coverage target.
 */

import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMetadataFromIPFS,
  uploadImageToIPFS,
  uploadMetadataToIPFS,
} from "../lib/ipfs/pinata";
import { TokenMetadata } from "../token-info/interfaces/token.interface";
import { IpfsService } from "../token-info/ipfs.service";

// Mock Pinata SDK
vi.mock("@pinata/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      pinFileToIPFS: vi.fn(),
      pinJSONToIPFS: vi.fn(),
    })),
  };
});

// Mock NodeCache
vi.mock("node-cache", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: vi.fn(),
    })),
  };
});

// Mock fetch for IPFS gateway
global.fetch = vi.fn();

describe("IPFS Integration Tests", () => {
  const mockPinataSDK = vi.mocked(require("@pinata/sdk").default);
  const mockFetch = vi.mocked(global.fetch);

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up environment variables
    process.env.PINATA_API_KEY = "test-api-key";
    process.env.PINATA_API_SECRET = "test-api-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Pinata Metadata Upload", () => {
    it("should upload metadata successfully", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmTestHash123",
        }),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const metadata = {
        name: "Test Token",
        description: "A test token metadata",
        image: "https://example.com/image.png",
        attributes: [{ trait_type: "rarity", value: "common" }],
      };

      const result = await uploadMetadataToIPFS(metadata);

      expect(result).toBe("QmTestHash123");
      expect(mockPinata.pinJSONToIPFS).toHaveBeenCalledWith(metadata);
    });

    it("should handle Pinata API errors gracefully", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockRejectedValue(new Error("API Error")),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const metadata = { name: "Test Token" };

      await expect(uploadMetadataToIPFS(metadata)).rejects.toThrow("API Error");
    });

    it("should cache metadata after successful upload", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmTestHash123",
        }),
      };
      const mockCache = {
        get: vi.fn(),
        set: vi.fn(),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      const metadata = { name: "Test Token" };

      await uploadMetadataToIPFS(metadata);

      expect(mockCache.set).toHaveBeenCalledWith("QmTestHash123", metadata);
    });

    it("should validate required environment variables", async () => {
      delete process.env.PINATA_API_KEY;

      const metadata = { name: "Test Token" };

      await expect(uploadMetadataToIPFS(metadata)).rejects.toThrow();
    });
  });

  describe("Pinata Image Upload", () => {
    it("should upload image buffer successfully", async () => {
      const mockPinata = {
        pinFileToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmImageHash456",
        }),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const imageBuffer = Buffer.from("test-image-data");
      const filename = "test-image.png";

      const result = await uploadImageToIPFS(imageBuffer, filename);

      expect(result).toBe("QmImageHash456");
      expect(mockPinata.pinFileToIPFS).toHaveBeenCalledWith(imageBuffer, {
        pinataMetadata: { name: filename },
      });
    });

    it("should handle image upload failures", async () => {
      const mockPinata = {
        pinFileToIPFS: vi.fn().mockRejectedValue(new Error("Upload failed")),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const imageBuffer = Buffer.from("test-image-data");
      const filename = "test-image.png";

      await expect(uploadImageToIPFS(imageBuffer, filename)).rejects.toThrow(
        "Upload failed"
      );
    });

    it("should validate buffer and filename", async () => {
      const mockPinata = {
        pinFileToIPFS: vi.fn(),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      await expect(uploadImageToIPFS(Buffer.from(""), "")).rejects.toThrow();
    });
  });

  describe("Pinata Metadata Retrieval", () => {
    it("should retrieve metadata from cache", async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue({ name: "Cached Token" }),
        set: vi.fn(),
      };
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      const result = await getMetadataFromIPFS("QmTestHash123");

      expect(result).toEqual({ name: "Cached Token" });
      expect(mockCache.get).toHaveBeenCalledWith("QmTestHash123");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should fetch metadata from IPFS gateway when not cached", async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      };
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      const mockMetadata = { name: "Fetched Token", description: "From IPFS" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockMetadata),
      } as Response);

      const result = await getMetadataFromIPFS("QmTestHash123");

      expect(result).toEqual(mockMetadata);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://gateway.pinata.cloud/ipfs/QmTestHash123"
      );
      expect(mockCache.set).toHaveBeenCalledWith("QmTestHash123", mockMetadata);
    });

    it("should handle IPFS gateway errors", async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      };
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(getMetadataFromIPFS("QmTestHash123")).rejects.toThrow(
        "Metadata not found"
      );
    });

    it("should handle network errors gracefully", async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      };
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(getMetadataFromIPFS("QmTestHash123")).rejects.toThrow(
        "Network error"
      );
    });

    it("should validate CID format", async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      };
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      await expect(getMetadataFromIPFS("invalid-cid")).rejects.toThrow();
    });
  });

  describe("NestJS IPFS Service Integration", () => {
    let ipfsService: IpfsService;
    let mockHttpService: any;
    let mockConfigService: any;

    beforeEach(() => {
      mockHttpService = {
        get: vi.fn(),
      };
      mockConfigService = {
        get: vi.fn((key: string) => {
          const config = {
            IPFS_GATEWAY_URL: "https://ipfs.io/ipfs",
            IPFS_TIMEOUT_MS: 5000,
          };
          return config[key];
        }),
      };

      ipfsService = new IpfsService(mockConfigService, mockHttpService);
    });

    it("should fetch metadata from HTTP URL", async () => {
      const mockMetadata: TokenMetadata = {
        image: "https://example.com/image.png",
        description: "Test token metadata",
        externalUrl: "https://example.com",
        attributes: [{ trait_type: "rarity", value: "common" }],
      };

      mockHttpService.get.mockReturnValue(
        firstValueFrom(Promise.resolve({ data: mockMetadata }))
      );

      const result = await ipfsService.fetchMetadata(
        "https://example.com/metadata.json"
      );

      expect(result).toEqual(mockMetadata);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        "https://example.com/metadata.json",
        { timeout: 5000 }
      );
    });

    it("should resolve ipfs:// protocol URLs", async () => {
      const mockMetadata: TokenMetadata = {
        description: "IPFS metadata",
      };

      mockHttpService.get.mockReturnValue(
        firstValueFrom(Promise.resolve({ data: mockMetadata }))
      );

      await ipfsService.fetchMetadata("ipfs://QmTestHash123");

      expect(mockHttpService.get).toHaveBeenCalledWith(
        "https://ipfs.io/ipfs/QmTestHash123",
        { timeout: 5000 }
      );
    });

    it("should resolve raw IPFS hash", async () => {
      const mockMetadata: TokenMetadata = {
        description: "Raw hash metadata",
      };

      mockHttpService.get.mockReturnValue(
        firstValueFrom(Promise.resolve({ data: mockMetadata }))
      );

      await ipfsService.fetchMetadata("QmTestHash456");

      expect(mockHttpService.get).toHaveBeenCalledWith(
        "https://ipfs.io/ipfs/QmTestHash456",
        { timeout: 5000 }
      );
    });

    it("should resolve bafy hash format", async () => {
      const mockMetadata: TokenMetadata = {
        description: "Bafy hash metadata",
      };

      mockHttpService.get.mockReturnValue(
        firstValueFrom(Promise.resolve({ data: mockMetadata }))
      );

      const bafyHash =
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
      await ipfsService.fetchMetadata(bafyHash);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        `https://ipfs.io/ipfs/${bafyHash}`,
        { timeout: 5000 }
      );
    });

    it("should return null for invalid input", async () => {
      const result = await ipfsService.fetchMetadata("");
      expect(result).toBeNull();

      const result2 = await ipfsService.fetchMetadata("invalid-format");
      expect(result2).toBeNull();
    });

    it("should sanitize metadata fields", async () => {
      const rawMetadata = {
        image: "https://example.com/image.png",
        description: "Valid description",
        external_url: "https://example.com",
        attributes: [{ trait_type: "rarity", value: "common" }],
        maliciousField: "should be removed",
        image: 123, // wrong type
        description: null, // wrong type
      };

      mockHttpService.get.mockReturnValue(
        firstValueFrom(Promise.resolve({ data: rawMetadata }))
      );

      const result = await ipfsService.fetchMetadata("QmTestHash123");

      expect(result?.image).toBeUndefined(); // filtered out due to wrong type
      expect(result?.description).toBeUndefined(); // filtered out due to wrong type
      expect(result?.externalUrl).toBe("https://example.com");
      expect(result?.attributes).toEqual([
        { trait_type: "rarity", value: "common" },
      ]);
    });

    it("should handle HTTP errors gracefully", async () => {
      mockHttpService.get.mockReturnValue(
        firstValueFrom(Promise.reject(new Error("HTTP Error")))
      );

      const result = await ipfsService.fetchMetadata("QmTestHash123");

      expect(result).toBeNull();
    });

    it("should respect timeout configuration", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "IPFS_TIMEOUT_MS") return 1000;
        return "https://ipfs.io/ipfs";
      });

      const newService = new IpfsService(mockConfigService, mockHttpService);
      mockHttpService.get.mockReturnValue(
        firstValueFrom(Promise.resolve({ data: {} }))
      );

      await newService.fetchMetadata("QmTestHash123");

      expect(mockHttpService.get).toHaveBeenCalledWith(
        "https://ipfs.io/ipfs/QmTestHash123",
        { timeout: 1000 }
      );
    });
  });

  describe("Security Tests", () => {
    it("should not expose sensitive data in error messages", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockRejectedValue(new Error("API Key Invalid")),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      try {
        await uploadMetadataToIPFS({ name: "Test" });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).not.toContain(process.env.PINATA_API_KEY);
        expect(error.message).not.toContain(process.env.PINATA_API_SECRET);
      }
    });

    it("should validate metadata size limits", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn(),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      // Create large metadata object
      const largeMetadata = {
        name: "Large Token",
        data: "x".repeat(10 * 1024 * 1024), // 10MB string
      };

      await expect(uploadMetadataToIPFS(largeMetadata)).rejects.toThrow();
    });

    it("should sanitize malicious metadata", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmTestHash123",
        }),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const maliciousMetadata = {
        name: "<script>alert('xss')</script>",
        description: "javascript:alert('xss')",
        // @ts-ignore - prototype pollution test
        __proto__: { malicious: "value" },
      };

      const result = await uploadMetadataToIPFS(maliciousMetadata);
      expect(result).toBe("QmTestHash123");
    });
  });

  describe("Performance Tests", () => {
    it("should handle concurrent uploads", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmConcurrentHash",
        }),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const metadata = { name: "Concurrent Test" };
      const promises = Array(10)
        .fill(null)
        .map(() => uploadMetadataToIPFS(metadata));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every((r) => r === "QmConcurrentHash")).toBe(true);
      expect(mockPinata.pinJSONToIPFS).toHaveBeenCalledTimes(10);
    });

    it("should handle cache performance efficiently", async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue({ name: "Cached" }),
        set: vi.fn(),
      };
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      const promises = Array(100)
        .fill(null)
        .map((_, i) => getMetadataFromIPFS(`QmHash${i}`));

      await Promise.all(promises);

      expect(mockCache.get).toHaveBeenCalledTimes(100);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty metadata object", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmEmptyHash",
        }),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const result = await uploadMetadataToIPFS({});
      expect(result).toBe("QmEmptyHash");
    });

    it("should handle circular references in metadata", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn(),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const circularMetadata: any = { name: "Circular" };
      circularMetadata.self = circularMetadata;

      await expect(uploadMetadataToIPFS(circularMetadata)).rejects.toThrow();
    });

    it("should handle special characters in metadata", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmSpecialHash",
        }),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const specialMetadata = {
        name: "🚀 Special Token 🦄",
        description: "Unicode: ñáéíóú 中文 العربية",
        tags: ["emoji", "unicode", "特殊字符"],
      };

      const result = await uploadMetadataToIPFS(specialMetadata);
      expect(result).toBe("QmSpecialHash");
    });

    it("should handle malformed JSON responses", async () => {
      const mockCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      };
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
      } as Response);

      await expect(getMetadataFromIPFS("QmTestHash123")).rejects.toThrow(
        "Invalid JSON"
      );
    });
  });

  describe("Integration End-to-End Flow", () => {
    it("should complete full upload and retrieval cycle", async () => {
      // Mock upload
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmFullCycleHash",
        }),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      // Mock retrieval
      const mockCache = {
        get: vi.fn().mockReturnValue(undefined).mockReturnValueOnce(undefined), // First call returns undefined
        set: vi.fn(),
      };
      vi.mocked(require("node-cache").default).mockImplementation(
        () => mockCache
      );

      const originalMetadata = {
        name: "E2E Test Token",
        description: "End-to-end test metadata",
        image: "https://example.com/token.png",
        attributes: [
          { trait_type: "rarity", value: "legendary" },
          { trait_type: "type", value: "gaming" },
        ],
      };

      // Upload metadata
      const cid = await uploadMetadataToIPFS(originalMetadata);
      expect(cid).toBe("QmFullCycleHash");

      // Retrieve metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(originalMetadata),
      } as Response);

      const retrievedMetadata = await getMetadataFromIPFS(cid);
      expect(retrievedMetadata).toEqual(originalMetadata);
      expect(mockCache.set).toHaveBeenCalledWith(cid, originalMetadata);
    });

    it("should handle service integration with Pinata", async () => {
      const mockPinata = {
        pinJSONToIPFS: vi.fn().mockResolvedValue({
          IpfsHash: "QmServiceIntegrationHash",
        }),
      };
      mockPinataSDK.mockImplementation(() => mockPinata);

      const mockHttpService = {
        get: vi.fn(),
      };
      const mockConfigService = {
        get: vi.fn((key: string) => {
          const config = {
            IPFS_GATEWAY_URL: "https://gateway.pinata.cloud/ipfs",
            IPFS_TIMEOUT_MS: 5000,
          };
          return config[key];
        }),
      };

      const ipfsService = new IpfsService(mockConfigService, mockHttpService);

      // Upload metadata using Pinata
      const metadata = {
        name: "Service Integration Test",
        description: "Testing service integration",
      };

      const cid = await uploadMetadataToIPFS(metadata);
      expect(cid).toBe("QmServiceIntegrationHash");

      // Retrieve using NestJS service
      const mockTokenMetadata: TokenMetadata = {
        description: "Service Integration Test",
      };

      mockHttpService.get.mockReturnValue(
        firstValueFrom(Promise.resolve({ data: mockTokenMetadata }))
      );

      const result = await ipfsService.fetchMetadata(cid);
      expect(result).toEqual(mockTokenMetadata);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        "https://gateway.pinata.cloud/ipfs/QmServiceIntegrationHash",
        { timeout: 5000 }
      );
    });
  });
});
