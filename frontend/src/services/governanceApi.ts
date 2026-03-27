/**
 * Governance API Client
 * Connects frontend to backend governance APIs for proposal and vote data.
 * 
 * Backend exposes governance endpoints that provide:
 * - Proposal list and details
 * - Vote tracking
 * - Execution history
 * - Statistics
 * 
 * Issue: #617
 */

import type { WalletState, GovernanceProposal, GovernanceVote, GovernanceStats } from '../types';

/**
 * Voter info
 */
export interface VoterInfo {
  /** Voter address */
  address: string;
  /** Total voting power */
  votingPower: string;
  /** Number of proposals voted on */
  proposalsVoted: number;
  /** Number of proposals created */
  proposalsCreated: number;
  /** Delegate address (if any) */
  delegate?: string;
}

/**
 * Execution history entry
 */
export interface ExecutionEntry {
  /** Execution ID */
  id: string;
  /** Proposal ID */
  proposalId: string;
  /** Execution tx hash */
  txHash: string;
  /** Block timestamp */
  timestamp: number;
  /** Status */
  status: 'success' | 'failed';
  /** Error message if failed */
  error?: string;
}

/**
 * Proposal query parameters
 */
export interface ProposalParams {
  /** Status filter */
  status?: string;
  /** Creator filter */
  creator?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sortBy?: 'createdAt' | 'votingEndsAt' | 'voteCount';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Proposal list response
 */
export interface ProposalListResponse {
  /** Array of proposals */
  proposals: GovernanceProposal[];
  /** Total count */
  total: number;
  /** Current page */
  page: number;
  /** Items per page */
  limit: number;
  /** Total pages */
  totalPages: number;
}

/**
 * Vote history response
 */
export interface VoteHistoryResponse {
  /** Array of votes */
  votes: GovernanceVote[];
  /** Total count */
  total: number;
  /** Current page */
  page: number;
  /** Items per page */
  limit: number;
}

/**
 * Cache for governance data
 */
const governanceCache = new Map<string, { data: unknown; expires: number }>();

/**
 * Get API base URL
 */
const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_GOVERNANCE_API_URL || 
         `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/governance`;
};

/**
 * Clean expired cache entries
 */
const cleanCache = (): void => {
  const now = Date.now();
  for (const [key, value] of governanceCache.entries()) {
    if (value.expires < now) {
      governanceCache.delete(key);
    }
  }
};

/**
 * Generate cache key
 */
const getCacheKey = (endpoint: string, params?: Record<string, string>): string => {
  const paramsStr = params ? new URLSearchParams(params).toString() : '';
  return `${endpoint}?${paramsStr}`;
};

/**
 * Default cache duration (30 seconds for governance data)
 */
const DEFAULT_CACHE_DURATION = 30000;

/**
 * Fetch proposals from backend
 * 
 * @param params - Query parameters
 * @returns Proposal list response
 * 
 * @example
 * ```typescript
 * const { proposals, total } = await fetchProposals({ status: 'active', limit: 10 });
 * ```
 */
export async function fetchProposals(params: ProposalParams = {}): Promise<ProposalListResponse> {
  cleanCache();
  
  const queryParams = new URLSearchParams();
  
  if (params.status) queryParams.append('status', params.status);
  if (params.creator) queryParams.append('creator', params.creator);
  if (params.page) queryParams.append('page', params.page.toString());
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.sortBy) queryParams.append('sortBy', params.sortBy);
  if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
  
  const cacheKey = getCacheKey('proposals', Object.fromEntries(queryParams));
  const cached = governanceCache.get(cacheKey);
  
  if (cached && cached.expires > Date.now()) {
    return cached.data as ProposalListResponse;
  }
  
  const url = `${getApiBaseUrl()}/proposals?${queryParams.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch proposals: ${response.statusText}`);
  }
  
  const data: ProposalListResponse = await response.json();
  
  governanceCache.set(cacheKey, {
    data,
    expires: Date.now() + DEFAULT_CACHE_DURATION,
  });
  
  return data;
}

/**
 * Fetch a single proposal by ID
 * 
 * @param proposalId - Proposal ID
 * @returns Proposal details
 * 
 * @example
 * ```typescript
 * const proposal = await fetchProposal('prop-123');
 * ```
 */
export async function fetchProposal(proposalId: string): Promise<GovernanceProposal> {
  const cacheKey = `proposal:${proposalId}`;
  const cached = governanceCache.get(cacheKey);
  
  if (cached && cached.expires > Date.now()) {
    return cached.data as GovernanceProposal;
  }
  
  const url = `${getApiBaseUrl()}/proposals/${proposalId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }
    throw new Error(`Failed to fetch proposal: ${response.statusText}`);
  }
  
  const data: GovernanceProposal = await response.json();
  
  governanceCache.set(cacheKey, {
    data,
    expires: Date.now() + DEFAULT_CACHE_DURATION,
  });
  
  return data;
}

/**
 * Fetch votes for a proposal
 * 
 * @param proposalId - Proposal ID
 * @param page - Page number
 * @param limit - Items per page
 * @returns Vote history response
 * 
 * @example
 * ```typescript
 * const { votes, total } = await fetchProposalVotes('prop-123', 1, 20);
 * ```
 */
export async function fetchProposalVotes(
  proposalId: string,
  page: number = 1,
  limit: number = 20
): Promise<VoteHistoryResponse> {
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  
  const cacheKey = getCacheKey(`proposal:${proposalId}:votes`, Object.fromEntries(queryParams));
  const cached = governanceCache.get(cacheKey);
  
  if (cached && cached.expires > Date.now()) {
    return cached.data as VoteHistoryResponse;
  }
  
  const url = `${getApiBaseUrl()}/proposals/${proposalId}/votes?${queryParams.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch proposal votes: ${response.statusText}`);
  }
  
  const data: VoteHistoryResponse = await response.json();
  
  governanceCache.set(cacheKey, {
    data,
    expires: Date.now() + DEFAULT_CACHE_DURATION,
  });
  
  return data;
}

/**
 * Fetch governance statistics
 * 
 * @returns Governance statistics
 * 
 * @example
 * ```typescript
 * const stats = await fetchGovernanceStats();
 * console.log(stats.totalProposals, stats.activeProposals);
 * ```
 */
export async function fetchGovernanceStats(): Promise<GovernanceStats> {
  const cacheKey = 'stats';
  const cached = governanceCache.get(cacheKey);
  
  if (cached && cached.expires > Date.now()) {
    return cached.data as GovernanceStats;
  }
  
  const url = `${getApiBaseUrl()}/stats`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch governance stats: ${response.statusText}`);
  }
  
  const data: GovernanceStats = await response.json();
  
  governanceCache.set(cacheKey, {
    data,
    expires: Date.now() + DEFAULT_CACHE_DURATION,
  });
  
  return data;
}

/**
 * Fetch voter information
 * 
 * @param voterAddress - Voter address
 * @returns Voter info
 * 
 * @example
 * ```typescript
 * const voter = await fetchVoterInfo('GABC...');
 * ```
 */
export async function fetchVoterInfo(voterAddress: string): Promise<VoterInfo> {
  const cacheKey = `voter:${voterAddress}`;
  const cached = governanceCache.get(cacheKey);
  
  if (cached && cached.expires > Date.now()) {
    return cached.data as VoterInfo;
  }
  
  const url = `${getApiBaseUrl()}/voters/${voterAddress}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      // Return empty voter info if not found
      return {
        address: voterAddress,
        votingPower: '0',
        proposalsVoted: 0,
        proposalsCreated: 0,
      };
    }
    throw new Error(`Failed to fetch voter info: ${response.statusText}`);
  }
  
  const data: VoterInfo = await response.json();
  
  governanceCache.set(cacheKey, {
    data,
    expires: Date.now() + DEFAULT_CACHE_DURATION,
  });
  
  return data;
}

/**
 * Fetch votes by a specific voter
 * 
 * @param voterAddress - Voter address
 * @param page - Page number
 * @param limit - Items per page
 * @returns Vote history response
 * 
 * @example
 * ```typescript
 * const { votes } = await fetchVoterVotes('GABC...', 1, 10);
 * ```
 */
export async function fetchVoterVotes(
  voterAddress: string,
  page: number = 1,
  limit: number = 20
): Promise<VoteHistoryResponse> {
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  
  const url = `${getApiBaseUrl()}/voters/${voterAddress}/votes?${queryParams.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch voter votes: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch execution history
 * 
 * @param proposalId - Optional proposal ID filter
 * @param page - Page number
 * @param limit - Items per page
 * @returns Array of execution entries
 * 
 * @example
 * ```typescript
 * const history = await fetchExecutionHistory('prop-123');
 * ```
 */
export async function fetchExecutionHistory(
  proposalId?: string,
  page: number = 1,
  limit: number = 20
): Promise<{ executions: ExecutionEntry[]; total: number }> {
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  
  if (proposalId) {
    queryParams.append('proposalId', proposalId);
  }
  
  const url = `${getApiBaseUrl()}/executions?${queryParams.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch execution history: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Submit a vote (requires wallet connection)
 * 
 * @param proposalId - Proposal ID to vote on
 * @param support - Whether to vote for or against
 * @param wallet - Connected wallet
 * @returns Vote confirmation
 * 
 * @example
 * ```typescript
 * const result = await submitVote('prop-123', true, wallet);
 * ```
 */
export async function submitVote(
  proposalId: string,
  support: boolean,
  wallet: WalletState
): Promise<{ txHash: string; voteId: string }> {
  if (!wallet.connected || !wallet.address) {
    throw new Error('Wallet not connected');
  }
  
  const response = await fetch(`${getApiBaseUrl()}/proposals/${proposalId}/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      voter: wallet.address,
      support,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to submit vote: ${response.statusText}`);
  }
  
  // Invalidate related caches after voting
  invalidateProposalCache(proposalId);
  invalidateVoterCache(wallet.address);
  
  return response.json();
}

/**
 * Submit a proposal (requires wallet connection)
 * 
 * @param title - Proposal title
 * @param description - Proposal description
 * @param payloadType - Type of payload
 * @param payload - Encoded payload
 * @param votingPeriod - Voting period in seconds
 * @param wallet - Connected wallet
 * @returns Proposal creation confirmation
 * 
 * @example
 * ```typescript
 * const result = await submitProposal(
 *   'Add new feature',
 *   'We should add feature X',
 *   'parameter_change',
 *   encodedPayload,
 *   86400,
 *   wallet
 * );
 * ```
 */
export async function submitProposal(
  title: string,
  description: string,
  payloadType: string,
  payload: string,
  votingPeriod: number,
  wallet: WalletState
): Promise<{ txHash: string; proposalId: string }> {
  if (!wallet.connected || !wallet.address) {
    throw new Error('Wallet not connected');
  }
  
  const response = await fetch(`${getApiBaseUrl()}/proposals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      creator: wallet.address,
      title,
      description,
      payloadType,
      payload,
      votingPeriod,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to submit proposal: ${response.statusText}`);
  }
  
  // Invalidate proposal list cache
  invalidateProposalListCache();
  
  return response.json();
}

/**
 * Invalidate cache for a specific proposal
 * 
 * @param proposalId - Proposal ID
 */
export function invalidateProposalCache(proposalId: string): void {
  governanceCache.delete(`proposal:${proposalId}`);
  
  // Also invalidate related vote caches
  for (const key of governanceCache.keys()) {
    if (key.includes(`proposal:${proposalId}:votes`)) {
      governanceCache.delete(key);
    }
  }
}

/**
 * Invalidate cache for a specific voter
 * 
 * @param voterAddress - Voter address
 */
export function invalidateVoterCache(voterAddress: string): void {
  governanceCache.delete(`voter:${voterAddress}`);
  
  for (const key of governanceCache.keys()) {
    if (key.includes(`voter:${voterAddress}`)) {
      governanceCache.delete(key);
    }
  }
}

/**
 * Invalidate proposal list cache
 */
export function invalidateProposalListCache(): void {
  for (const key of governanceCache.keys()) {
    if (key.startsWith('proposals?')) {
      governanceCache.delete(key);
    }
  }
}

/**
 * Clear all governance cache
 */
export function clearGovernanceCache(): void {
  governanceCache.clear();
}

/**
 * Format proposal status for display
 * 
 * @param status - Proposal status
 * @returns Formatted status string
 * 
 * @example
 * ```typescript
 * const display = formatProposalStatus('active'); // 'Active'
 * ```
 */
export function formatProposalStatus(status: string): string {
  const statusMap: Record<string, string> = {
    draft: 'Draft',
    active: 'Active',
    passed: 'Passed',
    failed: 'Failed',
    executed: 'Executed',
    cancelled: 'Cancelled',
  };
  
  return statusMap[status] || status;
}

/**
 * Check if a proposal is in a terminal state
 * 
 * @param status - Proposal status
 * @returns True if proposal is finalized
 * 
 * @example
 * ```typescript
 * const isFinalized = isProposalFinalized('executed'); // true
 * ```
 */
export function isProposalFinalized(status: string): boolean {
  return ['passed', 'failed', 'executed', 'cancelled'].includes(status);
}

export default {
  fetchProposals,
  fetchProposal,
  fetchProposalVotes,
  fetchGovernanceStats,
  fetchVoterInfo,
  fetchVoterVotes,
  fetchExecutionHistory,
  submitVote,
  submitProposal,
  invalidateProposalCache,
  invalidateVoterCache,
  invalidateProposalListCache,
  clearGovernanceCache,
  formatProposalStatus,
  isProposalFinalized,
};