import { Test, TestingModule } from "@nestjs/testing";
import { NonceService } from "../nonce.service";
import { AUTH_CONSTANTS } from "../auth.constants";

describe("NonceService", () => {
  let service: NonceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NonceService],
    }).compile();

    service = module.get(NonceService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe("generateNonce", () => {
    it("should generate a unique nonce for a public key", () => {
      const pubKey = "GXXXXXXXX";
      const result = service.generateNonce(pubKey);

      expect(result.nonce).toBeDefined();
      expect(result.nonce.length).toBeGreaterThan(0);
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(result.message).toContain(result.nonce);
    });

    it("should generate different nonces on each call", () => {
      const pubKey = "GXXXXXXXX";
      const r1 = service.generateNonce(pubKey);
      const r2 = service.generateNonce(pubKey);

      expect(r1.nonce).not.toBe(r2.nonce);
    });

    it("should set expiry correctly", () => {
      const before = Date.now();
      const result = service.generateNonce("GXXXXXXXX");
      const after = Date.now();

      expect(result.expiresAt).toBeGreaterThanOrEqual(
        before + AUTH_CONSTANTS.NONCE_EXPIRY_MS - 10
      );
      expect(result.expiresAt).toBeLessThanOrEqual(
        after + AUTH_CONSTANTS.NONCE_EXPIRY_MS + 10
      );
    });
  });

  describe("consumeNonce", () => {
    it("should return true for valid, unused nonce", () => {
      const pubKey = "GTEST123";
      const { nonce } = service.generateNonce(pubKey);

      expect(service.consumeNonce(nonce, pubKey)).toBe(true);
    });

    it("should return false on second consumption (one-time use)", () => {
      const pubKey = "GTEST123";
      const { nonce } = service.generateNonce(pubKey);

      service.consumeNonce(nonce, pubKey);
      expect(service.consumeNonce(nonce, pubKey)).toBe(false);
    });

    it("should return false for unknown nonce", () => {
      expect(service.consumeNonce("non-existent-nonce", "GTEST123")).toBe(
        false
      );
    });

    it("should return false for wrong public key", () => {
      const pubKey = "GTEST123";
      const { nonce } = service.generateNonce(pubKey);

      expect(service.consumeNonce(nonce, "GDIFFERENT")).toBe(false);
    });

    it("should return false for expired nonce", () => {
      jest.useFakeTimers();
      const pubKey = "GTEST123";
      const { nonce } = service.generateNonce(pubKey);

      // Advance past expiry
      jest.advanceTimersByTime(AUTH_CONSTANTS.NONCE_EXPIRY_MS + 1000);

      expect(service.consumeNonce(nonce, pubKey)).toBe(false);
      jest.useRealTimers();
    });
  });
});
