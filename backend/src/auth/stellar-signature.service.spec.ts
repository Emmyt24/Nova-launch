import { Test, TestingModule } from "@nestjs/testing";
import { StellarSignatureService } from "../stellar-signature.service";
import * as StellarSdk from "stellar-sdk";
import { AUTH_CONSTANTS } from "../auth.constants";

describe("StellarSignatureService", () => {
  let service: StellarSignatureService;
  let keypair: StellarSdk.Keypair;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarSignatureService],
    }).compile();

    service = module.get(StellarSignatureService);
    keypair = StellarSdk.Keypair.random();
  });

  describe("buildSignMessage", () => {
    it("should include the prefix and nonce", () => {
      const nonce = "test-nonce-123";
      const message = service.buildSignMessage(nonce);
      expect(message).toBe(`${AUTH_CONSTANTS.STELLAR_MESSAGE_PREFIX}${nonce}`);
    });
  });

  describe("isValidPublicKey", () => {
    it("should return true for valid Stellar public key", () => {
      expect(service.isValidPublicKey(keypair.publicKey())).toBe(true);
    });

    it("should return false for invalid key", () => {
      expect(service.isValidPublicKey("not-a-key")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(service.isValidPublicKey("")).toBe(false);
    });
  });

  describe("verifySignature", () => {
    it("should verify a valid signature", () => {
      const nonce = "valid-nonce-123";
      const message = service.buildSignMessage(nonce);
      const messageBuffer = Buffer.from(message, "utf8");
      const signature = keypair.sign(messageBuffer).toString("base64");

      const result = service.verifySignature(
        keypair.publicKey(),
        signature,
        nonce
      );

      expect(result.valid).toBe(true);
      expect(result.publicKey).toBe(keypair.publicKey());
      expect(result.error).toBeUndefined();
    });

    it("should reject a tampered signature", () => {
      const nonce = "valid-nonce-123";
      const message = service.buildSignMessage(nonce);
      const messageBuffer = Buffer.from(message, "utf8");
      const signature = keypair.sign(messageBuffer).toString("base64");

      // Tamper with signature
      const tamperedSig = Buffer.from(signature, "base64");
      tamperedSig[0] = tamperedSig[0] ^ 0xff;

      const result = service.verifySignature(
        keypair.publicKey(),
        tamperedSig.toString("base64"),
        nonce
      );

      expect(result.valid).toBe(false);
    });

    it("should reject signature for different nonce", () => {
      const nonce = "original-nonce";
      const differentNonce = "different-nonce";
      const message = service.buildSignMessage(nonce);
      const messageBuffer = Buffer.from(message, "utf8");
      const signature = keypair.sign(messageBuffer).toString("base64");

      const result = service.verifySignature(
        keypair.publicKey(),
        signature,
        differentNonce
      );

      expect(result.valid).toBe(false);
    });

    it("should reject signature from different keypair", () => {
      const nonce = "test-nonce";
      const anotherKeypair = StellarSdk.Keypair.random();
      const message = service.buildSignMessage(nonce);
      const messageBuffer = Buffer.from(message, "utf8");
      const signature = anotherKeypair.sign(messageBuffer).toString("base64");

      const result = service.verifySignature(
        keypair.publicKey(),
        signature,
        nonce
      );

      expect(result.valid).toBe(false);
    });

    it("should return error for invalid public key", () => {
      const result = service.verifySignature("invalid-key", "sig", "nonce");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
