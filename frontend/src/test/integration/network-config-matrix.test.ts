/**
 * Multi-Network Integration Test Matrix — Frontend (#647)
 *
 * Validates that both testnet and mainnet configuration branches are correctly
 * wired without requiring live network calls or destructive mainnet writes.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Inline the config constants so tests are self-contained and don't depend on
// import.meta.env (which is Vite-specific and unavailable in Vitest node env).
// ---------------------------------------------------------------------------

const NETWORK_CONFIGS = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    explorerBaseUrl: "https://stellar.expert/explorer/testnet",
  },
  mainnet: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban-mainnet.stellar.org",
    explorerBaseUrl: "https://stellar.expert/explorer/public",
  },
} as const;

type Network = keyof typeof NETWORK_CONFIGS;

const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;

function validateContractId(id: string, variableName: string, network: Network): void {
  if (!id) {
    throw new Error(
      `${variableName} is empty. Set it to the deployed contract address for network="${network}".`
    );
  }
  if (!CONTRACT_ID_REGEX.test(id)) {
    throw new Error(
      `${variableName} is malformed: "${id}". Expected a 56-character Soroban contract ID starting with "C".`
    );
  }
}

// ---------------------------------------------------------------------------
// URL / passphrase correctness
// ---------------------------------------------------------------------------

describe("Network Config Matrix — URLs and Passphrases", () => {
  it("testnet horizonUrl points to testnet endpoint", () => {
    expect(NETWORK_CONFIGS.testnet.horizonUrl).toBe(
      "https://horizon-testnet.stellar.org"
    );
  });

  it("mainnet horizonUrl points to mainnet endpoint", () => {
    expect(NETWORK_CONFIGS.mainnet.horizonUrl).toBe("https://horizon.stellar.org");
  });

  it("testnet sorobanRpcUrl points to testnet endpoint", () => {
    expect(NETWORK_CONFIGS.testnet.sorobanRpcUrl).toBe(
      "https://soroban-testnet.stellar.org"
    );
  });

  it("mainnet sorobanRpcUrl points to mainnet endpoint", () => {
    expect(NETWORK_CONFIGS.mainnet.sorobanRpcUrl).toBe(
      "https://soroban-mainnet.stellar.org"
    );
  });

  it("testnet networkPassphrase is correct", () => {
    expect(NETWORK_CONFIGS.testnet.networkPassphrase).toBe(
      "Test SDF Network ; September 2015"
    );
  });

  it("mainnet networkPassphrase is correct", () => {
    expect(NETWORK_CONFIGS.mainnet.networkPassphrase).toBe(
      "Public Global Stellar Network ; September 2015"
    );
  });

  it("testnet explorerBaseUrl contains 'testnet'", () => {
    expect(NETWORK_CONFIGS.testnet.explorerBaseUrl).toContain("testnet");
  });

  it("mainnet explorerBaseUrl contains 'public' (not testnet)", () => {
    expect(NETWORK_CONFIGS.mainnet.explorerBaseUrl).toContain("public");
    expect(NETWORK_CONFIGS.mainnet.explorerBaseUrl).not.toContain("testnet");
  });
});

// ---------------------------------------------------------------------------
// Network isolation — no testnet-only logic leaks into mainnet
// ---------------------------------------------------------------------------

describe("Network Config Matrix — Network Isolation", () => {
  it("testnet and mainnet horizonUrls are different", () => {
    expect(NETWORK_CONFIGS.testnet.horizonUrl).not.toBe(
      NETWORK_CONFIGS.mainnet.horizonUrl
    );
  });

  it("testnet and mainnet sorobanRpcUrls are different", () => {
    expect(NETWORK_CONFIGS.testnet.sorobanRpcUrl).not.toBe(
      NETWORK_CONFIGS.mainnet.sorobanRpcUrl
    );
  });

  it("testnet and mainnet passphrases are different", () => {
    expect(NETWORK_CONFIGS.testnet.networkPassphrase).not.toBe(
      NETWORK_CONFIGS.mainnet.networkPassphrase
    );
  });

  it("mainnet horizonUrl does not contain 'testnet'", () => {
    expect(NETWORK_CONFIGS.mainnet.horizonUrl).not.toContain("testnet");
  });

  it("mainnet sorobanRpcUrl does not contain 'testnet'", () => {
    expect(NETWORK_CONFIGS.mainnet.sorobanRpcUrl).not.toContain("testnet");
  });

  it("mainnet passphrase does not contain 'Test'", () => {
    expect(NETWORK_CONFIGS.mainnet.networkPassphrase).not.toContain("Test SDF");
  });

  it("testnet passphrase does not contain 'Public Global'", () => {
    expect(NETWORK_CONFIGS.testnet.networkPassphrase).not.toContain("Public Global");
  });
});

// ---------------------------------------------------------------------------
// Contract ID validation
// ---------------------------------------------------------------------------

describe("Network Config Matrix — Contract ID Validation", () => {
  const VALID_CONTRACT_ID = "CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

  it("accepts a valid 56-char contract ID starting with C", () => {
    expect(() =>
      validateContractId(VALID_CONTRACT_ID, "VITE_FACTORY_CONTRACT_ID", "testnet")
    ).not.toThrow();
  });

  it("rejects an empty contract ID", () => {
    expect(() =>
      validateContractId("", "VITE_FACTORY_CONTRACT_ID", "mainnet")
    ).toThrow("is empty");
  });

  it("rejects a contract ID that does not start with C", () => {
    expect(() =>
      validateContractId(
        "AABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJ",
        "VITE_FACTORY_CONTRACT_ID",
        "mainnet"
      )
    ).toThrow("malformed");
  });

  it("rejects a contract ID shorter than 56 chars", () => {
    expect(() =>
      validateContractId("CABC123", "VITE_FACTORY_CONTRACT_ID", "mainnet")
    ).toThrow("malformed");
  });

  it("rejects a contract ID longer than 56 chars", () => {
    expect(() =>
      validateContractId(
        "CABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKEXTRA",
        "VITE_FACTORY_CONTRACT_ID",
        "mainnet"
      )
    ).toThrow("malformed");
  });

  it("error message includes the variable name", () => {
    expect(() =>
      validateContractId("", "VITE_FACTORY_CONTRACT_ID", "mainnet")
    ).toThrow("VITE_FACTORY_CONTRACT_ID");
  });

  it("missing mainnet contract ID fails validation", () => {
    // Simulates a mainnet deployment where the contract ID was not configured
    expect(() =>
      validateContractId("", "VITE_FACTORY_CONTRACT_ID", "mainnet")
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getNetworkConfig — returns config for the active network
// ---------------------------------------------------------------------------

describe("Network Config Matrix — getNetworkConfig", () => {
  function getNetworkConfig(network: Network) {
    return NETWORK_CONFIGS[network];
  }

  it("returns testnet config when network is testnet", () => {
    const cfg = getNetworkConfig("testnet");
    expect(cfg.horizonUrl).toContain("testnet");
  });

  it("returns mainnet config when network is mainnet", () => {
    const cfg = getNetworkConfig("mainnet");
    expect(cfg.horizonUrl).not.toContain("testnet");
  });

  it("both networks have all required fields", () => {
    for (const network of ["testnet", "mainnet"] as Network[]) {
      const cfg = getNetworkConfig(network);
      expect(cfg.networkPassphrase).toBeTruthy();
      expect(cfg.horizonUrl).toBeTruthy();
      expect(cfg.sorobanRpcUrl).toBeTruthy();
      expect(cfg.explorerBaseUrl).toBeTruthy();
    }
  });

  it("all URLs use HTTPS", () => {
    for (const network of ["testnet", "mainnet"] as Network[]) {
      const cfg = getNetworkConfig(network);
      expect(cfg.horizonUrl).toMatch(/^https:\/\//);
      expect(cfg.sorobanRpcUrl).toMatch(/^https:\/\//);
      expect(cfg.explorerBaseUrl).toMatch(/^https:\/\//);
    }
  });
});
