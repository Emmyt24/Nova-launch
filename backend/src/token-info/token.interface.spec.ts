import {
  Token,
  TokenApiResponse,
} from "../../src/tokens/interfaces/token.interface";

describe("Token Interfaces", () => {
  it("should correctly type a full Token object", () => {
    const token: Token = {
      basicInfo: {
        name: "TEST",
        symbol: "TEST",
        decimals: 7,
        address: "TEST:GABCDE",
      },
      supplyInfo: {
        total: "1000000",
        initial: "1000000",
        circulating: "900000",
      },
      burnInfo: {
        totalBurned: "100000",
        burnCount: 5,
        percentBurned: "10.0000",
      },
      creator: {
        address: "GABCDE",
        createdAt: "2024-01-01T00:00:00Z",
      },
      analytics: {
        volume24h: "50000",
        volume7d: "300000",
        txCount24h: 120,
      },
    };

    expect(token.basicInfo.symbol).toBe("TEST");
    expect(token.supplyInfo.total).toBe("1000000");
    expect(token.burnInfo.burnCount).toBe(5);
  });

  it("should correctly type a TokenApiResponse with success", () => {
    const response: TokenApiResponse = {
      success: true,
      data: {
        basicInfo: { name: "T", symbol: "T", decimals: 7, address: "T:G" },
        supplyInfo: { total: "1", initial: "1", circulating: "1" },
        burnInfo: { totalBurned: "0", burnCount: 0, percentBurned: "0" },
        creator: { address: "G", createdAt: "2024-01-01T00:00:00Z" },
        analytics: { volume24h: "0", volume7d: "0" },
      },
      cached: false,
      timestamp: new Date().toISOString(),
    };
    expect(response.success).toBe(true);
    expect(response.error).toBeUndefined();
  });

  it("should correctly type a TokenApiResponse with error", () => {
    const response: TokenApiResponse = {
      success: false,
      error: "Token not found",
      cached: false,
      timestamp: new Date().toISOString(),
    };
    expect(response.success).toBe(false);
    expect(response.data).toBeUndefined();
  });
});
