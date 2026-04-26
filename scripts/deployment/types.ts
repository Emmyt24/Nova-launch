export interface DeploymentConfig {
  network: 'testnet' | 'mainnet';
  horizonUrl: string;
  sorobanRpcUrl: string;
  adminKeyName: string;
  treasuryKeyName: string;
  baseFee: number;
  metadataFee: number;
  wasmPath: string;
  envFile: string;
}

export interface DeploymentResult {
  contractId: string;
  admin: string;
  treasury: string;
  network: string;
  deployedAt: string;
  transactionHash: string;
  wasmHash: string;
}

export interface VerificationResult {
  contractId: string;
  isValid: boolean;
  wasmHashMatch: boolean;
  stateValid: boolean;
  errors: string[];
}

export const DEFAULT_CONFIG: DeploymentConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  adminKeyName: 'admin',
  treasuryKeyName: 'treasury',
  baseFee: 70000000,
  metadataFee: 30000000,
  wasmPath: '../../contracts/token-factory/target/wasm32-unknown-unknown/release/token_factory.wasm',
  envFile: '../../.env.testnet'
};