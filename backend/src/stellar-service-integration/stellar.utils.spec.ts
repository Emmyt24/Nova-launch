import {
  isValidStellarAddress,
  isValidContractAddress,
  isValidAddress,
  assertValidAddress,
  truncateAddress,
  stroopsToXlm,
  xlmToStroops,
  formatTokenAmount,
  sleep,
  calculateBackoff,
} from "./stellar.utils";
import { StellarInvalidAddressException } from "./stellar.exceptions";

describe("stellar.utils", () => {
  // ---------------------------------------------------------------------------
  // Address validation
  // ---------------------------------------------------------------------------
  describe("isValidStellarAddress", () => {
    it("returns true for a valid G-address", () => {
      // 56-char G... address
      expect(
        isValidStellarAddress(
          "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        )
      ).toBe(true);
    });

    it("returns false for a C-address", () => {
      expect(
        isValidStellarAddress(
          "CAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        )
      ).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isValidStellarAddress("")).toBe(false);
    });

    it("returns false for a too-short address", () => {
      expect(isValidStellarAddress("GABC")).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isValidStellarAddress(null as any)).toBe(false);
      expect(isValidStellarAddress(undefined as any)).toBe(false);
    });
  });

  describe("isValidContractAddress", () => {
    it("returns true for a valid C-address", () => {
      expect(
        isValidContractAddress(
          "CAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        )
      ).toBe(true);
    });

    it("returns false for a G-address", () => {
      expect(
        isValidContractAddress(
          "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        )
      ).toBe(false);
    });
  });

  describe("isValidAddress", () => {
    it("returns true for G-address", () => {
      expect(
        isValidAddress(
          "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        )
      ).toBe(true);
    });

    it("returns true for C-address", () => {
      expect(
        isValidAddress(
          "CAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        )
      ).toBe(true);
    });

    it("returns false for invalid string", () => {
      expect(isValidAddress("not-an-address")).toBe(false);
    });
  });

  describe("assertValidAddress", () => {
    it("does not throw for valid address", () => {
      expect(() =>
        assertValidAddress(
          "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
        )
      ).not.toThrow();
    });

    it("throws StellarInvalidAddressException for invalid address", () => {
      expect(() => assertValidAddress("bad-address")).toThrow(
        StellarInvalidAddressException
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Display helpers
  // ---------------------------------------------------------------------------
  describe("truncateAddress", () => {
    it("truncates a long address", () => {
      const addr = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
      expect(truncateAddress(addr, 4)).toBe("GAAZ...CWWN");
    });

    it("returns unchanged address when shorter than threshold", () => {
      expect(truncateAddress("GABC", 4)).toBe("GABC");
    });
  });

  // ---------------------------------------------------------------------------
  // Amount conversions
  // ---------------------------------------------------------------------------
  describe("stroopsToXlm", () => {
    it("converts 10000000 stroops to 1 XLM", () => {
      expect(stroopsToXlm(10_000_000)).toBe("1.0000000");
    });

    it("converts 1 stroop correctly", () => {
      expect(stroopsToXlm(1)).toBe("0.0000001");
    });
  });

  describe("xlmToStroops", () => {
    it("converts 1 XLM to 10000000 stroops", () => {
      expect(xlmToStroops("1")).toBe("10000000");
    });

    it("converts 0.5 XLM", () => {
      expect(xlmToStroops("0.5")).toBe("5000000");
    });
  });

  describe("formatTokenAmount", () => {
    it("formats with 7 decimals", () => {
      expect(formatTokenAmount("10000000", 7)).toBe("1.0000000");
    });

    it("formats with 2 decimals", () => {
      expect(formatTokenAmount("100", 2)).toBe("1.00");
    });
  });

  // ---------------------------------------------------------------------------
  // Async utilities
  // ---------------------------------------------------------------------------
  describe("sleep", () => {
    it("resolves after the given delay", async () => {
      const start = Date.now();
      await sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });

  describe("calculateBackoff", () => {
    it("calculates correct exponential backoff", () => {
      expect(calculateBackoff(0, 1000, 10000, 2)).toBe(1000);
      expect(calculateBackoff(1, 1000, 10000, 2)).toBe(2000);
      expect(calculateBackoff(2, 1000, 10000, 2)).toBe(4000);
    });

    it("caps at maxDelay", () => {
      expect(calculateBackoff(10, 1000, 5000, 2)).toBe(5000);
    });
  });
});
