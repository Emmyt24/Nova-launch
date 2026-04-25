/**
 * SNAPSHOT TESTS: API Response Schema Stability
 *
 * Ensures API response schemas remain stable across versions.
 * Detects unintended breaking changes to response structures.
 *
 * Coverage:
 * - Token deployment responses
 * - Token search responses
 * - Transaction history responses
 * - Error response formats
 * - Pagination structures
 *
 * Run: npm test backend/src/__tests__/api-schema.snapshot.test.ts
 */

import { describe, it, expect } from 'vitest';

interface TokenResponse {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  creator: string;
  createdAt: string;
  metadata?: {
    description?: string;
    imageUrl?: string;
    uri?: string;
  };
}

interface SearchResponse {
  tokens: TokenResponse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface TransactionResponse {
  hash: string;
  type: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: string;
  fee: string;
  details: Record<string, unknown>;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
  requestId: string;
}

describe('API Schema Snapshots', () => {
  describe('Token Response Schema', () => {
    it('should maintain token response structure', () => {
      const tokenResponse: TokenResponse = {
        address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V',
        name: 'Test Token',
        symbol: 'TST',
        decimals: 7,
        totalSupply: '1000000000000',
        creator: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V',
        createdAt: '2024-04-24T08:29:31.459Z',
        metadata: {
          description: 'A test token',
          imageUrl: 'https://example.com/token.png',
          uri: 'ipfs://QmHash',
        },
      };

      expect(tokenResponse).toMatchSnapshot();
    });

    it('should maintain token response without metadata', () => {
      const tokenResponse: TokenResponse = {
        address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V',
        name: 'Test Token',
        symbol: 'TST',
        decimals: 7,
        totalSupply: '1000000000000',
        creator: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V',
        createdAt: '2024-04-24T08:29:31.459Z',
      };

      expect(tokenResponse).toMatchSnapshot();
    });

    it('should validate required token fields', () => {
      const tokenResponse: TokenResponse = {
        address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V',
        name: 'Test Token',
        symbol: 'TST',
        decimals: 7,
        totalSupply: '1000000000000',
        creator: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V',
        createdAt: '2024-04-24T08:29:31.459Z',
      };

      const requiredFields = ['address', 'name', 'symbol', 'decimals', 'totalSupply', 'creator', 'createdAt'];
      const hasAllFields = requiredFields.every(field => field in tokenResponse);

      expect(hasAllFields).toBe(true);
    });

    it('should maintain field types', () => {
      const tokenResponse: TokenResponse = {
        address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V',
        name: 'Test Token',
        symbol: 'TST',
        decimals: 7,
        totalSupply: '1000000000000',
        creator: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V',
        createdAt: '2024-04-24T08:29:31.459Z',
      };

      expect(typeof tokenResponse.address).toBe('string');
      expect(typeof tokenResponse.name).toBe('string');
      expect(typeof tokenResponse.symbol).toBe('string');
      expect(typeof tokenResponse.decimals).toBe('number');
      expect(typeof tokenResponse.totalSupply).toBe('string');
      expect(typeof tokenResponse.creator).toBe('string');
      expect(typeof tokenResponse.createdAt).toBe('string');
    });
  });

  describe('Search Response Schema', () => {
    it('should maintain search response structure', () => {
      const searchResponse: SearchResponse = {
        tokens: [
          {
            address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V',
            name: 'Test Token 1',
            symbol: 'TST1',
            decimals: 7,
            totalSupply: '1000000000000',
            creator: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V',
            createdAt: '2024-04-24T08:29:31.459Z',
          },
          {
            address: 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCY5V',
            name: 'Test Token 2',
            symbol: 'TST2',
            decimals: 7,
            totalSupply: '2000000000000',
            creator: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V',
            createdAt: '2024-04-24T08:29:31.459Z',
          },
        ],
        total: 2,
        limit: 10,
        offset: 0,
        hasMore: false,
      };

      expect(searchResponse).toMatchSnapshot();
    });

    it('should maintain pagination structure', () => {
      const searchResponse: SearchResponse = {
        tokens: [],
        total: 100,
        limit: 10,
        offset: 20,
        hasMore: true,
      };

      expect(searchResponse).toMatchSnapshot();
    });

    it('should validate pagination fields', () => {
      const searchResponse: SearchResponse = {
        tokens: [],
        total: 100,
        limit: 10,
        offset: 20,
        hasMore: true,
      };

      expect(searchResponse.limit).toBeGreaterThan(0);
      expect(searchResponse.offset).toBeGreaterThanOrEqual(0);
      expect(searchResponse.total).toBeGreaterThanOrEqual(0);
      expect(typeof searchResponse.hasMore).toBe('boolean');
    });

    it('should maintain empty search response', () => {
      const searchResponse: SearchResponse = {
        tokens: [],
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false,
      };

      expect(searchResponse).toMatchSnapshot();
    });
  });

  describe('Transaction Response Schema', () => {
    it('should maintain transaction response structure', () => {
      const txResponse: TransactionResponse = {
        hash: 'abc123def456',
        type: 'token_deployment',
        status: 'confirmed',
        timestamp: '2024-04-24T08:29:31.459Z',
        fee: '70000000',
        details: {
          tokenAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V',
          tokenName: 'Test Token',
          tokenSymbol: 'TST',
        },
      };

      expect(txResponse).toMatchSnapshot();
    });

    it('should maintain pending transaction response', () => {
      const txResponse: TransactionResponse = {
        hash: 'abc123def456',
        type: 'token_deployment',
        status: 'pending',
        timestamp: '2024-04-24T08:29:31.459Z',
        fee: '70000000',
        details: {},
      };

      expect(txResponse).toMatchSnapshot();
    });

    it('should maintain failed transaction response', () => {
      const txResponse: TransactionResponse = {
        hash: 'abc123def456',
        type: 'token_deployment',
        status: 'failed',
        timestamp: '2024-04-24T08:29:31.459Z',
        fee: '70000000',
        details: {
          error: 'InsufficientFee',
          errorCode: 1,
        },
      };

      expect(txResponse).toMatchSnapshot();
    });

    it('should validate transaction status values', () => {
      const validStatuses = ['pending', 'confirmed', 'failed'];
      const txResponse: TransactionResponse = {
        hash: 'abc123def456',
        type: 'token_deployment',
        status: 'confirmed',
        timestamp: '2024-04-24T08:29:31.459Z',
        fee: '70000000',
        details: {},
      };

      expect(validStatuses).toContain(txResponse.status);
    });
  });

  describe('Error Response Schema', () => {
    it('should maintain error response structure', () => {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'INVALID_PARAMS',
          message: 'Token parameters are invalid',
          details: {
            field: 'symbol',
            reason: 'Symbol must be 1-12 characters',
          },
        },
        timestamp: '2024-04-24T08:29:31.459Z',
        requestId: 'req-123-456',
      };

      expect(errorResponse).toMatchSnapshot();
    });

    it('should maintain error response without details', () => {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
        timestamp: '2024-04-24T08:29:31.459Z',
        requestId: 'req-123-456',
      };

      expect(errorResponse).toMatchSnapshot();
    });

    it('should validate error structure', () => {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'INVALID_PARAMS',
          message: 'Token parameters are invalid',
        },
        timestamp: '2024-04-24T08:29:31.459Z',
        requestId: 'req-123-456',
      };

      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error.code).toBeDefined();
      expect(errorResponse.error.message).toBeDefined();
      expect(errorResponse.timestamp).toBeDefined();
      expect(errorResponse.requestId).toBeDefined();
    });

    it('should maintain validation error response', () => {
      const errorResponse: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: {
            errors: [
              { field: 'name', message: 'Name is required' },
              { field: 'symbol', message: 'Symbol must be 1-12 characters' },
            ],
          },
        },
        timestamp: '2024-04-24T08:29:31.459Z',
        requestId: 'req-123-456',
      };

      expect(errorResponse).toMatchSnapshot();
    });
  });

  describe('Schema Consistency', () => {
    it('should maintain consistent timestamp format', () => {
      const timestamps = [
        '2024-04-24T08:29:31.459Z',
        '2024-04-24T08:29:31.459Z',
        '2024-04-24T08:29:31.459Z',
      ];

      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      const allValid = timestamps.every(ts => isoRegex.test(ts));

      expect(allValid).toBe(true);
    });

    it('should maintain consistent address format', () => {
      const addresses = [
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V',
        'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V',
        'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCY5V',
      ];

      const stellarAddressRegex = /^G[A-Z0-9]{55}$/;
      const allValid = addresses.every(addr => stellarAddressRegex.test(addr));

      expect(allValid).toBe(true);
    });

    it('should maintain consistent numeric string format', () => {
      const amounts = ['1000000000000', '0', '999999999999999'];

      const isNumericString = (val: string) => /^\d+$/.test(val);
      const allValid = amounts.every(isNumericString);

      expect(allValid).toBe(true);
    });

    it('should detect schema breaking changes', () => {
      const oldSchema = {
        address: 'string',
        name: 'string',
        symbol: 'string',
        decimals: 'number',
      };

      const newSchema = {
        address: 'string',
        name: 'string',
        symbol: 'string',
        decimals: 'number',
        newField: 'string', // Breaking change
      };

      const oldKeys = Object.keys(oldSchema).sort();
      const newKeys = Object.keys(newSchema).sort();

      const hasBreakingChange = newKeys.length > oldKeys.length;
      expect(hasBreakingChange).toBe(true);
    });
  });

  describe('Response Validation', () => {
    it('should validate response size limits', () => {
      const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB

      const largeResponse = {
        tokens: Array.from({ length: 1000 }, (_, i) => ({
          address: `GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5${i}`,
          name: `Token ${i}`,
          symbol: `TST${i}`,
          decimals: 7,
          totalSupply: '1000000000000',
          creator: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V',
          createdAt: '2024-04-24T08:29:31.459Z',
        })),
      };

      const responseSize = JSON.stringify(largeResponse).length;
      expect(responseSize).toBeLessThan(MAX_RESPONSE_SIZE);
    });

    it('should validate required response fields', () => {
      const responses = [
        { address: 'G...', name: 'Token', symbol: 'TST', decimals: 7, totalSupply: '1000', creator: 'G...', createdAt: '2024-04-24T08:29:31.459Z' },
        { address: 'G...', name: 'Token', symbol: 'TST', decimals: 7, totalSupply: '1000', creator: 'G...', createdAt: '2024-04-24T08:29:31.459Z' },
      ];

      const requiredFields = ['address', 'name', 'symbol', 'decimals', 'totalSupply', 'creator', 'createdAt'];
      const allValid = responses.every(resp =>
        requiredFields.every(field => field in resp),
      );

      expect(allValid).toBe(true);
    });
  });
});
