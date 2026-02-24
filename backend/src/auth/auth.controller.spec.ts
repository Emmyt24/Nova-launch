import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "../auth.controller";
import { AuthService } from "../auth.service";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { Reflector } from "@nestjs/core";

const mockTokenPair = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresIn: 900,
  tokenType: "Bearer",
  walletAddress: "GTEST",
};

describe("AuthController", () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            requestNonce: jest.fn(),
            authenticateWithWallet: jest.fn(),
            refreshTokens: jest.fn(),
            logout: jest.fn(),
          },
        },
        {
          provide: JwtAuthGuard,
          useValue: { canActivate: jest.fn(() => true) },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService) as jest.Mocked<AuthService>;
  });

  describe("getNonce", () => {
    it("should return a nonce", () => {
      const mockNonce = { nonce: "abc", expiresAt: 99999, message: "Sign..." };
      authService.requestNonce.mockReturnValue(mockNonce);

      expect(controller.getNonce("GTEST")).toBe(mockNonce);
      expect(authService.requestNonce).toHaveBeenCalledWith("GTEST");
    });
  });

  describe("login", () => {
    it("should return token pair", async () => {
      authService.authenticateWithWallet.mockResolvedValue(mockTokenPair);

      const dto = { publicKey: "GTEST", signature: "sig", nonce: "nonce" };
      const result = await controller.login(dto);

      expect(result).toBe(mockTokenPair);
      expect(authService.authenticateWithWallet).toHaveBeenCalledWith(dto);
    });
  });

  describe("refresh", () => {
    it("should return new token pair", () => {
      authService.refreshTokens.mockReturnValue(mockTokenPair);

      const result = controller.refresh({ refreshToken: "old-rt" });

      expect(result).toBe(mockTokenPair);
    });
  });

  describe("logout", () => {
    it("should revoke token when jti present", () => {
      const user = {
        sub: "GTEST",
        walletAddress: "GTEST",
        type: "access" as const,
        jti: "test-jti",
      };
      controller.logout(user);
      expect(authService.logout).toHaveBeenCalledWith("test-jti");
    });

    it("should not call logout when jti absent", () => {
      const user = {
        sub: "GTEST",
        walletAddress: "GTEST",
        type: "access" as const,
      };
      controller.logout(user as any);
      expect(authService.logout).not.toHaveBeenCalled();
    });
  });

  describe("me", () => {
    it("should return current user", () => {
      const user = {
        sub: "GTEST",
        walletAddress: "GTEST",
        type: "access" as const,
      };
      expect(controller.me(user as any)).toBe(user);
    });
  });
});
