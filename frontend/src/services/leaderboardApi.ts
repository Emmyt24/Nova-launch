/**
 * Leaderboard API Client
 * Connects frontend to backend leaderboard endpoints for ranking data
 * including most burned, most active, newest, largest supply, and most burners.
 * 
 * Backend exposes leaderboard routes that provide:
 * - Ranking by burn volume
 * - Ranking by activity
 * - Ranking by newest tokens
 * - Ranking by supply size
 * - Ranking by burner count
 * 
 * Issue: #616
 */

/**
 * Leaderboard entry for a token
 */
export interface LeaderboardEntry {
  /** Token address */
  tokenAddress: string;
  /** Token name */
  tokenName: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Rank in the leaderboard */
  rank: number;
  /** Metric value (depends on leaderboard type) */
  value: string;
  /** Change in rank from previous period */
  rankChange: number;
}

/**
 * Leaderboard types supported by the backend
 */
export type LeaderboardType = 
  | 'most-burned'    // Most total burned
  | 'most-active'    // Most active transactions
  | 'newest'         // Recently deployed
  | 'largest-supply' // Largest total supply
  | 'most-burners';  // Most unique burners

/**
 * Time period for filtering leaderboard data
 */
export type TimePeriod = '24h' | '7d' | '30d' | 'all';

/**
 * Leaderboard query parameters
 */
export interface LeaderboardParams {
  /** Type of leaderboard */
  type: LeaderboardType;
  /** Time period filter */
  period?: TimePeriod;
  /** Number of entries to fetch */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Whether to include metadata */
  includeMetadata?: boolean;
}

/**
 * Leaderboard response from backend
 */
export interface LeaderboardResponse {
  /** Array of leaderboard entries */
  entries: LeaderboardEntry[];
  /** Total number of entries available */
  total: number;
  /** Current page/offset */
  offset: number;
  /** Entries per page */
  limit: number;
  /** Time period used */
  period: TimePeriod;
  /** Leaderboard type */
  type: LeaderboardType;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Cache for leaderboard data
 */
const leaderboardCache = new Map<string, { data: LeaderboardResponse; expires: number }>();

/**
 * Get API base URL
 */
const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_LEADERBOARD_API_URL || 
         `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/leaderboard`;
};

/**
 * Clean expired cache entries
 */
const cleanCache = (): void => {
  const now = Date.now();
  for (const [key, value] of leaderboardCache.entries()) {
    if (value.expires < now) {
      leaderboardCache.delete(key);
    }
  }
};

/**
 * Generate cache key from params
 */
const getCacheKey = (params: Required<LeaderboardParams>): string => {
  return `${params.type}:${params.period}:${params.limit}:${params.offset}`;
};

/**
 * Default query parameters
 */
const DEFAULT_PARAMS: Required<LeaderboardParams> = {
  type: 'most-burned',
  period: '7d',
  limit: 20,
  offset: 0,
  includeMetadata: true,
};

/**
 * Fetch leaderboard data from backend
 * 
 * @param params - Leaderboard query parameters
 * @returns Leaderboard response with entries and metadata
 * 
 * @example
 * ```typescript
 * const response = await fetchLeaderboard({ type: 'most-burned', period: '24h' });
 * console.log(response.entries);
 * ```
 */
export async function fetchLeaderboard(params: LeaderboardParams): Promise<LeaderboardResponse> {
  cleanCache();
  
  const opts: Required<LeaderboardParams> = {
    ...DEFAULT_PARAMS,
    ...params,
  };
  
  // Check cache
  const cacheKey = getCacheKey(opts);
  const cached = leaderboardCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  // Build query parameters
  const queryParams = new URLSearchParams({
    type: opts.type,
    period: opts.period,
    limit: opts.limit.toString(),
    offset: opts.offset.toString(),
  });
  
  if (opts.includeMetadata) {
    queryParams.append('include', 'metadata');
  }
  
  const url = `${getApiBaseUrl()}?${queryParams.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
  }
  
  const data: LeaderboardResponse = await response.json();
  
  // Cache for 30 seconds (leaderboards should refresh more frequently)
  leaderboardCache.set(cacheKey, {
    data,
    expires: Date.now() + 30000,
  });
  
  return data;
}

/**
 * Fetch most burned tokens leaderboard
 * 
 * @param period - Time period filter
 * @param limit - Number of entries
 * @returns Leaderboard entries
 * 
 * @example
 * ```typescript
 * const entries = await fetchMostBurned('24h', 10);
 * ```
 */
export async function fetchMostBurned(
  period: TimePeriod = '7d',
  limit: number = 20
): Promise<LeaderboardEntry[]> {
  const response = await fetchLeaderboard({ type: 'most-burned', period, limit });
  return response.entries;
}

/**
 * Fetch most active tokens leaderboard
 * 
 * @param period - Time period filter
 * @param limit - Number of entries
 * @returns Leaderboard entries
 * 
 * @example
 * ```typescript
 * const entries = await fetchMostActive('7d', 10);
 * ```
 */
export async function fetchMostActive(
  period: TimePeriod = '7d',
  limit: number = 20
): Promise<LeaderboardEntry[]> {
  const response = await fetchLeaderboard({ type: 'most-active', period, limit });
  return response.entries;
}

/**
 * Fetch newest tokens leaderboard
 * 
 * @param limit - Number of entries
 * @returns Leaderboard entries
 * 
 * @example
 * ```typescript
 * const entries = await fetchNewest(10);
 * ```
 */
export async function fetchNewest(limit: number = 20): Promise<LeaderboardEntry[]> {
  const response = await fetchLeaderboard({ type: 'newest', limit });
  return response.entries;
}

/**
 * Fetch largest supply tokens leaderboard
 * 
 * @param limit - Number of entries
 * @returns Leaderboard entries
 * 
 * @example
 * ```typescript
 * const entries = await fetchLargestSupply(10);
 * ```
 */
export async function fetchLargestSupply(limit: number = 20): Promise<LeaderboardEntry[]> {
  const response = await fetchLeaderboard({ type: 'largest-supply', limit });
  return response.entries;
}

/**
 * Fetch most burners leaderboard
 * 
 * @param period - Time period filter
 * @param limit - Number of entries
 * @returns Leaderboard entries
 * 
 * @example
 * ```typescript
 * const entries = await fetchMostBurners('30d', 10);
 * ```
 */
export async function fetchMostBurners(
  period: TimePeriod = '30d',
  limit: number = 20
): Promise<LeaderboardEntry[]> {
  const response = await fetchLeaderboard({ type: 'most-burners', period, limit });
  return response.entries;
}

/**
 * Fetch all leaderboard types at once (for dashboard)
 * 
 * @param period - Time period filter
 * @returns Map of leaderboard type to entries
 * 
 * @example
 * ```typescript
 * const all = await fetchAllLeaderboards('7d');
 * const mostBurned = all['most-burned'];
 * ```
 */
export async function fetchAllLeaderboards(
  period: TimePeriod = '7d'
): Promise<Record<LeaderboardType, LeaderboardEntry[]>> {
  const [mostBurned, mostActive, newest, largestSupply, mostBurners] = await Promise.all([
    fetchMostBurned(period),
    fetchMostActive(period),
    fetchNewest(),
    fetchLargestSupply(),
    fetchMostBurners(period),
  ]);
  
  return {
    'most-burned': mostBurned,
    'most-active': mostActive,
    'newest': newest,
    'largest-supply': largestSupply,
    'most-burners': mostBurners,
  };
}

/**
 * Invalidate leaderboard cache (force refresh)
 * 
 * @example
 * ```typescript
 * invalidateLeaderboardCache();
 * ```
 */
export function invalidateLeaderboardCache(): void {
  leaderboardCache.clear();
}

/**
 * Get a specific token's rank in a leaderboard
 * 
 * @param tokenAddress - Token address to look up
 * @param type - Leaderboard type
 * @param period - Time period
 * @returns Token's rank or null if not found
 * 
 * @example
 * ```typescript
 * const rank = await getTokenRank('CA3D...', 'most-burned', '7d');
 * ```
 */
export async function getTokenRank(
  tokenAddress: string,
  type: LeaderboardType = 'most-burned',
  period: TimePeriod = '7d'
): Promise<number | null> {
  // Fetch with higher limit to find the token
  const response = await fetchLeaderboard({ type, period, limit: 100 });
  
  const entry = response.entries.find(e => e.tokenAddress === tokenAddress);
  return entry ? entry.rank : null;
}

/**
 * Normalize numeric strings for chart rendering
 * 
 * @param value - String numeric value
 * @param decimals - Number of decimal places
 * @returns Formatted number string
 * 
 * @example
 * ```typescript
 * const formatted = normalizeNumeric('1234567', 2); // '12,345.67'
 * ```
 */
export function normalizeNumeric(value: string, decimals: number = 2): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default {
  fetchLeaderboard,
  fetchMostBurned,
  fetchMostActive,
  fetchNewest,
  fetchLargestSupply,
  fetchMostBurners,
  fetchAllLeaderboards,
  invalidateLeaderboardCache,
  getTokenRank,
  normalizeNumeric,
};