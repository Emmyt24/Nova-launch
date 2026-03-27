import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { TokensService } from "../../src/tokens/tokens.service";
import { StellarService } from "../../src/tokens/stellar.service";
import { IpfsService } from "../../src/tokens/ipfs.service";
import { TokenCacheService } from "../../src/tokens/token-cache.service";
import { TokenInclude } from "../../src/tokens/dto/get-token-query.dto";

const mockStellarService = {
  parseAddress: jest.fn(),
  getAssetData: jest.fn(),
  getAssetCreationInfo: jest.fn(),
  getBurnStatistics: jest.fn(),
  getVolumeData: jest.fn(),
};

const mockIpfsService = {
  fetchMetadata: jest.fn(),
};

const mockTokenCacheService = {
  buildKey: jest.fn().mockReturnValue("cache-key"),
  get: jest.fn(),
  set: jest.fn(),
};

const mockAssetData = {
  asset_code: "USDC",
  asset_issuer: "GABCDE",
  amount: "1000000.0000000",
  num_accounts: 5000,
  balances: {
    authorized: "900000.0000000",
    authorized_to_maintain_liabilities: "0",
    unauthorized: "0",
  },
  flags: {
    auth_required: false,
    auth_revocable: false,
    auth_immutable: false,
    auth_clawback_enabled: false,
  },
  claimable_balances_amount: "0",
  liquidity_pools_amount: "0",
  contracts_amount: "0",
  archived_contracts_amount: "0",
  paging_token: "",
};

describe("TokensService", () => {
  let service: TokensService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokensService,
        { provide: StellarService, useValue: mockStellarService },
        { provide: IpfsService, useValue: mockIpfsService },
        { provide: TokenCacheService, useValue: mockTokenCacheService },
      ],
    }).compile();
    service = module.get<TokensService>(TokensService);
  });

  describe("getToken - cache behavior", () => {
    it("should return cached token if available", async () => {
      const cachedToken = { basicInfo: { name: "USDC" } } as any;
      mockTokenCacheService.get.mockResolvedValue(cachedToken);

      const result = await service.getToken("USDC:GABCDE");
      expect(result.cached).toBe(true);
      expect(result.token).toEqual(cachedToken);
      expect(mockStellarService.getAssetData).not.toHaveBeenCalled();
    });

    it("should fetch from blockchain on cache miss", async () => {
      mockTokenCacheService.get.mockResolvedValue(null);
      mockStellarService.parseAddress.mockReturnValue({
        assetCode: "USDC",
        assetIssuer: "GABCDE",
      });
      mockStellarService.getAssetData.mockResolvedValue(mockAssetData);
      mockStellarService.getAssetCreationInfo.mockResolvedValue({
        creatorAddress: "GCREATOR",
        createdAt: "2022-01-01T00:00:00Z",
      });
      mockTokenCacheService.set.mockResolvedValue(undefined);

      const result = await service.getToken("USDC:GABCDE");
      expect(result.cached).toBe(false);
      expect(result.token.basicInfo.symbol).toBe("USDC");
    });
  });

  describe("getToken - error handling", () => {
    beforeEach(() => {
      mockTokenCacheService.get.mockResolvedValue(null);
    });

    it("should throw NotFoundException when asset not found on Stellar", async () => {
      mockStellarService.parseAddress.mockReturnValue({
        assetCode: "FAKE",
        assetIssuer: "GABCDE",
      });
      mockStellarService.getAssetData.mockResolvedValue(null);

      await expect(service.getToken("FAKE:GABCDE")).rejects.toThrow(
        NotFoundException
      );
    });

    it("should throw BadRequestException for invalid address", async () => {
      mockStellarService.parseAddress.mockReturnValue({
        assetCode: "",
        assetIssuer: "",
      });

      await expect(service.getToken("invalid")).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe("getToken - with includes", () => {
    beforeEach(() => {
      mockTokenCacheService.get.mockResolvedValue(null);
      mockStellarService.parseAddress.mockReturnValue({
        assetCode: "USDC",
        assetIssuer: "GABCDE",
      });
      mockStellarService.getAssetData.mockResolvedValue(mockAssetData);
      mockStellarService.getAssetCreationInfo.mockResolvedValue({
        creatorAddress: "GCREATOR",
        createdAt: "2022-01-01T00:00:00Z",
      });
      mockTokenCacheService.set.mockResolvedValue(undefined);
    });

    it("should fetch burn stats when include=burns", async () => {
      mockStellarService.getBurnStatistics.mockResolvedValue({
        totalBurned: "5000.0000000",
        burnCount: 3,
        percentBurned: "0.5000",
      });

      const result = await service.getToken("USDC:GABCDE", {
        include: [TokenInclude.BURNS],
      });

      expect(mockStellarService.getBurnStatistics).toHaveBeenCalledWith(
        "USDC",
        "GABCDE",
        "1000000.0000000"
      );
      expect(result.token.burnInfo.burnCount).toBe(3);
    });

    it("should fetch analytics when include=analytics", async () => {
      mockStellarService.getVolumeData.mockResolvedValue({
        volume24h: "50000.0000000",
        volume7d: "300000.0000000",
        txCount24h: 200,
      });

      const result = await service.getToken("USDC:GABCDE", {
        include: [TokenInclude.ANALYTICS],
      });

      expect(mockStellarService.getVolumeData).toHaveBeenCalledWith(
        "USDC",
        "GABCDE"
      );
      expect(result.token.analytics.volume24h).toBe("50000.0000000");
      expect(result.token.analytics.txCount24h).toBe(200);
    });

    it("should fetch metadata when include=metadata", async () => {
      const result = await service.getToken("USDC:GABCDE", {
        include: [TokenInclude.METADATA],
      });

      // Metadata returns null for now (no toml integration)
      expect(result.token.metadata).toBeUndefined();
    });

    it("should handle failed optional fetches gracefully", async () => {
      mockStellarService.getBurnStatistics.mockRejectedValue(
        new Error("Network error")
      );
      mockStellarService.getVolumeData.mockRejectedValue(
        new Error("Network error")
      );

      const result = await service.getToken("USDC:GABCDE", {
        include: [TokenInclude.BURNS, TokenInclude.ANALYTICS],
      });

      // Should still return token with default values
      expect(result.token).toBeDefined();
      expect(result.token.basicInfo.symbol).toBe("USDC");
    });

    it("should cache result after successful fetch", async () => {
      const result = await service.getToken("USDC:GABCDE");
      expect(mockTokenCacheService.set).toHaveBeenCalledWith(
        "cache-key",
        result.token
      );
    });
  });

  describe("getToken - supply calculation", () => {
    beforeEach(() => {
      mockTokenCacheService.get.mockResolvedValue(null);
      mockStellarService.parseAddress.mockReturnValue({
        assetCode: "USDC",
        assetIssuer: "GABCDE",
      });
      mockStellarService.getAssetCreationInfo.mockResolvedValue({
        creatorAddress: "GCREATOR",
        createdAt: "2022-01-01T00:00:00Z",
      });
      mockTokenCacheService.set.mockResolvedValue(undefined);
    });

    it("should correctly map supply fields from asset data", async () => {
      mockStellarService.getAssetData.mockResolvedValue(mockAssetData);
      const result = await service.getToken("USDC:GABCDE");
      expect(result.token.supplyInfo.total).toBe("1000000.0000000");
    });

    it("should set decimals to 7 for Stellar assets", async () => {
      mockStellarService.getAssetData.mockResolvedValue(mockAssetData);
      const result = await service.getToken("USDC:GABCDE");
      expect(result.token.basicInfo.decimals).toBe(7);
    });
  });
});
