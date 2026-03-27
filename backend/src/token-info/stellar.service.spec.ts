import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { of, throwError } from "rxjs";
import { AxiosResponse } from "axios";
import { StellarService } from "../../src/tokens/stellar.service";

const mockHttpService = {
  get: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      STELLAR_HORIZON_URL: "https://horizon.stellar.org",
    };
    return config[key];
  }),
};

function makeResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as any,
  };
}

describe("StellarService", () => {
  let service: StellarService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  describe("parseAddress", () => {
    it("should parse ASSET_CODE:ISSUER format", () => {
      const result = service.parseAddress("USDC:GABCDE12345");
      expect(result).toEqual({ assetCode: "USDC", assetIssuer: "GABCDE12345" });
    });

    it("should handle standalone address", () => {
      const result = service.parseAddress("GABCDE12345");
      expect(result).toEqual({
        assetCode: "UNKNOWN",
        assetIssuer: "GABCDE12345",
      });
    });
  });

  describe("getAssetData", () => {
    it("should return asset data when found", async () => {
      const mockAsset = {
        asset_code: "USDC",
        asset_issuer: "GABCDE",
        amount: "1000000.0000000",
        num_accounts: 5000,
        balances: {
          authorized: "900000",
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

      mockHttpService.get.mockReturnValue(
        of(makeResponse({ _embedded: { records: [mockAsset] } }))
      );

      const result = await service.getAssetData("USDC", "GABCDE");
      expect(result).toEqual(mockAsset);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining("asset_code=USDC")
      );
    });

    it("should return null when asset not found", async () => {
      mockHttpService.get.mockReturnValue(
        of(makeResponse({ _embedded: { records: [] } }))
      );
      const result = await service.getAssetData("FAKE", "GABCDE");
      expect(result).toBeNull();
    });

    it("should return null on HTTP error", async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error("Network error"))
      );
      const result = await service.getAssetData("USDC", "GABCDE");
      expect(result).toBeNull();
    });
  });

  describe("getAssetCreationInfo", () => {
    it("should return creation info when available", async () => {
      mockHttpService.get.mockReturnValue(
        of(
          makeResponse({
            _embedded: {
              records: [
                {
                  type: "create_account",
                  created_at: "2022-01-01T00:00:00Z",
                  source_account: "GCREATOR",
                },
              ],
            },
          })
        )
      );
      const result = await service.getAssetCreationInfo("USDC", "GABCDE");
      expect(result?.creatorAddress).toBe("GCREATOR");
      expect(result?.createdAt).toBe("2022-01-01T00:00:00Z");
    });

    it("should return fallback when no operations found", async () => {
      mockHttpService.get.mockReturnValue(
        of(makeResponse({ _embedded: { records: [] } }))
      );
      const result = await service.getAssetCreationInfo("USDC", "GABCDE");
      expect(result?.creatorAddress).toBe("GABCDE");
    });

    it("should return fallback on error", async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error("Error")));
      const result = await service.getAssetCreationInfo("USDC", "GABCDE");
      expect(result?.creatorAddress).toBe("GABCDE");
    });
  });

  describe("getBurnStatistics", () => {
    it("should calculate burn stats from payments to issuer", async () => {
      mockHttpService.get.mockReturnValue(
        of(
          makeResponse({
            _embedded: {
              records: [
                {
                  type: "payment",
                  asset_code: "USDC",
                  to: "GABCDE",
                  amount: "500.0000000",
                },
                {
                  type: "payment",
                  asset_code: "USDC",
                  to: "GABCDE",
                  amount: "300.0000000",
                },
                {
                  type: "payment",
                  asset_code: "USDC",
                  to: "GOTHER",
                  amount: "100.0000000",
                }, // not a burn
              ],
            },
          })
        )
      );

      const result = await service.getBurnStatistics("USDC", "GABCDE", "10000");
      expect(result.burnCount).toBe(2);
      expect(parseFloat(result.totalBurned)).toBeCloseTo(800, 1);
      expect(parseFloat(result.percentBurned)).toBeCloseTo(8, 1);
    });

    it("should return zero stats on error", async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error("Error")));
      const result = await service.getBurnStatistics("USDC", "GABCDE", "10000");
      expect(result).toEqual({
        totalBurned: "0",
        burnCount: 0,
        percentBurned: "0.0000",
      });
    });
  });

  describe("getVolumeData", () => {
    it("should calculate 24h and 7d volumes", async () => {
      const recentTime = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
      const oldTime = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(); // 48 hours ago

      mockHttpService.get.mockReturnValue(
        of(
          makeResponse({
            _embedded: {
              records: [
                {
                  base_amount: "1000.0000000",
                  counter_amount: "2000",
                  ledger_close_time: recentTime,
                },
                {
                  base_amount: "500.0000000",
                  counter_amount: "1000",
                  ledger_close_time: oldTime,
                },
              ],
            },
          })
        )
      );

      const result = await service.getVolumeData("USDC", "GABCDE");
      expect(parseFloat(result.volume24h)).toBeCloseTo(1000, 0);
      expect(parseFloat(result.volume7d)).toBeCloseTo(1500, 0);
      expect(result.txCount24h).toBe(1);
    });

    it("should return zero volumes on error", async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error("Error")));
      const result = await service.getVolumeData("USDC", "GABCDE");
      expect(result).toEqual({ volume24h: "0", volume7d: "0", txCount24h: 0 });
    });
  });
});
