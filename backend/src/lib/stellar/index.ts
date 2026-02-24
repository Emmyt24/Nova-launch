/**
 * Stellar SDK integration
 * TODO: Implement Stellar network operations
 */

export const stellarConfig = {
  network: process.env.STELLAR_NETWORK || "testnet",
  horizonUrl:
    process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  sorobanRpcUrl:
    process.env.STELLAR_SOROBAN_RPC_URL ||
    "https://soroban-testnet.stellar.org",
  factoryContractId: process.env.FACTORY_CONTRACT_ID || "",
};
