export interface BurnConfig {
    burnEnabled: boolean;
    adminBurnEnabled: boolean;
    selfBurnEnabled: boolean;
    minBurnAmount?: string | null; // null = no limit
    maxBurnAmount?: string | null; // null = unlimited
    burnFee?: string | null; // XLM, null = no fee
    tokenSymbol?: string;
}

export interface BurnStats {
    totalBurned?: string;
    burnCount?: number;
    lastBurnAt?: number;
}
