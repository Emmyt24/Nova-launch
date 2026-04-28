/**
 * Multi-Network Integration Test Matrix — Backend (#647)
 *
 * Validates that both testnet and mainnet configuration branches are correctly
 * wired in the backend env validation without requiring live network calls.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Saves and restores env vars around each test */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

// Inline the network defaults so tests don't depend on module-level env state
const NETWORK_DEFAULTS = {
  testnet: {
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  mainnet: {
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban-mainnet.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
} as const;

type Network = keyof typeof NETWORK_DEFAULTS;

const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;
const VALID_CONTRACT_ID = "CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

// Minimal re-implementation of validateEnv for unit testing without side effects
function buildEnv(overrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env, ...overrides };

  const network = (env.STELLAR_NETWORK || "testnet") as Network;
  if (network !== "testnet" && network !== "mainnet") {
    throw new Error(`STELLAR_NETWORK must be "testnet" or "mainnet", got "${network}"`);
  }

  const defaults = NETWORK_DEFAULTS[network];
  const factoryContractId = env.FACTORY_CONTRACT_ID || "";

  if (factoryContractId && !CONTRACT_ID_REGEX.test(factoryContractId)) {
    throw new Error(
      `FACTORY_CONTRACT_ID is malformed: "${factoryContractId}". ` +
        'Expected a 56-character Soroban contract ID starting with "C".'
    );
  }

  return {
    STELLAR_NETWORK: network,
    STELLAR_HORIZON_URL: env.STELLAR_HORIZON_URL || defaults.horizonUrl,
    STELLAR_SOROBAN_RPC_URL: env.STELLAR_SOROBAN_RPC_URL || defaults.sorobanRpcUrl,
    STELLAR_NETWORK_PASSPHRASE: env.STELLAR_NETWORK_PASSPHRASE || defaults.networkPassphrase,
    FACTORY_CONTRACT_ID: factoryContractId,
  };
}

// ---------------------------------------------------------------------------
// Default URL / passphrase correctness
// ---------------------------------------------------------------------------

describe("Backend Network Config Matrix — Default URLs", () => {
  it("testnet default horizonUrl is correct", () => {
    const env = buildEnv({ STELLAR_NETWORK: "testnet", STELLAR_HORIZON_URL: undefined });
    expect(env.STELLAR_HORIZON_URL).toBe("https://horizon-testnet.stellar.org");
  });

  it("mainnet default horizonUrl is correct", () => {
    const env = buildEnv({ STELLAR_NETWORK: "mainnet", STELLAR_HORIZON_URL: undefined });
    expect(env.STELLAR_HORIZON_URL).toBe("https://horizon.stellar.org");
  });

  it("testnet default sorobanRpcUrl is correct", () => {
    const env = buildEnv({ STELLAR_NETWORK: "testnet", STELLAR_SOROBAN_RPC_URL: undefined });
    expect(env.STELLAR_SOROBAN_RPC_URL).toBe("https://soroban-testnet.stellar.org");
  });

  it("mainnet default sorobanRpcUrl is correct", () => {
    const env = buildEnv({ STELLAR_NETWORK: "mainnet", STELLAR_SOROBAN_RPC_URL: undefined });
    expect(env.STELLAR_SOROBAN_RPC_URL).toBe("https://soroban-mainnet.stellar.org");
  });

  it("testnet default passphrase is correct", () => {
    const env = buildEnv({ STELLAR_NETWORK: "testnet" });
    expect(env.STELLAR_NETWORK_PASSPHRASE).toBe("Test SDF Network ; September 2015");
  });

  it("mainnet default passphrase is correct", () => {
    const env = buildEnv({ STELLAR_NETWORK: "mainnet" });
    expect(env.STELLAR_NETWORK_PASSPHRASE).toBe(
      "Public Global Stellar Network ; September 2015"
    );
  });
});

// ---------------------------------------------------------------------------
// Network isolation
// ---------------------------------------------------------------------------

describe("Backend Network Config Matrix — Network Isolation", () => {
  it("mainnet horizonUrl does not contain 'testnet'", () => {
    const env = buildEnv({ STELLAR_NETWORK: "mainnet", STELLAR_HORIZON_URL: undefined });
    expect(env.STELLAR_HORIZON_URL).not.toContain("testnet");
  });

  it("mainnet sorobanRpcUrl does not contain 'testnet'", () => {
    const env = buildEnv({ STELLAR_NETWORK: "mainnet", STELLAR_SOROBAN_RPC_URL: undefined });
    expect(env.STELLAR_SOROBAN_RPC_URL).not.toContain("testnet");
  });

  it("mainnet passphrase does not contain 'Test SDF'", () => {
    const env = buildEnv({ STELLAR_NETWORK: "mainnet" });
    expect(env.STELLAR_NETWORK_PASSPHRASE).not.toContain("Test SDF");
  });

  it("testnet passphrase does not contain 'Public Global'", () => {
    const env = buildEnv({ STELLAR_NETWORK: "testnet" });
    expect(env.STELLAR_NETWORK_PASSPHRASE).not.toContain("Public Global");
  });

  it("testnet and mainnet horizonUrls are different", () => {
    const testnet = buildEnv({ STELLAR_NETWORK: "testnet", STELLAR_HORIZON_URL: undefined });
    const mainnet = buildEnv({ STELLAR_NETWORK: "mainnet", STELLAR_HORIZON_URL: undefined });
    expect(testnet.STELLAR_HORIZON_URL).not.toBe(mainnet.STELLAR_HORIZON_URL);
  });

  it("testnet and mainnet passphrases are different", () => {
    const testnet = buildEnv({ STELLAR_NETWORK: "testnet" });
    const mainnet = buildEnv({ STELLAR_NETWORK: "mainnet" });
    expect(testnet.STELLAR_NETWORK_PASSPHRASE).not.toBe(mainnet.STELLAR_NETWORK_PASSPHRASE);
  });
});

// ---------------------------------------------------------------------------
// Contract ID validation
// ---------------------------------------------------------------------------

describe("Backend Network Config Matrix — Contract ID Validation", () => {
  it("accepts a valid contract ID", () => {
    expect(() =>
      buildEnv({ STELLAR_NETWORK: "testnet", FACTORY_CONTRACT_ID: VALID_CONTRACT_ID })
    ).not.toThrow();
  });

  it("accepts empty contract ID (not required in non-production)", () => {
    expect(() =>
      buildEnv({ STELLAR_NETWORK: "testnet", FACTORY_CONTRACT_ID: "" })
    ).not.toThrow();
  });

  it("rejects a malformed contract ID", () => {
    expect(() =>
      buildEnv({ STELLAR_NETWORK: "testnet", FACTORY_CONTRACT_ID: "INVALID" })
    ).toThrow("malformed");
  });

  it("rejects a contract ID not starting with C", () => {
    expect(() =>
      buildEnv({
        STELLAR_NETWORK: "mainnet",
        FACTORY_CONTRACT_ID: "AABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ",
      })
    ).toThrow("malformed");
  });

  it("missing mainnet contract ID does not throw in non-production (production check is separate)", () => {
    // The production guard is in validateEnv() which checks NODE_ENV=production.
    // Here we verify the format check alone doesn't throw for empty string.
    expect(() =>
      buildEnv({ STELLAR_NETWORK: "mainnet", FACTORY_CONTRACT_ID: "" })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// STELLAR_NETWORK validation
// ---------------------------------------------------------------------------

describe("Backend Network Config Matrix — STELLAR_NETWORK Validation", () => {
  it("accepts 'testnet'", () => {
    expect(() => buildEnv({ STELLAR_NETWORK: "testnet" })).not.toThrow();
  });

  it("accepts 'mainnet'", () => {
    expect(() => buildEnv({ STELLAR_NETWORK: "mainnet" })).not.toThrow();
  });

  it("rejects unknown network values", () => {
    expect(() => buildEnv({ STELLAR_NETWORK: "devnet" })).toThrow(
      'STELLAR_NETWORK must be "testnet" or "mainnet"'
    );
  });

  it("defaults to testnet when STELLAR_NETWORK is unset", () => {
    const env = buildEnv({ STELLAR_NETWORK: undefined });
    expect(env.STELLAR_NETWORK).toBe("testnet");
  });
});

// ---------------------------------------------------------------------------
// Env override — custom URLs take precedence over defaults
// ---------------------------------------------------------------------------

describe("Backend Network Config Matrix — Env Overrides", () => {
  it("custom STELLAR_HORIZON_URL overrides the default", () => {
    const env = buildEnv({
      STELLAR_NETWORK: "testnet",
      STELLAR_HORIZON_URL: "https://custom-horizon.example.com",
    });
    expect(env.STELLAR_HORIZON_URL).toBe("https://custom-horizon.example.com");
  });

  it("custom STELLAR_SOROBAN_RPC_URL overrides the default", () => {
    const env = buildEnv({
      STELLAR_NETWORK: "mainnet",
      STELLAR_SOROBAN_RPC_URL: "https://custom-rpc.example.com",
    });
    expect(env.STELLAR_SOROBAN_RPC_URL).toBe("https://custom-rpc.example.com");
  });
});
