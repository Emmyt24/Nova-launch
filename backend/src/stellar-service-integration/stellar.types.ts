export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  admin: string;
}

export interface BurnEvent {
  txHash: string;
  ledger: number;
  timestamp: string;
  from: string;
  amount: string;
  tokenAddress: string;
}

export interface FactoryState {
  contractId: string;
  admin: string;
  totalTokens: number;
  tokens: string[];
  isPaused: boolean;
}

export interface ParsedContractEvent {
  type: string;
  contractId: string;
  topics: unknown[];
  data: unknown;
  ledger: number;
  txHash: string;
  timestamp: string;
}

export interface TransactionDetails {
  hash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  fee: string;
  status: TransactionStatus;
  memo?: string;
  operationCount: number;
  envelopeXdr: string;
  resultXdr: string;
  resultMetaXdr: string;
}

export type TransactionStatus = "pending" | "success" | "failed" | "not_found";

export interface MonitorTransactionResult {
  hash: string;
  status: TransactionStatus;
  ledger?: number;
  createdAt?: string;
  errorMessage?: string;
  attempts: number;
}

export interface StellarError {
  code: StellarErrorCode;
  message: string;
  details?: unknown;
}

export enum StellarErrorCode {
  NETWORK_ERROR = "NETWORK_ERROR",
  INVALID_ADDRESS = "INVALID_ADDRESS",
  CONTRACT_ERROR = "CONTRACT_ERROR",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  RATE_LIMITED = "RATE_LIMITED",
  TIMEOUT = "TIMEOUT",
  NOT_FOUND = "NOT_FOUND",
  PARSE_ERROR = "PARSE_ERROR",
  UNKNOWN = "UNKNOWN",
}

export interface ContractCallOptions {
  timeout?: number;
  retries?: number;
}
