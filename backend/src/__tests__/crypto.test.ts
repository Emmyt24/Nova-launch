import { describe, it, expect } from "vitest";
import {
  generateWebhookSecret,
  generateSignature,
  verifySignature,
  isValidUrl,
  isValidStellarAddress,
} from "../utils/crypto";

describe("Crypto Utils", () => {
  describe("generateWebhookSecret", () => {
    it("should generate secret of specified length", () => {
      const secret = generateWebhookSecret(32);
      expect(secret).toHaveLength(64); // hex encoding doubles length
    });

    it("should generate unique secrets", () => {
      const secret1 = generateWebhookSecret();
      const secret2 = generateWebhookSecret();
      expect(secret1).not.toBe(secret2);
    });
  });

  describe("generateSignature and verifySignature", () => {
    it("should generate and verify valid signature", () => {
      const payload = JSON.stringify({ test: "data" });
      const secret = "test-secret";

      const signature = generateSignature(payload, secret);
      const isValid = verifySignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it("should reject invalid signature", () => {
      const payload = JSON.stringify({ test: "data" });
      const secret = "test-secret";
      const wrongSignature = "invalid-signature";

      expect(() => {
        verifySignature(payload, wrongSignature, secret);
      }).toThrow();
    });

    it("should reject signature with wrong secret", () => {
      const payload = JSON.stringify({ test: "data" });
      const secret1 = "secret1";
      const secret2 = "secret2";

      const signature = generateSignature(payload, secret1);

      const isValid = verifySignature(payload, signature, secret2);
      expect(isValid).toBe(false);
    });
  });

  describe("isValidUrl", () => {
    it("should accept valid HTTP URLs", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
      expect(isValidUrl("https://example.com/webhook")).toBe(true);
    });

    it("should reject invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("isValidStellarAddress", () => {
    it("should accept valid Stellar addresses", () => {
      expect(
        isValidStellarAddress(
          "GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABC"
        )
      ).toBe(true);
    });

    it("should reject invalid Stellar addresses", () => {
      expect(isValidStellarAddress("INVALID")).toBe(false);
      expect(isValidStellarAddress("SABC123...")).toBe(false); // Secret key
      expect(isValidStellarAddress("")).toBe(false);
    });
  });
});
