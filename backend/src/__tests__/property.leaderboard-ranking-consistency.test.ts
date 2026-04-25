/**
 * Property 76: Leaderboard Ranking Consistency
 *
 * Verifies that ranking is strictly sequential and monotonically related
 * to burn amount. No duplicate ranks for different scores.
 * 
 * Security & Consistency Enhancements:
 * - Secondary sorting by token address ensures deterministic results (prevents flickering).
 * - Handles edge cases like empty arrays and single items gracefully.
 * - BigInt handling for large burn amounts avoiding precision loss.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

interface BurnEntry {
  tokenAddress: string;
  burned: bigint;
}

/**
 * Ranking algorithm used in production leaderboard: sort by burn amount
 * descending and assign 1-based sequential ranks.
 * 
 * Security / Edge Cases Addressed:
 * - Ensures stable sorting by using tokenAddress as a secondary key.
 * - Does not mutate the original array.
 * - Safely handles empty arrays.
 */
function rankLeaderboard(entries: BurnEntry[]) {
  if (!entries || entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => {
    // Primary sort: descending by burn amount
    if (a.burned < b.burned) return 1;
    if (a.burned > b.burned) return -1;
    // Secondary sort: ascending by token address (lexicographical) to ensure absolute determinism
    if (a.tokenAddress < b.tokenAddress) return -1;
    if (a.tokenAddress > b.tokenAddress) return 1;
    return 0;
  });
  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

describe('Property 76: Leaderboard Ranking Consistency', () => {
  // Generator for valid BurnEntry objects with realistic values
  const burnEntryGenerator = fc.record({
    tokenAddress: fc.hexaString({ minLength: 8, maxLength: 16 }).map((h) => `0x${h}`),
    // BigInts scaled to simulate large real-world scenarios (e.g. 10 billion with 7 decimals)
    burned: fc.bigInt({ min: 0n, max: 10_000_000_000_000_000n }),
  });

  describe('Property-Based Tests', () => {
    it('assigns sequential ranks and enforces monotonic burn-order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(burnEntryGenerator, { minLength: 1, maxLength: 100 }),
          async (entries) => {
            const ranked = rankLeaderboard(entries);

            // Property 1: Strict sequential ranks (1..n)
            const ranks = ranked.map((r) => r.rank);
            expect(ranks).toEqual(Array.from({ length: ranked.length }, (_, i) => i + 1));

            // Property 2: Monotonically decreasing burned amounts
            for (let i = 1; i < ranked.length; i += 1) {
              expect(ranked[i - 1].burned).toBeGreaterThanOrEqual(ranked[i].burned);
            }

            // Property 3: No duplicate rank for different burned values
            for (let i = 0; i < ranked.length; i += 1) {
              for (let j = i + 1; j < ranked.length; j += 1) {
                if (ranked[i].burned !== ranked[j].burned) {
                  expect(ranked[i].rank).not.toBe(ranked[j].rank);
                }
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('is completely deterministic regardless of input order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(burnEntryGenerator, { minLength: 1, maxLength: 100 }),
          async (entries) => {
            // Ensure unique token addresses to test strict determinism
            const uniqueEntries = Array.from(new Map(entries.map(e => [e.tokenAddress, e])).values());
            
            const rankedOriginal = rankLeaderboard(uniqueEntries);
            const rankedReversed = rankLeaderboard([...uniqueEntries].reverse());
            
            // Property 4: Ranking output must be identical regardless of input order
            expect(rankedOriginal).toEqual(rankedReversed);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('always assigns rank 1 to the highest burn amount', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(burnEntryGenerator, { minLength: 1, maxLength: 50 }),
          async (entries) => {
            const ranked = rankLeaderboard(entries);
            const maxBurned = entries.reduce((max, e) => (e.burned > max ? e.burned : max), -1n);
            
            // Property 5: Rank 1 matches the absolute maximum burn amount
            expect(ranked[0].burned).toBe(maxBurned);
            expect(ranked[0].rank).toBe(1);
          }
        )
      );
    });
  });

  describe('Unit & Edge Case Tests', () => {
    it('handles empty lists gracefully', () => {
      expect(rankLeaderboard([])).toEqual([]);
    });

    it('handles single item lists correctly', () => {
      const entry = { tokenAddress: '0x123', burned: 100n };
      expect(rankLeaderboard([entry])).toEqual([{ ...entry, rank: 1 }]);
    });

    it('resolves ties deterministically using tokenAddress', () => {
      const entries = [
        { tokenAddress: '0xBBB', burned: 500n },
        { tokenAddress: '0xAAA', burned: 500n },
        { tokenAddress: '0xCCC', burned: 500n },
      ];
      
      const ranked = rankLeaderboard(entries);
      
      // AAA should be first, BBB second, CCC third (lexicographical sort)
      expect(ranked[0].tokenAddress).toBe('0xAAA');
      expect(ranked[1].tokenAddress).toBe('0xBBB');
      expect(ranked[2].tokenAddress).toBe('0xCCC');
      
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);
    });
  });
});
