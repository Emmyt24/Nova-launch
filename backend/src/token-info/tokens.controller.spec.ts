import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { TokensController } from "../../src/tokens/tokens.controller";
import { TokensService } from "../../src/tokens/tokens.service";
import { TokenInclude } from "../../src/tokens/dto/get-token-query.dto";
import { Token } from "../../src/tokens/interfaces/token.interface";

const mockToken: Token = {
  basicInfo: {
    name: "USDC",
    symbol: "USDC",
    decimals: 7,
    address: "USDC:GABCDE",
  },
  supplyInfo: {
    total: "1000000.0000000",
    initial: "1000000.0000000",
    circulating: "900000.0000000",
  },
  burnInfo: {
    totalBurned: "0",
    burnCount: 0,
    percentBurned: "0.0000",
  },
  creator: {
    address: "GABCDE",
    createdAt: "2022-01-01T00:00:00Z",
  },
  analytics: {
    volume24h: "0",
    volume7d: "0",
  },
};

const mockTokensService = {
  getToken: jest.fn(),
};

describe("TokensController", () => {
  let controller: TokensController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokensController],
      providers: [{ provide: TokensService, useValue: mockTokensService }],
    }).compile();

    controller = module.get<TokensController>(TokensController);
  });

  describe("getToken", () => {
    it("should return a successful response with token data", async () => {
      mockTokensService.getToken.mockResolvedValue({
        token: mockToken,
        cached: false,
      });

      const result = await controller.getToken(
        { address: "USDC:GABCDE" },
        { include: undefined }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockToken);
      expect(result.cached).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it("should indicate when response is from cache", async () => {
      mockTokensService.getToken.mockResolvedValue({
        token: mockToken,
        cached: true,
      });

      const result = await controller.getToken(
        { address: "USDC:GABCDE" },
        { include: undefined }
      );

      expect(result.cached).toBe(true);
    });

    it("should pass include params to service", async () => {
      mockTokensService.getToken.mockResolvedValue({
        token: mockToken,
        cached: false,
      });

      await controller.getToken(
        { address: "USDC:GABCDE" },
        { include: [TokenInclude.BURNS, TokenInclude.ANALYTICS] }
      );

      expect(mockTokensService.getToken).toHaveBeenCalledWith("USDC:GABCDE", {
        include: [TokenInclude.BURNS, TokenInclude.ANALYTICS],
      });
    });

    it("should return timestamp as ISO string", async () => {
      mockTokensService.getToken.mockResolvedValue({
        token: mockToken,
        cached: false,
      });

      const result = await controller.getToken(
        { address: "USDC:GABCDE" },
        { include: undefined }
      );

      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should propagate NotFoundException from service", async () => {
      mockTokensService.getToken.mockRejectedValue(
        new NotFoundException("Token not found")
      );

      await expect(
        controller.getToken({ address: "FAKE:GABCDE" }, { include: undefined })
      ).rejects.toThrow(NotFoundException);
    });

    it("should propagate BadRequestException from service", async () => {
      mockTokensService.getToken.mockRejectedValue(
        new BadRequestException("Invalid address")
      );

      await expect(
        controller.getToken({ address: "invalid" }, { include: undefined })
      ).rejects.toThrow(BadRequestException);
    });
  });
});
