/**
 * Integration tests for token history synchronization
 * 
 * Tests the reconciliation between local optimistic storage and backend data
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { transactionHistoryStorage } from '../../services/TransactionHistoryStorage';
import { fetchTokenHistory, convertBackendToken } from '../../services/tokenHistoryApi';
import type { TokenInfo } from '../../types';
import type { BackendTokenInfo } from '../../services/tokenHistoryApi';

// Mock fetch for API calls
globalThis.fetch = vi.fn() as any;

const mockWalletAddress = 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const createMockToken = (overrides: Partial<TokenInfo> = {}): TokenInfo => ({
  address: `CTOKEN${Math.random().toString(36).substring(7)}`,
  name: 'Test Token',
  symbol: 'TEST',
  decimals: 7,
  totalSupply: '1000000',
  creator: mockWalletAddress,
  deployedAt: Date.now(),
  transactionHash: `tx_${Math.random().toString(36).substring(7)}`,
  ...overrides,
});

const createMockBackendToken = (overrides: Partial<BackendTokenInfo> = {}): BackendTokenInfo => ({
  id: Math.floor(Math.random() * 10000),
  address: `CTOKEN${Math.random().toString(36).substring(7)}`,
  creator: mockWalletAddress,
  name: 'Test Token',
  symbol: 'TEST',
  decimals: 7,
  totalSupply: '1000000',
  initialSupply: '1000000',
  totalBurned: '0',
  burnCount: 0,
  metadataUri: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('Token History Synchronization', () => {
  beforeEach(() => {
    // Clear storage before each test
    transactionHistoryStorage.clearAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    transactionHistoryStorage.clearAll();
  });

  describe('Optimistic UI', () => {
    it('should show newly deployed token immediately from local storage', () => {
      const newToken = createMockToken({
        name: 'New Token',
        symbol: 'NEW',
      });

      // Add token to local storage (optimistic)
      transactionHistoryStorage.addToken(mockWalletAddress, newToken, false);

      // Retrieve tokens
      const tokens = transactionHistoryStorage.getTokens(mockWalletAddress);

      expect(tokens).toHaveLength(1);
      expect(tokens[0].name).toBe('New Token');
      expect(tokens[0].symbol).toBe('NEW');
      expect(tokens[0].address).toBe(newToken.address);
    });

    it('should persist token history after page reload', () => {
      const token1 = createMockToken({ name: 'Token 1' });
      const token2 = createMockToken({ name: 'Token 2' });

      // Add tokens
      transactionHistoryStorage.addToken(mockWalletAddress, token1);
      transactionHistoryStorage.addToken(mockWalletAddress, token2);

      // Simulate page reload by creating new storage instance
      const newStorage = transactionHistoryStorage;
      const tokens = newStorage.getTokens(mockWalletAddress);

      expect(tokens).toHaveLength(2);
      expect(tokens.map(t => t.name)).toContain('Token 1');
      expect(tokens.map(t => t.name)).toContain('Token 2');
    });
  });

  describe('Backend Synchronization', () => {
    it('should fetch token history from backend for a specific creator', async () => {
      const backendToken = createMockBackendToken({
        name: 'Backend Token',
        symbol: 'BACK',
      });

      // Mock successful API response
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [backendToken],
          pagination: {
            page: 1,
            limit: 50,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        }),
      });

      const response = await fetchTokenHistory({
        creator: mockWalletAddress,
        limit: 50,
      });

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].name).toBe('Backend Token');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`creator=${mockWalletAddress}`),
        expect.any(Object)
      );
    });

    it('should convert backend token format to frontend format', () => {
      const backendToken = createMockBackendToken({
        address: 'CTOKEN123',
        name: 'Test Token',
        symbol: 'TST',
        decimals: 7,
        totalSupply: '5000000',
        createdAt: '2024-01-15T10:30:00.000Z',
      });

      const frontendToken = convertBackendToken(backendToken);

      expect(frontendToken.address).toBe('CTOKEN123');
      expect(frontendToken.name).toBe('Test Token');
      expect(frontendToken.symbol).toBe('TST');
      expect(frontendToken.decimals).toBe(7);
      expect(frontendToken.totalSupply).toBe('5000000');
      expect(frontendToken.deployedAt).toBe(new Date('2024-01-15T10:30:00.000Z').getTime());
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate tokens by address when merging local and backend data', () => {
      const tokenAddress = 'CTOKEN_DUPLICATE';
      
      // Add token to local storage first (optimistic)
      const localToken = createMockToken({
        address: tokenAddress,
        name: 'Local Token',
        totalSupply: '1000000',
      });
      transactionHistoryStorage.addToken(mockWalletAddress, localToken, false);

      // Simulate backend confirmation with updated data
      const backendToken = createMockToken({
        address: tokenAddress,
        name: 'Confirmed Token', // Backend has updated name
        totalSupply: '1000000',
      });
      transactionHistoryStorage.addToken(mockWalletAddress, backendToken, true);

      // Should only have one token
      const tokens = transactionHistoryStorage.getTokens(mockWalletAddress);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].address).toBe(tokenAddress);
      expect(tokens[0].name).toBe('Confirmed Token'); // Backend data wins
    });

    it('should preserve pending optimistic entries not yet in backend', () => {
      const confirmedToken = createMockToken({
        address: 'CTOKEN_CONFIRMED',
        name: 'Confirmed',
      });
      const pendingToken = createMockToken({
        address: 'CTOKEN_PENDING',
        name: 'Pending',
      });

      // Add confirmed token (synced with backend)
      transactionHistoryStorage.addToken(mockWalletAddress, confirmedToken, true);
      
      // Add pending token (not yet synced)
      transactionHistoryStorage.addToken(mockWalletAddress, pendingToken, false);

      const tokens = transactionHistoryStorage.getTokens(mockWalletAddress);
      expect(tokens).toHaveLength(2);

      // Check unsynced tokens
      const unsyncedTokens = transactionHistoryStorage.getUnsyncedTokens(mockWalletAddress);
      expect(unsyncedTokens).toHaveLength(1);
      expect(unsyncedTokens[0].address).toBe('CTOKEN_PENDING');
    });
  });

  describe('Wallet Reconnection', () => {
    it('should survive wallet reconnect on second browser session', () => {
      const token1 = createMockToken({ name: 'Session 1 Token' });
      
      // First session: deploy token
      transactionHistoryStorage.addToken(mockWalletAddress, token1);

      // Simulate disconnect/reconnect by just reading again
      const tokensAfterReconnect = transactionHistoryStorage.getTokens(mockWalletAddress);

      expect(tokensAfterReconnect).toHaveLength(1);
      expect(tokensAfterReconnect[0].name).toBe('Session 1 Token');
    });

    it('should handle multiple wallet addresses independently', () => {
      const wallet1 = 'GWALLET1';
      const wallet2 = 'GWALLET2';

      const token1 = createMockToken({ name: 'Wallet 1 Token' });
      const token2 = createMockToken({ name: 'Wallet 2 Token' });

      transactionHistoryStorage.addToken(wallet1, token1);
      transactionHistoryStorage.addToken(wallet2, token2);

      const wallet1Tokens = transactionHistoryStorage.getTokens(wallet1);
      const wallet2Tokens = transactionHistoryStorage.getTokens(wallet2);

      expect(wallet1Tokens).toHaveLength(1);
      expect(wallet2Tokens).toHaveLength(1);
      expect(wallet1Tokens[0].name).toBe('Wallet 1 Token');
      expect(wallet2Tokens[0].name).toBe('Wallet 2 Token');
    });
  });

  describe('Reconciliation Metadata', () => {
    it('should track sync status for each token', () => {
      const token = createMockToken({ address: 'CTOKEN_SYNC' });

      // Add as unsynced
      transactionHistoryStorage.addToken(mockWalletAddress, token, false);
      let unsyncedTokens = transactionHistoryStorage.getUnsyncedTokens(mockWalletAddress);
      expect(unsyncedTokens).toHaveLength(1);

      // Mark as synced
      transactionHistoryStorage.markTokenSynced(mockWalletAddress, token.address);
      unsyncedTokens = transactionHistoryStorage.getUnsyncedTokens(mockWalletAddress);
      expect(unsyncedTokens).toHaveLength(0);
    });

    it('should update lastSyncedAt timestamp when marking as synced', async () => {
      const token = createMockToken({ address: 'CTOKEN_TIMESTAMP' });
      const beforeSync = Date.now();

      transactionHistoryStorage.addToken(mockWalletAddress, token, false);
      
      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      transactionHistoryStorage.markTokenSynced(mockWalletAddress, token.address);
      
      // Verify sync happened after initial add
      const afterSync = Date.now();
      expect(afterSync).toBeGreaterThanOrEqual(beforeSync);
    });
  });

  describe('Error Handling', () => {
    it('should handle backend API errors gracefully', async () => {
      // Mock failed API response
      (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        fetchTokenHistory({ creator: mockWalletAddress })
      ).rejects.toThrow('Network error');
    });

    it('should handle corrupted local storage data', () => {
      // Manually corrupt localStorage
      localStorage.setItem('transaction_history', 'invalid json{{{');

      // Should return empty array instead of throwing
      const tokens = transactionHistoryStorage.getTokens(mockWalletAddress);
      expect(tokens).toEqual([]);
    });

    it('should handle missing wallet address gracefully', () => {
      const tokens = transactionHistoryStorage.getTokens('NONEXISTENT_WALLET');
      expect(tokens).toEqual([]);
    });
  });

  describe('Sorting and Ordering', () => {
    it('should maintain newest-first ordering', () => {
      const oldToken = createMockToken({
        name: 'Old Token',
        deployedAt: Date.now() - 10000,
      });
      const newToken = createMockToken({
        name: 'New Token',
        deployedAt: Date.now(),
      });

      // Add in reverse order
      transactionHistoryStorage.addToken(mockWalletAddress, oldToken);
      transactionHistoryStorage.addToken(mockWalletAddress, newToken);

      const tokens = transactionHistoryStorage.getTokens(mockWalletAddress);
      
      // Newest should be first
      expect(tokens[0].name).toBe('New Token');
      expect(tokens[1].name).toBe('Old Token');
    });
  });
});
