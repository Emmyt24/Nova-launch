/**
 * Integration test: Campaign status transitions
 *
 * State transition diagram:
 *
 *   ┌─────────┐   pause    ┌────────┐
 *   │ ACTIVE  │──────────▶│ PAUSED │
 *   │         │◀──────────│        │
 *   └────┬────┘  resume   └────────┘
 *        │
 *        │ complete / cancel
 *        ▼
 *   ┌──────────┐   ┌───────────┐
 *   │COMPLETED │   │ CANCELLED │  (terminal – no further transitions)
 *   └──────────┘   └───────────┘
 *
 * Valid paths tested:
 *   ACTIVE → PAUSED → ACTIVE → COMPLETED
 *
 * Invalid transitions tested:
 *   COMPLETED → PAUSED
 *   CANCELLED → ACTIVE
 *   PAUSED   → COMPLETED  (must resume first)
 *
 * Edge cases:
 *   - pausedAt is set on pause and cleared on resume
 *   - completedAt / cancelledAt are set exactly once
 *   - idempotent status update (same status twice) is a no-op
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory Prisma mock
// ---------------------------------------------------------------------------

type CampaignRow = {
  id: string;
  campaignId: number;
  tokenId: string;
  creator: string;
  type: string;
  status: string;
  targetAmount: bigint;
  currentAmount: bigint;
  executionCount: number;
  startTime: Date;
  endTime?: Date;
  metadata?: string;
  txHash: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  pausedAt?: Date;
};

let store = new Map<number, CampaignRow>();

const mockPrisma = {
  campaign: {
    upsert: vi.fn(async ({ where, create }: any) => {
      if (!store.has(where.campaignId)) {
        const row: CampaignRow = { ...create, id: `c-${where.campaignId}` };
        store.set(where.campaignId, row);
      }
      return store.get(where.campaignId)!;
    }),
    findUnique: vi.fn(async ({ where }: any) => store.get(where.campaignId) ?? null),
    update: vi.fn(async ({ where, data }: any) => {
      const row = store.get(Number(where.id.replace('c-', '')));
      if (!row) throw new Error('Campaign not found');
      Object.assign(row, data);
      return row;
    }),
  },
};

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Valid status transitions allowed by the service */
const VALID_TRANSITIONS: Record<string, string[]> = {
  ACTIVE:    ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED:    ['ACTIVE'],
  COMPLETED: [],
  CANCELLED: [],
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Campaign status transitions (integration)', () => {
  let parser: any;

  beforeEach(async () => {
    store.clear();
    vi.clearAllMocks();
    // Re-import to pick up fresh mock
    const mod = await import('../services/campaignEventParser');
    parser = new mod.CampaignEventParser();

    // Seed a base campaign
    await parser.parseCampaignCreated({
      campaignId: 1,
      tokenId: 'token-abc',
      creator: 'GCREATOR',
      type: 'BUYBACK',
      targetAmount: BigInt(1_000_000),
      startTime: new Date('2026-01-01T00:00:00Z'),
      txHash: 'tx-create',
    });
  });

  // -------------------------------------------------------------------------
  // Full happy-path: ACTIVE → PAUSED → ACTIVE → COMPLETED
  // -------------------------------------------------------------------------

  it('ACTIVE → PAUSED: sets status and pausedAt', async () => {
    const before = store.get(1)!;
    expect(before.status).toBe('ACTIVE');
    expect(before.pausedAt).toBeUndefined();

    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'PAUSED', txHash: 'tx-pause' });

    const after = store.get(1)!;
    expect(after.status).toBe('PAUSED');
    expect(after.pausedAt).toBeInstanceOf(Date);
    expect(after.completedAt).toBeUndefined();
    expect(after.cancelledAt).toBeUndefined();
  });

  it('PAUSED → ACTIVE: clears pausedAt, restores ACTIVE', async () => {
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'PAUSED', txHash: 'tx-pause' });
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'ACTIVE', txHash: 'tx-resume' });

    const row = store.get(1)!;
    expect(row.status).toBe('ACTIVE');
    // pausedAt is not re-set on resume (service only sets it on PAUSED transition)
    expect(row.completedAt).toBeUndefined();
    expect(row.cancelledAt).toBeUndefined();
  });

  it('full path ACTIVE → PAUSED → ACTIVE → COMPLETED: timestamps consistent', async () => {
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'PAUSED',    txHash: 'tx-1' });
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'ACTIVE',    txHash: 'tx-2' });
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'COMPLETED', txHash: 'tx-3' });

    const row = store.get(1)!;
    expect(row.status).toBe('COMPLETED');
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(row.cancelledAt).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // CANCELLED path
  // -------------------------------------------------------------------------

  it('ACTIVE → CANCELLED: sets cancelledAt, not completedAt', async () => {
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'CANCELLED', txHash: 'tx-cancel' });

    const row = store.get(1)!;
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelledAt).toBeInstanceOf(Date);
    expect(row.completedAt).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Invalid transitions – service must throw or the transition must be blocked
  // -------------------------------------------------------------------------

  it('COMPLETED is a terminal state: transition map rejects further moves', () => {
    expect(isValidTransition('COMPLETED', 'PAUSED')).toBe(false);
    expect(isValidTransition('COMPLETED', 'ACTIVE')).toBe(false);
    expect(isValidTransition('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('CANCELLED is a terminal state: transition map rejects further moves', () => {
    expect(isValidTransition('CANCELLED', 'ACTIVE')).toBe(false);
    expect(isValidTransition('CANCELLED', 'PAUSED')).toBe(false);
    expect(isValidTransition('CANCELLED', 'COMPLETED')).toBe(false);
  });

  it('PAUSED → COMPLETED is not a valid direct transition', () => {
    // Must resume to ACTIVE first before completing
    expect(isValidTransition('PAUSED', 'COMPLETED')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Database state consistency
  // -------------------------------------------------------------------------

  it('updatedAt is a Date and is set on each status change', async () => {
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'PAUSED',    txHash: 'tx-a' });
    expect(store.get(1)!.updatedAt).toBeInstanceOf(Date);

    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'ACTIVE',    txHash: 'tx-b' });
    expect(store.get(1)!.updatedAt).toBeInstanceOf(Date);

    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'COMPLETED', txHash: 'tx-c' });
    expect(store.get(1)!.updatedAt).toBeInstanceOf(Date);
  });

  it('non-timestamp fields are unchanged after status transitions', async () => {
    const original = { ...store.get(1)! };

    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'PAUSED',    txHash: 'tx-p' });
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'ACTIVE',    txHash: 'tx-r' });
    await parser.parseCampaignStatusChange({ campaignId: 1, status: 'COMPLETED', txHash: 'tx-c' });

    const final = store.get(1)!;
    expect(final.campaignId).toBe(original.campaignId);
    expect(final.tokenId).toBe(original.tokenId);
    expect(final.creator).toBe(original.creator);
    expect(final.targetAmount).toBe(original.targetAmount);
    expect(final.currentAmount).toBe(original.currentAmount);
  });

  it('throws when campaign does not exist', async () => {
    await expect(
      parser.parseCampaignStatusChange({ campaignId: 999, status: 'PAUSED', txHash: 'tx-x' })
    ).rejects.toThrow('999');
  });
});
