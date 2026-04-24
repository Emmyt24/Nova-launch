import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

/**
 * Regression Test Suite for Campaign Consistency Checker
 * 
 * This file contains comprehensive regression tests to ensure the campaign consistency
 * checker logic remains stable across code changes. Tests cover:
 * - Edge cases and boundary conditions
 * - Error handling and exception scenarios
 * - Data validation and type safety
 * - Performance and stress scenarios
 * - Regression scenarios for potential bugs
 * 
 * @module CampaignConsistencyCheckerRegressionTests
 */

// Mock Prisma client for isolated testing
const mockCampaigns = new Map();

const mockPrisma = {
  campaign: {
    findUnique: vi.fn(async ({ where }) =>
      mockCampaigns.get(where.campaignId) || null
    ),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

describe('Campaign Consistency Checker - Regression Tests', () => {
  let checker: any;

  beforeAll(async () => {
    const { CampaignConsistencyChecker } = await import(
      '../services/campaignConsistencyChecker'
    );
    checker = new CampaignConsistencyChecker();
  });

  beforeEach(() => {
    mockCampaigns.clear();
    vi.clearAllMocks();
  });

  /**
   * Edge Cases and Boundary Conditions
   * Tests for extreme values, empty states, and boundary conditions
   */
  describe('Edge Cases and Boundary Conditions', () => {
    it('handles campaign ID of 0 (minimum valid ID)', async () => {
      mockCampaigns.set(0, {
        campaignId: 0,
        status: 'ACTIVE',
        currentAmount: BigInt(0),
        executionCount: 0,
        targetAmount: BigInt(1),
      });

      const onChainState = {
        campaignId: 0,
        status: 'ACTIVE',
        currentAmount: BigInt(0),
        executionCount: 0,
        targetAmount: BigInt(1),
      };

      const diffs = await checker.checkCampaign(0, onChainState);
      expect(diffs).toHaveLength(0);
    });

    it('handles maximum safe integer for execution count', async () => {
      const maxSafeInt = Number.MAX_SAFE_INTEGER;
      
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(0),
        executionCount: maxSafeInt,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(0),
        executionCount: maxSafeInt,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(0);
    });

    it('handles negative campaign ID (invalid but should not crash)', async () => {
      const onChainState = {
        campaignId: -1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(-1, onChainState);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe('existence');
    });

    it('handles very large campaign ID', async () => {
      const largeId = 999999999;
      
      mockCampaigns.set(largeId, {
        campaignId: largeId,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 5,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: largeId,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 5,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(largeId, onChainState);
      expect(diffs).toHaveLength(0);
    });

    it('handles BigInt at maximum safe value', async () => {
      const maxBigInt = BigInt(Number.MAX_SAFE_INTEGER);
      
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: maxBigInt,
        executionCount: 0,
        targetAmount: maxBigInt,
      });

      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: maxBigInt,
        executionCount: 0,
        targetAmount: maxBigInt,
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(0);
    });

    it('handles currentAmount equal to targetAmount (completion edge case)', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'COMPLETED',
        currentAmount: BigInt(1000000),
        executionCount: 10,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'COMPLETED',
        currentAmount: BigInt(1000000),
        executionCount: 10,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(0);
    });

    it('handles currentAmount exceeding targetAmount (overfunded)', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'COMPLETED',
        currentAmount: BigInt(1500000),
        executionCount: 15,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'COMPLETED',
        currentAmount: BigInt(1500000),
        executionCount: 15,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(0);
    });

    it('handles empty on-chain states array', async () => {
      const result = await checker.checkMultipleCampaigns([]);
      expect(result.consistent).toBe(true);
      expect(result.totalChecked).toBe(0);
      expect(result.diffs).toHaveLength(0);
    });
  });

  /**
   * Error Handling and Exception Scenarios
   * Tests for error conditions and graceful degradation
   */
  describe('Error Handling and Exception Scenarios', () => {
    it('handles Prisma returning null gracefully', async () => {
      const onChainState = {
        campaignId: 999,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(999, onChainState);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe('existence');
      expect(diffs[0].backendValue).toBeNull();
    });

    it('handles multiple missing campaigns in batch check', async () => {
      const onChainStates = [
        {
          campaignId: 999,
          status: 'ACTIVE',
          currentAmount: BigInt(100000),
          executionCount: 2,
          targetAmount: BigInt(1000000),
        },
        {
          campaignId: 998,
          status: 'PAUSED',
          currentAmount: BigInt(50000),
          executionCount: 1,
          targetAmount: BigInt(500000),
        },
      ];

      const result = await checker.checkMultipleCampaigns(onChainStates);
      expect(result.consistent).toBe(false);
      expect(result.diffs).toHaveLength(2);
      expect(result.diffs.every(d => d.field === 'existence')).toBe(true);
    });

    it('handles mix of existing and missing campaigns', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      const onChainStates = [
        {
          campaignId: 1,
          status: 'ACTIVE',
          currentAmount: BigInt(100000),
          executionCount: 2,
          targetAmount: BigInt(1000000),
        },
        {
          campaignId: 999,
          status: 'PAUSED',
          currentAmount: BigInt(50000),
          executionCount: 1,
          targetAmount: BigInt(500000),
        },
      ];

      const result = await checker.checkMultipleCampaigns(onChainStates);
      expect(result.consistent).toBe(false);
      expect(result.totalChecked).toBe(2);
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0].field).toBe('existence');
    });

    it('detects all field mismatches simultaneously', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'PAUSED',
        currentAmount: BigInt(200000),
        executionCount: 5,
        targetAmount: BigInt(2000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(4);
      expect(diffs.map(d => d.field)).toEqual([
        'status',
        'currentAmount',
        'executionCount',
        'targetAmount'
      ]);
    });
  });

  /**
   * Data Validation and Type Safety
   * Tests to ensure proper type handling and data integrity
   */
  describe('Data Validation and Type Safety', () => {
    it('correctly converts BigInt to string in diff output', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(150000),
        executionCount: 2,
        targetAmount: BigInt(2000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(2);
      
      // Verify BigInt values are converted to strings
      const currentAmountDiff = diffs.find(d => d.field === 'currentAmount');
      expect(currentAmountDiff).toBeDefined();
      expect(typeof currentAmountDiff!.backendValue).toBe('string');
      expect(typeof currentAmountDiff!.onChainValue).toBe('string');
      
      const targetAmountDiff = diffs.find(d => d.field === 'targetAmount');
      expect(targetAmountDiff).toBeDefined();
      expect(typeof targetAmountDiff!.backendValue).toBe('string');
      expect(typeof targetAmountDiff!.onChainValue).toBe('string');
    });

    it('keeps executionCount as number in diff output', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 5,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(1);
      expect(typeof diffs[0].backendValue).toBe('number');
      expect(typeof diffs[0].onChainValue).toBe('number');
    });

    it('keeps status as string in diff output', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'PAUSED',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(1);
      expect(typeof diffs[0].backendValue).toBe('string');
      expect(typeof diffs[0].onChainValue).toBe('string');
    });

    it('handles case-sensitive status comparison', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'active', // lowercase
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe('status');
    });

    it('preserves exact BigInt precision in comparisons', async () => {
      const preciseAmount = BigInt('123456789012345678901234567890');
      
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: preciseAmount,
        executionCount: 0,
        targetAmount: preciseAmount,
      });

      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: preciseAmount,
        executionCount: 0,
        targetAmount: preciseAmount,
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(0);
    });

    it('detects single unit difference in BigInt values', async () => {
      const amount = BigInt('1000000000000000000');
      
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: amount,
        executionCount: 0,
        targetAmount: amount,
      });

      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: amount + BigInt(1),
        executionCount: 0,
        targetAmount: amount,
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe('currentAmount');
    });
  });

  /**
   * Performance and Stress Test Scenarios
   * Tests for performance characteristics and large-scale operations
   */
  describe('Performance and Stress Test Scenarios', () => {
    it('handles 500 campaigns in single batch check', async () => {
      const campaigns = [];
      
      for (let i = 1; i <= 500; i++) {
        const campaign = {
          campaignId: i,
          status: 'ACTIVE',
          currentAmount: BigInt(i * 1000),
          executionCount: i,
          targetAmount: BigInt(i * 10000),
        };
        mockCampaigns.set(i, campaign);
        campaigns.push(campaign);
      }

      const result = await checker.checkMultipleCampaigns(campaigns);
      expect(result.consistent).toBe(true);
      expect(result.totalChecked).toBe(500);
      expect(result.diffs).toHaveLength(0);
    });

    it('handles 1000 campaigns with some inconsistencies', async () => {
      const campaigns = [];
      
      for (let i = 1; i <= 1000; i++) {
        const backendCampaign = {
          campaignId: i,
          status: 'ACTIVE',
          currentAmount: BigInt(i * 1000),
          executionCount: i,
          targetAmount: BigInt(i * 10000),
        };
        mockCampaigns.set(i, backendCampaign);
        
        // Introduce drift in every 10th campaign
        const onChainCampaign = i % 10 === 0
          ? {
              ...backendCampaign,
              currentAmount: backendCampaign.currentAmount + BigInt(100),
            }
          : backendCampaign;
        
        campaigns.push(onChainCampaign);
      }

      const result = await checker.checkMultipleCampaigns(campaigns);
      expect(result.consistent).toBe(false);
      expect(result.totalChecked).toBe(1000);
      expect(result.diffs.length).toBe(100); // 1000/10 = 100 inconsistent campaigns
    });

    it('maintains performance with repeated checks on same campaign', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      };

      // Run same check multiple times
      for (let i = 0; i < 100; i++) {
        const diffs = await checker.checkCampaign(1, onChainState);
        expect(diffs).toHaveLength(0);
      }
    });
  });

  /**
   * Regression Scenarios for Potential Bugs
   * Tests based on common patterns that could introduce bugs
   */
  describe('Regression Scenarios for Potential Bugs', () => {
    it('regression: does not false-positive on matching BigInt values', async () => {
      const largeBigInt = BigInt('999999999999999999999');
      
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: largeBigInt,
        executionCount: 0,
        targetAmount: largeBigInt,
      });

      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: largeBigInt,
        executionCount: 0,
        targetAmount: largeBigInt,
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(0);
    });

    it('regression: correctly identifies all field diffs order', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100),
        executionCount: 1,
        targetAmount: BigInt(1000),
      });

      const onChainState = {
        campaignId: 1,
        status: 'PAUSED',
        currentAmount: BigInt(200),
        executionCount: 2,
        targetAmount: BigInt(2000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      
      // Verify order matches implementation order
      expect(diffs[0].field).toBe('status');
      expect(diffs[1].field).toBe('currentAmount');
      expect(diffs[2].field).toBe('executionCount');
      expect(diffs[3].field).toBe('targetAmount');
    });

    it('regression: formatDiffs handles single diff correctly', async () => {
      const diffs = [
        {
          campaignId: 1,
          field: 'status',
          backendValue: 'ACTIVE',
          onChainValue: 'PAUSED',
        },
      ];

      const formatted = checker.formatDiffs(diffs);
      expect(formatted).toContain('❌ Found 1 inconsistencies');
      expect(formatted).toContain('Campaign 1 - status');
    });

    it('regression: formatDiffs preserves all information for multiple diffs', async () => {
      const diffs = [
        {
          campaignId: 1,
          field: 'status',
          backendValue: 'ACTIVE',
          onChainValue: 'PAUSED',
        },
        {
          campaignId: 2,
          field: 'currentAmount',
          backendValue: '100000',
          onChainValue: '200000',
        },
        {
          campaignId: 1,
          field: 'executionCount',
          backendValue: 5,
          onChainValue: 10,
        },
      ];

      const formatted = checker.formatDiffs(diffs);
      expect(formatted).toContain('❌ Found 3 inconsistencies');
      expect(formatted).toContain('Campaign 1 - status');
      expect(formatted).toContain('Campaign 2 - currentAmount');
      expect(formatted).toContain('Campaign 1 - executionCount');
    });

    it('regression: checkMultipleCampaigns aggregates diffs correctly', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100),
        executionCount: 1,
        targetAmount: BigInt(1000),
      });

      mockCampaigns.set(2, {
        campaignId: 2,
        status: 'PAUSED',
        currentAmount: BigInt(200),
        executionCount: 2,
        targetAmount: BigInt(2000),
      });

      const onChainStates = [
        {
          campaignId: 1,
          status: 'PAUSED', // mismatch
          currentAmount: BigInt(100),
          executionCount: 1,
          targetAmount: BigInt(1000),
        },
        {
          campaignId: 2,
          status: 'PAUSED',
          currentAmount: BigInt(300), // mismatch
          executionCount: 2,
          targetAmount: BigInt(2000),
        },
      ];

      const result = await checker.checkMultipleCampaigns(onChainStates);
      expect(result.consistent).toBe(false);
      expect(result.diffs).toHaveLength(2);
      expect(result.diffs.map(d => d.campaignId)).toContain(1);
      expect(result.diffs.map(d => d.campaignId)).toContain(2);
    });

    it('regression: does not mutate input parameters', async () => {
      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      };

      const originalState = JSON.parse(JSON.stringify({
        ...onChainState,
        currentAmount: onChainState.currentAmount.toString(),
        targetAmount: onChainState.targetAmount.toString(),
      }));

      await checker.checkCampaign(1, onChainState);

      // Verify input was not mutated
      expect(onChainState.campaignId).toBe(1);
      expect(onChainState.status).toBe('ACTIVE');
      expect(onChainState.executionCount).toBe(2);
    });

    it('regression: handles duplicate campaign IDs in batch', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      const onChainStates = [
        {
          campaignId: 1,
          status: 'ACTIVE',
          currentAmount: BigInt(100000),
          executionCount: 2,
          targetAmount: BigInt(1000000),
        },
        {
          campaignId: 1, // duplicate
          status: 'PAUSED', // different state
          currentAmount: BigInt(200000),
          executionCount: 3,
          targetAmount: BigInt(1000000),
        },
      ];

      const result = await checker.checkMultipleCampaigns(onChainStates);
      // Should check both entries independently
      expect(result.totalChecked).toBe(2);
      expect(result.diffs.length).toBeGreaterThan(0);
    });
  });

  /**
   * Integration Scenarios
   * Tests that verify the checker works correctly in realistic scenarios
   */
  describe('Integration Scenarios', () => {
    it('simulates real-world campaign state drift detection', async () => {
      // Setup: Campaign in backend
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(500000),
        executionCount: 5,
        targetAmount: BigInt(1000000),
      });

      // Simulate: On-chain state has drifted
      const onChainState = {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(520000), // 20k drift
        executionCount: 5,
        targetAmount: BigInt(1000000),
      };

      const diffs = await checker.checkCampaign(1, onChainState);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe('currentAmount');
      expect(diffs[0].backendValue).toBe('500000');
      expect(diffs[0].onChainValue).toBe('520000');
    });

    it('verifies consistency across campaign lifecycle states', async () => {
      const lifecycleStates = [
        { status: 'PENDING', currentAmount: BigInt(0), executionCount: 0 },
        { status: 'ACTIVE', currentAmount: BigInt(100000), executionCount: 1 },
        { status: 'ACTIVE', currentAmount: BigInt(500000), executionCount: 5 },
        { status: 'PAUSED', currentAmount: BigInt(500000), executionCount: 5 },
        { status: 'ACTIVE', currentAmount: BigInt(750000), executionCount: 8 },
        { status: 'COMPLETED', currentAmount: BigInt(1000000), executionCount: 10 },
      ];

      for (const state of lifecycleStates) {
        mockCampaigns.set(1, {
          campaignId: 1,
          ...state,
          targetAmount: BigInt(1000000),
        });

        const onChainState = {
          campaignId: 1,
          ...state,
          targetAmount: BigInt(1000000),
        };

        const diffs = await checker.checkCampaign(1, onChainState);
        expect(diffs).toHaveLength(0);
      }
    });

    it('handles concurrent batch checks independently', async () => {
      mockCampaigns.set(1, {
        campaignId: 1,
        status: 'ACTIVE',
        currentAmount: BigInt(100000),
        executionCount: 2,
        targetAmount: BigInt(1000000),
      });

      mockCampaigns.set(2, {
        campaignId: 2,
        status: 'PAUSED',
        currentAmount: BigInt(50000),
        executionCount: 1,
        targetAmount: BigInt(500000),
      });

      // Run two independent batch checks
      const batch1 = [
        {
          campaignId: 1,
          status: 'ACTIVE',
          currentAmount: BigInt(100000),
          executionCount: 2,
          targetAmount: BigInt(1000000),
        },
      ];

      const batch2 = [
        {
          campaignId: 2,
          status: 'PAUSED',
          currentAmount: BigInt(50000),
          executionCount: 1,
          targetAmount: BigInt(500000),
        },
      ];

      const result1 = await checker.checkMultipleCampaigns(batch1);
      const result2 = await checker.checkMultipleCampaigns(batch2);

      expect(result1.consistent).toBe(true);
      expect(result2.consistent).toBe(true);
      expect(result1.diffs).toHaveLength(0);
      expect(result2.diffs).toHaveLength(0);
    });
  });
});
