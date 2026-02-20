export interface TokenDeployParams {
    name: string;
    symbol: string;
    decimals: number;
    initialSupply: string;
    adminWallet: string;
    metadata?: {
        image: File;
        description: string;
    };
}

export interface ImageValidationResult {
    valid: boolean;
    error?: string;
    warnings?: string[];
    dimensions?: { width: number; height: number };
    size: number;
    type: string;
}

export interface DeploymentResult {
    tokenAddress: string;
    transactionHash: string;
    totalFee: string;
    timestamp: number;
}

export interface WalletState {
    connected: boolean;
    address: string | null;
    network: 'testnet' | 'mainnet';
}

export interface TokenInfo {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
    creator: string;
    metadataUri?: string;
    deployedAt: number;
    transactionHash: string;
}

export interface TokenMetadata {
    name: string;
    description: string;
    image: string;
}

export interface TransactionDetails {
    hash: string;
    status: 'pending' | 'success' | 'failed';
    timestamp: number;
    fee: string;
}

export interface FeeBreakdown {
    baseFee: number;
    metadataFee: number;
    totalFee: number;
}

export type DeploymentStatus = 'idle' | 'uploading' | 'deploying' | 'success' | 'error';

export interface AppError {
    code: string;
    message: string;
    details?: string;
}

export const ErrorCode = {
    WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    INVALID_INPUT: 'INVALID_INPUT',
    IPFS_UPLOAD_FAILED: 'IPFS_UPLOAD_FAILED',
    TRANSACTION_FAILED: 'TRANSACTION_FAILED',
    WALLET_REJECTED: 'WALLET_REJECTED',
    NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
