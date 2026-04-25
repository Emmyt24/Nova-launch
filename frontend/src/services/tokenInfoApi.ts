/**
 * Token Info API Client
 * Connects frontend to backend token-info service for richer token detail screens
 * including metadata, burn stats, and optional analytics.
 * 
 * Backend includes a dedicated token-info module that provides:
 * - Enriched token metadata
 * - Burn history
 * - Analytics data
 * 
 * Issue: #614
 */

import type { TokenInfo, TokenMetadata } from '../types';

/**
 * Extended token details from backend token-info service
 */
export interface TokenDetail extends TokenInfo {
  /** Rich metadata from backend */
  metadata?: TokenMetadata;
  /** Total amount burned */
  totalBurned: string;
  /** Number of burn transactions */
  burnCount: number;
  /** Number of unique burners */
  burnerCount: number;
  /** Analytics data */
  analytics?: TokenAnalytics;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Token analytics data
 */
export interface TokenAnalytics {
  /** 24h burn volume */
  dailyBurnVolume: string;
  /** 7d burn volume */
  weeklyBurnVolume: string;
  /** 30d burn volume */
  monthlyBurnVolume: string;
  /** Burn trend percentage */
  burnTrend: number;
  /** Active burners count */
  activeBurners: number;
}

/**
 * Burn history entry
 */
export interface BurnHistoryEntry {
  /** Transaction hash */
  txHash: string;
  /** Amount burned */
  amount: string;
  /** Burner address */
  burner: string;
  /** Timestamp */
  timestamp: number;
  /** Whether admin burn */
  isAdminBurn: boolean;
}

/**
 * Token detail query options
 */
export interface TokenDetailOptions {
  /** Include metadata */
  includeMetadata?: boolean;
  /** Include analytics */
  includeAnalytics?: boolean;
  /** Include burn history */
  includeBurnHistory?: boolean;
  /** Number of burn history entries to fetch */
  burnHistoryLimit?: number;
  /** Cache duration in milliseconds */
  cacheDuration?: number;
}

/**
 * Default options for token detail queries
 */
const DEFAULT_OPTIONS: Required<TokenDetailOptions> = {
  includeMetadata: true,
  includeAnalytics: false,
  includeBurnHistory: false,
  burnHistoryLimit: 10,
  cacheDuration: 60000, // 1 minute
};

/**
 * API configuration
 */
const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_TOKEN_INFO_API_URL || 
         `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/token-info`;
};

/**
 * Simple in-memory cache for token details
 */
const tokenDetailCache = new Map<string, { data: TokenDetail; expires: number }>();

/**
 * Clear expired cache entries
 */
const cleanCache = (): void => {
  const now = Date.now();
  for (const [key, value] of tokenDetailCache.entries()) {
    if (value.expires < now) {
      tokenDetailCache.delete(key);
    }
  }
};

/**
 * Generate cache key from token address and options
 */
const getCacheKey = (tokenAddress: string, options: Required<TokenDetailOptions>): string => {
  return `${tokenAddress}:${options.includeMetadata}:${options.includeAnalytics}:${options.includeBurnHistory}:${options.burnHistoryLimit}`;
};

/**
 * Fetch enriched token details from backend
 * 
 * @param tokenAddress - The token contract address
 * @param options - Query options
 * @returns Token detail with metadata, burn stats, and optional analytics
 * 
 * @example
 * ```typescript
 * const detail = await fetchTokenDetail('CA3D...', { includeAnalytics: true });
 * console.log(detail.totalBurned, detail.metadata);
 * ```
 */
export async function fetchTokenDetail(
  tokenAddress: string,
  options: TokenDetailOptions = {}
): Promise<TokenDetail> {
  // Clean expired cache entries
  cleanCache();
  
  // Merge with defaults
  const opts: Required<TokenDetailOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  
  // Check cache first
  const cacheKey = getCacheKey(tokenAddress, opts);
  const cached = tokenDetailCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  // Build query parameters
  const params = new URLSearchParams();
  if (opts.includeMetadata) params.append('include', 'metadata');
  if (opts.includeAnalytics) params.append('include', 'analytics');
  if (opts.includeBurnHistory) {
    params.append('include', 'burnHistory');
    params.append('burnHistoryLimit', opts.burnHistoryLimit.toString());
  }
  
  const url = `${getApiBaseUrl()}/${tokenAddress}?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Token not found: ${tokenAddress}`);
    }
    if (response.status === 400) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }
    throw new Error(`Failed to fetch token details: ${response.statusText}`);
  }
  
  const data: TokenDetail = await response.json();
  
  // Cache the result
  tokenDetailCache.set(cacheKey, {
    data,
    expires: Date.now() + opts.cacheDuration,
  });
  
  return data;
}

/**
 * Fetch burn history for a token
 * 
 * @param tokenAddress - The token contract address
 * @param limit - Maximum number of entries to fetch
 * @param offset - Offset for pagination
 * @returns Array of burn history entries
 * 
 * @example
 * ```typescript
 * const history = await fetchBurnHistory('CA3D...', 20, 0);
 * ```
 */
export async function fetchBurnHistory(
  tokenAddress: string,
  limit: number = 10,
  offset: number = 0
): Promise<BurnHistoryEntry[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });
  
  const url = `${getApiBaseUrl()}/${tokenAddress}/burn-history?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Token not found: ${tokenAddress}`);
    }
    throw new Error(`Failed to fetch burn history: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch token metadata only
 * 
 * @param tokenAddress - The token contract address
 * @returns Token metadata
 * 
 * @example
 * ```typescript
 * const metadata = await fetchTokenMetadata('CA3D...');
 * ```
 */
export async function fetchTokenMetadata(tokenAddress: string): Promise<TokenMetadata | null> {
  const detail = await fetchTokenDetail(tokenAddress, {
    includeMetadata: true,
    includeAnalytics: false,
    includeBurnHistory: false,
  });
  
  return detail.metadata || null;
}

/**
 * Invalidate cache for a specific token
 * 
 * @param tokenAddress - The token contract address to invalidate
 * 
 * @example
 * ```typescript
 * invalidateTokenCache('CA3D...');
 * ```
 */
export function invalidateTokenCache(tokenAddress: string): void {
  // Remove all cache entries for this token address
  for (const key of tokenDetailCache.keys()) {
    if (key.startsWith(tokenAddress)) {
      tokenDetailCache.delete(key);
    }
  }
}

/**
 * Clear all token cache
 * 
 * @example
 * ```typescript
 * clearTokenCache();
 * ```
 */
export function clearTokenCache(): void {
  tokenDetailCache.clear();
}

/**
 * Preload token details for multiple tokens
 * 
 * @param tokenAddresses - Array of token addresses to preload
 * @param options - Query options
 * @returns Map of token addresses to token details
 * 
 * @example
 * ```typescript
 * const results = await preloadTokenDetails(['CA3D...', 'CB5F...'], { includeMetadata: true });
 * ```
 */
export async function preloadTokenDetails(
  tokenAddresses: string[],
  options: TokenDetailOptions = {}
): Promise<Map<string, TokenDetail>> {
  const results = new Map<string, TokenDetail>();
  
  // Use Promise.allSettled to handle individual failures gracefully
  const promises = tokenAddresses.map(async (address) => {
    try {
      const detail = await fetchTokenDetail(address, options);
      return { address, detail, error: null };
    } catch (error) {
      return { address, detail: null, error };
    }
  });
  
  const settled = await Promise.allSettled(promises);
  
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value.detail) {
      results.set(result.value.address, result.value.detail);
    }
  }
  
  return results;
}

/**
 * Validate token address format
 * 
 * @param address - The address to validate
 * @returns True if valid Stellar contract address format
 * 
 * @example
 * ```typescript
 * const isValid = validateTokenAddress('CA3D5K...');
 * ```
 */
export function validateTokenAddress(address: string): boolean {
  // Stellar contract addresses are typically 56 characters base64
  // They start with 'C' for contracts
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  // Basic format check - Stellar addresses are base64 encoded
  const base64Regex = /^[A-Za-z0-9+/]{56}=$/;
  return base64Regex.test(address);
}

export default {
  fetchTokenDetail,
  fetchBurnHistory,
  fetchTokenMetadata,
  invalidateTokenCache,
  clearTokenCache,
  preloadTokenDetails,
  validateTokenAddress,
};