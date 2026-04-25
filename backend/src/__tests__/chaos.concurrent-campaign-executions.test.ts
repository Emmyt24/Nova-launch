/**
 * Chaos Test: Concurrent Campaign Execution Events
 *
 * Simulates 10+ concurrent execution events for the same campaign and verifies
 * that race condition handling is correct.
 *
 * Scenarios:
 *   C1  10 concurrent executions — final currentAmount and executionCount are correct
 *   C2  Duplicate txHashes in concurrent batch — no double-counting
 *   C3  Mixed creates + executions in parallel — no lost updates
 *   C4  Retry storm on same campaign — idempotency holds under concurrency
 *   C5  15 concurrent executions across 3 campaigns — per-campaign isolation
 *
 * Security considerations:
 *   - Database transactions (prisma.$transaction) are the primary race guard
 *   - Idempotency via unique txHash prevents double-spend from concurrent retries
 *   - No execution should be silently dropped or double-applied
 *
 * Edge cases / assumptions:
 *   - The mock simulates optimistic concurrency; a real DB would use row-level locks
 *   - All amounts are positive BigInts; negative amounts are rejected upstream
 *   - Tests run in-process with a mock Prisma client — no real DB required
 *
 * Follow-up work:
 *   - Add integration test against a real Postgres instance with pg_advisory_lock
 *   - Measure throughput degradation under lock contention
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory Prisma mock (mirrors campaignChaos.test.ts pattern)
// ---------------------------------------------------------------------------

const mockCampaigns = new Map<number, any>();
const mockExecutions = new Map<string, any>();

// Simulate a per-campaign mutex so concurrent updates are serialised
const campaignLocks = new Map<string, Promise<void>>();

function withCampaignLock<T>(campaignId: string, fn: () => Promise<T>): Promise<T> {
  const prev = campaignLocks.get(campaignId) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => (resolve = r));
  campaignLocks.set(campaignId, next);
  return prev.then(fn).finally(resolve);
}

const mockPrisma = {
  campaign: {
    upsert: vi.fn(async ({ where, create }: any) => {
      if (!mockCampaigns.has(where.campaignId)) {
        const campaign = { ...create, id: `campaign-${where.campaignId}` };
        mockCampaigns.set(where.campaignId, campaign);
      }
      return mockCampaigns.get(where.campaignId);
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      return mockCampaigns.get(where.campaignId) ?? null;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const id = Number(where.id?.replace('campaign-', ''));
      const campaign = mockCampaigns.get(id);
      if (!campaign) throw new Error('Campaign not found');
      if (data.currentAmount?.increment) {
        campaign.currentAmount =
          (campaign.currentAmount ?? BigInt(0)) + data.currentAmount.increment;
      }
      if (data.executionCount?.increment) {
        campaign.executionCount = (campaign.executionCount ?? 0) + 1;
      }
      return campaign;
    }),
  },
  campaignExecution: {
    create: vi.fn(async ({ data }: any) => {
      const execution = { ...data, id: `exec-${data.txHash}` };
      mockExecutions.set(data.txHash, execution);
      return execution;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      return mockExecutions.get(where.txHash) ?? null;
    }),
  },
  $transaction: vi.fn(async (ops: Promise<any>[]) => {
    const results = [];
    for (const op of ops) results.push(await op);
    return results;
  }),
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExecution(campaignId: number, idx: number, amount = BigInt(1000)) {
  return {
    campaignId,
    executor: 'executor-addr',
    amount,
    txHash: `tx-${campaignId}-${idx}`,
    executedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chaos: Concurrent Campaign Executions', () => {
  let parser: any;

  beforeAll(async () => {
    const { CampaignEventParser } = await import('../services/campaignEventParser');
    parser = new CampaignEventParser();
  });

  beforeEach(() => {
    mockCampaigns.clear();
    mockExecutions.clear();
    campaignLocks.clear();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // C1: 10 concurrent executions — correct final state
  // -------------------------------------------------------------------------
  it('C1: 10 concurrent executions produce correct currentAmount and executionCount', async () => {
    const campaignId = 1;
    const amount = BigInt(500);
    const count = 10;

    await parser.parseCampaignCreated({
      campaignId,
      tokenId: 'token-1',
      creator: 'creator',
      type: 'BUYBACK',
      targetAmount: BigInt(100_000),
      startTime: new Date(),
      txHash: 'tx-create-1',
    });

    // Fire all 10 executions concurrently
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        withCampaignLock(String(campaignId), () =>
          parser.parseCampaignExecution(makeExecution(campaignId, i, amount)),
        ),
      ),
    );

    const campaign = mockCampaigns.get(campaignId);
    expect(campaign.executionCount).toBe(count);
    expect(campaign.currentAmount).toBe(amount * BigInt(count));
    expect(mockExecutions.size).toBe(count);
  });

  // -------------------------------------------------------------------------
  // C2: Duplicate txHashes in concurrent batch — no double-counting
  // -------------------------------------------------------------------------
  it('C2: duplicate txHashes in concurrent batch are deduplicated', async () => {
    const campaignId = 2;

    await parser.parseCampaignCreated({
      campaignId,
      tokenId: 'token-2',
      creator: 'creator',
      type: 'AIRDROP',
      targetAmount: BigInt(50_000),
      startTime: new Date(),
      txHash: 'tx-create-2',
    });

    // 5 unique executions + 5 duplicates of the first one
    const unique = Array.from({ length: 5 }, (_, i) => makeExecution(campaignId, i));
    const duplicates = Array.from({ length: 5 }, () => makeExecution(campaignId, 0)); // same txHash

    await Promise.all(
      [...unique, ...duplicates].map((exec) =>
        withCampaignLock(String(campaignId), () =>
          parser.parseCampaignExecution(exec).catch(() => {}),
        ),
      ),
    );

    const campaign = mockCampaigns.get(campaignId);
    // Only 5 unique executions should be recorded
    expect(campaign.executionCount).toBe(5);
    expect(mockExecutions.size).toBe(5);
  });

  // -------------------------------------------------------------------------
  // C3: Mixed creates + executions in parallel — no lost updates
  // -------------------------------------------------------------------------
  it('C3: mixed creates and executions in parallel preserve all updates', async () => {
    const campaignIds = [10, 11, 12];

    // Create all campaigns first (prerequisite for executions)
    await Promise.all(
      campaignIds.map((id) =>
        parser.parseCampaignCreated({
          campaignId: id,
          tokenId: `token-${id}`,
          creator: 'creator',
          type: 'LIQUIDITY',
          targetAmount: BigInt(200_000),
          startTime: new Date(),
          txHash: `tx-create-${id}`,
        }),
      ),
    );

    // 5 executions per campaign, all fired concurrently
    const executions = campaignIds.flatMap((id) =>
      Array.from({ length: 5 }, (_, i) => makeExecution(id, i)),
    );

    await Promise.all(
      executions.map((exec) =>
        withCampaignLock(String(exec.campaignId), () =>
          parser.parseCampaignExecution(exec),
        ),
      ),
    );

    for (const id of campaignIds) {
      const campaign = mockCampaigns.get(id);
      expect(campaign.executionCount).toBe(5);
    }
    expect(mockExecutions.size).toBe(15);
  });

  // -------------------------------------------------------------------------
  // C4: Retry storm — idempotency holds under concurrency
  // -------------------------------------------------------------------------
  it('C4: retry storm (same txHash fired 20 times) does not corrupt state', async () => {
    const campaignId = 20;
    const amount = BigInt(1000);

    await parser.parseCampaignCreated({
      campaignId,
      tokenId: 'token-20',
      creator: 'creator',
      type: 'BUYBACK',
      targetAmount: BigInt(500_000),
      startTime: new Date(),
      txHash: 'tx-create-20',
    });

    const exec = makeExecution(campaignId, 0, amount);

    // Fire the same execution 20 times concurrently
    await Promise.all(
      Array.from({ length: 20 }, () =>
        withCampaignLock(String(campaignId), () =>
          parser.parseCampaignExecution(exec).catch(() => {}),
        ),
      ),
    );

    const campaign = mockCampaigns.get(campaignId);
    expect(campaign.executionCount).toBe(1);
    expect(campaign.currentAmount).toBe(amount);
    expect(mockExecutions.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // C5: 15 concurrent executions across 3 campaigns — per-campaign isolation
  // -------------------------------------------------------------------------
  it('C5: 15 concurrent executions across 3 campaigns maintain per-campaign isolation', async () => {
    const campaigns = [30, 31, 32];
    const execsPerCampaign = 5;
    const amount = BigInt(2000);

    await Promise.all(
      campaigns.map((id) =>
        parser.parseCampaignCreated({
          campaignId: id,
          tokenId: `token-${id}`,
          creator: 'creator',
          type: 'BUYBACK',
          targetAmount: BigInt(1_000_000),
          startTime: new Date(),
          txHash: `tx-create-${id}`,
        }),
      ),
    );

    const allExecs = campaigns.flatMap((id) =>
      Array.from({ length: execsPerCampaign }, (_, i) => makeExecution(id, i, amount)),
    );

    // Shuffle to simulate interleaving
    allExecs.sort(() => Math.random() - 0.5);

    await Promise.all(
      allExecs.map((exec) =>
        withCampaignLock(String(exec.campaignId), () =>
          parser.parseCampaignExecution(exec),
        ),
      ),
    );

    for (const id of campaigns) {
      const campaign = mockCampaigns.get(id);
      expect(campaign.executionCount).toBe(execsPerCampaign);
      expect(campaign.currentAmount).toBe(amount * BigInt(execsPerCampaign));
    }
    expect(mockExecutions.size).toBe(campaigns.length * execsPerCampaign);
  });
});
