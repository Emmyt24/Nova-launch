import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Represents the on-chain state of a campaign as retrieved from the blockchain
 * @interface OnChainCampaignState
 */
export interface OnChainCampaignState {
  /** Unique identifier for the campaign */
  campaignId: number;
  /** Current status of the campaign (e.g., 'ACTIVE', 'PAUSED', 'COMPLETED') */
  status: string;
  /** Current amount raised in the campaign (in smallest token units) */
  currentAmount: bigint;
  /** Number of times the campaign has been executed */
  executionCount: number;
  /** Target amount for the campaign (in smallest token units) */
  targetAmount: bigint;
}

/**
 * Represents a single inconsistency found between backend and on-chain state
 * @interface ConsistencyDiff
 */
export interface ConsistencyDiff {
  /** Campaign ID where the inconsistency was found */
  campaignId: number;
  /** Field name that has inconsistent values */
  field: string;
  /** Value from the backend database */
  backendValue: any;
  /** Value from the on-chain state */
  onChainValue: any;
}

/**
 * Result of a consistency check across multiple campaigns
 * @interface ConsistencyCheckResult
 */
export interface ConsistencyCheckResult {
  /** True if all campaigns are consistent, false otherwise */
  consistent: boolean;
  /** Total number of campaigns checked */
  totalChecked: number;
  /** Array of all inconsistencies found */
  diffs: ConsistencyDiff[];
}

/**
 * CampaignConsistencyChecker - Verifies consistency between backend database and on-chain state
 * 
 * This service compares campaign data stored in the backend database with the actual
 * on-chain state retrieved from the blockchain. It detects any discrepancies that may
 * indicate data synchronization issues, bugs, or potential security concerns.
 * 
 * @class CampaignConsistencyChecker
 * @example
 * ```typescript
 * const checker = new CampaignConsistencyChecker();
 * const diffs = await checker.checkCampaign(1, onChainState);
 * if (diffs.length > 0) {
 *   console.log(checker.formatDiffs(diffs));
 * }
 * ```
 */
export class CampaignConsistencyChecker {
  /**
   * Checks a single campaign for consistency between backend and on-chain state
   * 
   * Compares the backend database record with the on-chain state and returns
   * an array of differences found. If the campaign doesn't exist in the backend,
   * returns a single diff indicating the missing campaign.
   * 
   * @param campaignId - The unique identifier of the campaign to check
   * @param onChainState - The current on-chain state of the campaign
   * @returns Array of ConsistencyDiff objects representing found discrepancies
   * 
   * @example
   * ```typescript
   * const diffs = await checker.checkCampaign(1, {
   *   campaignId: 1,
   *   status: 'ACTIVE',
   *   currentAmount: BigInt(100000),
   *   executionCount: 2,
   *   targetAmount: BigInt(1000000)
   * });
   * 
   * if (diffs.length > 0) {
   *   console.log('Inconsistencies found:', diffs);
   * }
   * ```
   */
  async checkCampaign(
    campaignId: number,
    onChainState: OnChainCampaignState
  ): Promise<ConsistencyDiff[]> {
    const backendCampaign = await prisma.campaign.findUnique({
      where: { campaignId },
    });

    if (!backendCampaign) {
      return [
        {
          campaignId,
          field: "existence",
          backendValue: null,
          onChainValue: "exists",
        },
      ];
    }

    const diffs: ConsistencyDiff[] = [];

    if (backendCampaign.status !== onChainState.status) {
      diffs.push({
        campaignId,
        field: "status",
        backendValue: backendCampaign.status,
        onChainValue: onChainState.status,
      });
    }

    if (backendCampaign.currentAmount !== onChainState.currentAmount) {
      diffs.push({
        campaignId,
        field: "currentAmount",
        backendValue: backendCampaign.currentAmount.toString(),
        onChainValue: onChainState.currentAmount.toString(),
      });
    }

    if (backendCampaign.executionCount !== onChainState.executionCount) {
      diffs.push({
        campaignId,
        field: "executionCount",
        backendValue: backendCampaign.executionCount,
        onChainValue: onChainState.executionCount,
      });
    }

    if (backendCampaign.targetAmount !== onChainState.targetAmount) {
      diffs.push({
        campaignId,
        field: "targetAmount",
        backendValue: backendCampaign.targetAmount.toString(),
        onChainValue: onChainState.targetAmount.toString(),
      });
    }

    return diffs;
  }

  /**
   * Checks multiple campaigns for consistency in a single batch operation
   * 
   * Iterates through an array of on-chain states and checks each campaign
   * for consistency. Aggregates all differences found across all campaigns
   * into a single result object.
   * 
   * @param onChainStates - Array of on-chain states to check
   * @returns ConsistencyCheckResult object with overall consistency status and all diffs
   * 
   * @example
   * ```typescript
   * const result = await checker.checkMultipleCampaigns([
   *   { campaignId: 1, status: 'ACTIVE', currentAmount: BigInt(100000), executionCount: 2, targetAmount: BigInt(1000000) },
   *   { campaignId: 2, status: 'PAUSED', currentAmount: BigInt(50000), executionCount: 1, targetAmount: BigInt(500000) }
   * ]);
   * 
   * if (!result.consistent) {
   *   console.log(`Found ${result.diffs.length} inconsistencies across ${result.totalChecked} campaigns`);
   * }
   * ```
   */
  async checkMultipleCampaigns(
    onChainStates: OnChainCampaignState[]
  ): Promise<ConsistencyCheckResult> {
    const allDiffs: ConsistencyDiff[] = [];

    for (const onChainState of onChainStates) {
      const diffs = await this.checkCampaign(
        onChainState.campaignId,
        onChainState
      );
      allDiffs.push(...diffs);
    }

    return {
      consistent: allDiffs.length === 0,
      totalChecked: onChainStates.length,
      diffs: allDiffs,
    };
  }

  /**
   * Formats consistency diffs into a human-readable string representation
   * 
   * Converts an array of ConsistencyDiff objects into a formatted string
   * suitable for logging, reporting, or display purposes. Uses emoji
   * indicators for quick visual identification of consistency status.
   * 
   * @param diffs - Array of ConsistencyDiff objects to format
   * @returns Formatted string with consistency check results
   * 
   * @example
   * ```typescript
   * const diffs = await checker.checkCampaign(1, onChainState);
   * const report = checker.formatDiffs(diffs);
   * console.log(report);
   * // Output:
   * // ❌ Found 2 inconsistencies:
   * // 
   * // Campaign 1 - status:
   * //   Backend:  ACTIVE
   * //   On-chain: PAUSED
   * // 
   * // Campaign 1 - currentAmount:
   * //   Backend:  100000
   * //   On-chain: 150000
   * ```
   */
  formatDiffs(diffs: ConsistencyDiff[]): string {
    if (diffs.length === 0) {
      return "✅ No inconsistencies found";
    }

    let output = `❌ Found ${diffs.length} inconsistencies:\n\n`;

    for (const diff of diffs) {
      output += `Campaign ${diff.campaignId} - ${diff.field}:\n`;
      output += `  Backend:  ${diff.backendValue}\n`;
      output += `  On-chain: ${diff.onChainValue}\n\n`;
    }

    return output;
  }
}

export const campaignConsistencyChecker = new CampaignConsistencyChecker();
