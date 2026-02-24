import { describe, it, expect } from "vitest";
import {
  validateImageFile,
  validateMetadata,
} from "@/lib/validation/validator";

describe("Validation", () => {
  describe("validateImageFile", () => {
    it("should accept valid JPEG file under 5MB", () => {
      const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(file, "size", { value: 1024 * 1024 });

      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
    });

    it("should reject file over 5MB", () => {
      const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });

      const result = validateImageFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("5MB");
    });

    it("should reject invalid file type", () => {
      const file = new File(["test"], "test.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: 1024 });

      const result = validateImageFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid file type");
    });
  });

  describe("validateMetadata", () => {
    it("should accept valid metadata", () => {
      const data = { name: "Token", symbol: "TKN", decimals: 18 };
      const result = validateMetadata(data);
      expect(result.valid).toBe(true);
    });

    it("should reject missing name", () => {
      const data = { symbol: "TKN", decimals: 18 };
      const result = validateMetadata(data);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Name");
    });

    it("should reject missing symbol", () => {
      const data = { name: "Token", decimals: 18 };
      const result = validateMetadata(data);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Symbol");
    });

    it("should reject missing decimals", () => {
      const data = { name: "Token", symbol: "TKN" };
      const result = validateMetadata(data);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Decimals");
    });
  });
});
