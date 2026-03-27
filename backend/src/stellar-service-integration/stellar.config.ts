export interface StellarConfig {
  network: "testnet" | "mainnet";
  horizonUrl: string;
  sorobanRpcUrl: string;
  factoryContractId: string;
  requestTimeout: number;
  retry: {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
}

export const DEFAULT_STELLAR_CONFIG: StellarConfig = {
  network: "testnet",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
  factoryContractId: "",
  requestTimeout: 30000,
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000,
  },
};
