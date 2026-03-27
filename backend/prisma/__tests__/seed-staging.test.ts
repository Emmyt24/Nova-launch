import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @prisma/client before importing the seed module
// ---------------------------------------------------------------------------

const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@prisma/client', () => {
  const PrismaClient = vi.fn().mockImplementation(() => ({
    user: {
      upsert: mockUpsert,
      update: mockUpdate,
      deleteMany: mockDeleteMany,
      findMany: mockFindMany,
    },
    token: {
      upsert: mockUpsert,
      update: mockUpdate,
      deleteMany: mockDeleteMany,
      findMany: mockFindMany,
    },
    burnRecord: {
      upsert: mockUpsert,
      update: mockUpdate,
      deleteMany: mockDeleteMany,
      findMany: mockFindMany,
    },
    analytics: {
      upsert: mockUpsert,
      update: mockUpdate,
      deleteMany: mockDeleteMany,
      findMany: mockFindMany,
    },
    webhookSubscription: {
      upsert: mockUpsert,
      update: mockUpdate,
      deleteMany: mockDeleteMany,
      findMany: mockFindMany,
    },
  }));
  return { PrismaClient };
});

// Import after mocking
import { runStagingSeed, cleanupStagingSeed, STAGING_SEED_IDS } from '../seed-staging';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake token record returned by prisma.token.upsert */
function fakeToken(id: string, address: string) {
  return { id, address };
}

/** Build a fake user record */
function fakeUser(id: string, address: string) {
  return { id, address };
}

/** Build a fake burn record */
function fakeBurn(id: string, txHash: string, tokenId: string) {
  return { id, txHash, tokenId };
}

/** Build a fake analytics record */
function fakeAnalytics(id: string, tokenId: string, date: Date) {
  return { id, tokenId, date };
}

/** Build a fake webhook record */
function fakeWebhook(id: string, endpoint: string) {
  return { id, endpoint };
}

// ---------------------------------------------------------------------------
// Shared mock setup for a happy-path seed run
// ---------------------------------------------------------------------------

function setupHappyPathMocks() {
  // Tokens
  const t1 = fakeToken('token-id-001', STAGING_SEED_IDS.tokens.TOKEN_001);
  const t2 = fakeToken('token-id-002', STAGING_SEED_IDS.tokens.TOKEN_002);
  const t3 = fakeToken('token-id-003', STAGING_SEED_IDS.tokens.TOKEN_003);

  // Users
  const u1 = fakeUser('user-id-001', STAGING_SEED_IDS.users.USER_001);
  const u2 = fakeUser('user-id-002', STAGING_SEED_IDS.users.USER_002);

  // Burn records
  const b1 = fakeBurn('burn-id-001', STAGING_SEED_IDS.burnRecords.TX_001, t1.id);
  const b2 = fakeBurn('burn-id-002', STAGING_SEED_IDS.burnRecords.TX_002, t1.id);
  const b3 = fakeBurn('burn-id-003', STAGING_SEED_IDS.burnRecords.TX_003, t2.id);
  const b4 = fakeBurn('burn-id-004', STAGING_SEED_IDS.burnRecords.TX_004, t2.id);
  const b5 = fakeBurn('burn-id-005', STAGING_SEED_IDS.burnRecords.TX_005, t3.id);
  const b6 = fakeBurn('burn-id-006', STAGING_SEED_IDS.burnRecords.TX_006, t3.id);

  // Analytics (3 per token = 9 total)
  const now = new Date();
  const day0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const day2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));

  const analyticsRows = [
    fakeAnalytics('ana-001', t1.id, day0),
    fakeAnalytics('ana-002', t1.id, day1),
    fakeAnalytics('ana-003', t1.id, day2),
    fakeAnalytics('ana-004', t2.id, day0),
    fakeAnalytics('ana-005', t2.id, day1),
    fakeAnalytics('ana-006', t2.id, day2),
    fakeAnalytics('ana-007', t3.id, day0),
    fakeAnalytics('ana-008', t3.id, day1),
    fakeAnalytics('ana-009', t3.id, day2),
  ];

  // Webhooks
  const w1 = fakeWebhook('webhook-id-001', STAGING_SEED_IDS.webhooks.WEBHOOK_001);
  const w2 = fakeWebhook('webhook-id-002', STAGING_SEED_IDS.webhooks.WEBHOOK_002);

  // The seed module calls upsert in this order:
  // user001, user002, token001, token002, token003,
  // burn001..burn006, (token.update x3), analytics x9, webhook001, webhook002
  mockUpsert
    .mockResolvedValueOnce(u1)    // user001
    .mockResolvedValueOnce(u2)    // user002
    .mockResolvedValueOnce(t1)    // token001
    .mockResolvedValueOnce(t2)    // token002
    .mockResolvedValueOnce(t3)    // token003
    .mockResolvedValueOnce(b1)    // burn001
    .mockResolvedValueOnce(b2)    // burn002
    .mockResolvedValueOnce(b3)    // burn003
    .mockResolvedValueOnce(b4)    // burn004
    .mockResolvedValueOnce(b5)    // burn005
    .mockResolvedValueOnce(b6)    // burn006
    // analytics (9 records via Promise.all — order matches analyticsRows)
    .mockResolvedValueOnce(analyticsRows[0])
    .mockResolvedValueOnce(analyticsRows[1])
    .mockResolvedValueOnce(analyticsRows[2])
    .mockResolvedValueOnce(analyticsRows[3])
    .mockResolvedValueOnce(analyticsRows[4])
    .mockResolvedValueOnce(analyticsRows[5])
    .mockResolvedValueOnce(analyticsRows[6])
    .mockResolvedValueOnce(analyticsRows[7])
    .mockResolvedValueOnce(analyticsRows[8])
    .mockResolvedValueOnce(w1)    // webhook001
    .mockResolvedValueOnce(w2);   // webhook002

  // token.update is called 3 times (totalBurned updates)
  mockUpdate.mockResolvedValue({});

  return { t1, t2, t3, u1, u2, b1, b2, b3, b4, b5, b6, analyticsRows, w1, w2 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seed-staging unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 5.1 Happy-path seed run
  // -------------------------------------------------------------------------
  describe('5.1 Happy-path seed run', () => {
    it('returns correct entity counts', async () => {
      setupHappyPathMocks();

      const result = await runStagingSeed();

      expect(result.tokens).toHaveLength(3);
      expect(result.users).toHaveLength(2);
      expect(result.burnRecords).toHaveLength(6);
      expect(result.analytics).toHaveLength(9);
      expect(result.webhookSubscriptions).toHaveLength(2);
    });

    it('token stableIdentifiers match STAGING_SEED_IDS', async () => {
      setupHappyPathMocks();

      const result = await runStagingSeed();

      const tokenIds = result.tokens.map((t) => t.stableIdentifier);
      expect(tokenIds).toContain(STAGING_SEED_IDS.tokens.TOKEN_001);
      expect(tokenIds).toContain(STAGING_SEED_IDS.tokens.TOKEN_002);
      expect(tokenIds).toContain(STAGING_SEED_IDS.tokens.TOKEN_003);
    });

    it('user stableIdentifiers match STAGING_SEED_IDS', async () => {
      setupHappyPathMocks();

      const result = await runStagingSeed();

      const userIds = result.users.map((u) => u.stableIdentifier);
      expect(userIds).toContain(STAGING_SEED_IDS.users.USER_001);
      expect(userIds).toContain(STAGING_SEED_IDS.users.USER_002);
    });

    it('burnRecord stableIdentifiers match STAGING_SEED_IDS', async () => {
      setupHappyPathMocks();

      const result = await runStagingSeed();

      const txHashes = result.burnRecords.map((b) => b.stableIdentifier);
      for (const txHash of Object.values(STAGING_SEED_IDS.burnRecords)) {
        expect(txHashes).toContain(txHash);
      }
    });

    it('webhookSubscription stableIdentifiers match STAGING_SEED_IDS', async () => {
      setupHappyPathMocks();

      const result = await runStagingSeed();

      const endpoints = result.webhookSubscriptions.map((w) => w.stableIdentifier);
      expect(endpoints).toContain(STAGING_SEED_IDS.webhooks.WEBHOOK_001);
      expect(endpoints).toContain(STAGING_SEED_IDS.webhooks.WEBHOOK_002);
    });

    it('all result entries have non-empty id fields', async () => {
      setupHappyPathMocks();

      const result = await runStagingSeed();

      for (const token of result.tokens) {
        expect(token.id).toBeTruthy();
      }
      for (const user of result.users) {
        expect(user.id).toBeTruthy();
      }
      for (const burn of result.burnRecords) {
        expect(burn.id).toBeTruthy();
      }
      for (const analytic of result.analytics) {
        expect(analytic.id).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5.2 CHAIN_AFTER_DEPLOY injection
  // -------------------------------------------------------------------------
  describe('5.2 CHAIN_AFTER_DEPLOY injection', () => {
    it('overrides TOKEN_001 address when token001Address override is provided', async () => {
      const deployedAddress = '0xDEPLOYED_CONTRACT';

      // Rebuild mocks with the overridden address for token001
      const t1 = fakeToken('token-id-001', deployedAddress);
      const t2 = fakeToken('token-id-002', STAGING_SEED_IDS.tokens.TOKEN_002);
      const t3 = fakeToken('token-id-003', STAGING_SEED_IDS.tokens.TOKEN_003);
      const u1 = fakeUser('user-id-001', STAGING_SEED_IDS.users.USER_001);
      const u2 = fakeUser('user-id-002', STAGING_SEED_IDS.users.USER_002);

      const now = new Date();
      const day0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const day1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const day2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));

      mockUpsert
        .mockResolvedValueOnce(u1)
        .mockResolvedValueOnce(u2)
        .mockResolvedValueOnce(t1)
        .mockResolvedValueOnce(t2)
        .mockResolvedValueOnce(t3)
        .mockResolvedValueOnce(fakeBurn('b1', STAGING_SEED_IDS.burnRecords.TX_001, t1.id))
        .mockResolvedValueOnce(fakeBurn('b2', STAGING_SEED_IDS.burnRecords.TX_002, t1.id))
        .mockResolvedValueOnce(fakeBurn('b3', STAGING_SEED_IDS.burnRecords.TX_003, t2.id))
        .mockResolvedValueOnce(fakeBurn('b4', STAGING_SEED_IDS.burnRecords.TX_004, t2.id))
        .mockResolvedValueOnce(fakeBurn('b5', STAGING_SEED_IDS.burnRecords.TX_005, t3.id))
        .mockResolvedValueOnce(fakeBurn('b6', STAGING_SEED_IDS.burnRecords.TX_006, t3.id))
        .mockResolvedValueOnce(fakeAnalytics('a1', t1.id, day0))
        .mockResolvedValueOnce(fakeAnalytics('a2', t1.id, day1))
        .mockResolvedValueOnce(fakeAnalytics('a3', t1.id, day2))
        .mockResolvedValueOnce(fakeAnalytics('a4', t2.id, day0))
        .mockResolvedValueOnce(fakeAnalytics('a5', t2.id, day1))
        .mockResolvedValueOnce(fakeAnalytics('a6', t2.id, day2))
        .mockResolvedValueOnce(fakeAnalytics('a7', t3.id, day0))
        .mockResolvedValueOnce(fakeAnalytics('a8', t3.id, day1))
        .mockResolvedValueOnce(fakeAnalytics('a9', t3.id, day2))
        .mockResolvedValueOnce(fakeWebhook('w1', STAGING_SEED_IDS.webhooks.WEBHOOK_001))
        .mockResolvedValueOnce(fakeWebhook('w2', STAGING_SEED_IDS.webhooks.WEBHOOK_002));

      mockUpdate.mockResolvedValue({});

      const result = await runStagingSeed({ token001Address: deployedAddress });

      // TOKEN_001 slot should carry the deployed address
      expect(result.tokens[0].stableIdentifier).toBe(deployedAddress);
    });

    it('TOKEN_002 and TOKEN_003 keep their default stable identifiers', async () => {
      const deployedAddress = '0xDEPLOYED_CONTRACT';

      const t1 = fakeToken('token-id-001', deployedAddress);
      const t2 = fakeToken('token-id-002', STAGING_SEED_IDS.tokens.TOKEN_002);
      const t3 = fakeToken('token-id-003', STAGING_SEED_IDS.tokens.TOKEN_003);
      const u1 = fakeUser('user-id-001', STAGING_SEED_IDS.users.USER_001);
      const u2 = fakeUser('user-id-002', STAGING_SEED_IDS.users.USER_002);

      const now = new Date();
      const day0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const day1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const day2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));

      mockUpsert
        .mockResolvedValueOnce(u1)
        .mockResolvedValueOnce(u2)
        .mockResolvedValueOnce(t1)
        .mockResolvedValueOnce(t2)
        .mockResolvedValueOnce(t3)
        .mockResolvedValueOnce(fakeBurn('b1', STAGING_SEED_IDS.burnRecords.TX_001, t1.id))
        .mockResolvedValueOnce(fakeBurn('b2', STAGING_SEED_IDS.burnRecords.TX_002, t1.id))
        .mockResolvedValueOnce(fakeBurn('b3', STAGING_SEED_IDS.burnRecords.TX_003, t2.id))
        .mockResolvedValueOnce(fakeBurn('b4', STAGING_SEED_IDS.burnRecords.TX_004, t2.id))
        .mockResolvedValueOnce(fakeBurn('b5', STAGING_SEED_IDS.burnRecords.TX_005, t3.id))
        .mockResolvedValueOnce(fakeBurn('b6', STAGING_SEED_IDS.burnRecords.TX_006, t3.id))
        .mockResolvedValueOnce(fakeAnalytics('a1', t1.id, day0))
        .mockResolvedValueOnce(fakeAnalytics('a2', t1.id, day1))
        .mockResolvedValueOnce(fakeAnalytics('a3', t1.id, day2))
        .mockResolvedValueOnce(fakeAnalytics('a4', t2.id, day0))
        .mockResolvedValueOnce(fakeAnalytics('a5', t2.id, day1))
        .mockResolvedValueOnce(fakeAnalytics('a6', t2.id, day2))
        .mockResolvedValueOnce(fakeAnalytics('a7', t3.id, day0))
        .mockResolvedValueOnce(fakeAnalytics('a8', t3.id, day1))
        .mockResolvedValueOnce(fakeAnalytics('a9', t3.id, day2))
        .mockResolvedValueOnce(fakeWebhook('w1', STAGING_SEED_IDS.webhooks.WEBHOOK_001))
        .mockResolvedValueOnce(fakeWebhook('w2', STAGING_SEED_IDS.webhooks.WEBHOOK_002));

      mockUpdate.mockResolvedValue({});

      const result = await runStagingSeed({ token001Address: deployedAddress });

      expect(result.tokens[1].stableIdentifier).toBe(STAGING_SEED_IDS.tokens.TOKEN_002);
      expect(result.tokens[2].stableIdentifier).toBe(STAGING_SEED_IDS.tokens.TOKEN_003);
    });
  });

  // -------------------------------------------------------------------------
  // 5.3 Cleanup flow
  // -------------------------------------------------------------------------
  describe('5.3 --cleanup flow', () => {
    it('returns correct deletion counts', async () => {
      // findMany returns 3 fake token IDs (used to scope analytics deletion)
      mockFindMany.mockResolvedValueOnce([
        { id: 'token-id-001' },
        { id: 'token-id-002' },
        { id: 'token-id-003' },
      ]);

      // deleteMany calls in order: analytics, burnRecords, webhooks, tokens, users
      mockDeleteMany
        .mockResolvedValueOnce({ count: 9 })  // analytics
        .mockResolvedValueOnce({ count: 6 })  // burnRecords
        .mockResolvedValueOnce({ count: 2 })  // webhookSubscriptions
        .mockResolvedValueOnce({ count: 3 })  // tokens
        .mockResolvedValueOnce({ count: 2 }); // users

      const result = await cleanupStagingSeed();

      expect(result.analytics).toBe(9);
      expect(result.burnRecords).toBe(6);
      expect(result.webhookSubscriptions).toBe(2);
      expect(result.tokens).toBe(3);
      expect(result.users).toBe(2);
    });

    it('analytics deletion count is greater than 0', async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: 'token-id-001' },
        { id: 'token-id-002' },
        { id: 'token-id-003' },
      ]);

      mockDeleteMany
        .mockResolvedValueOnce({ count: 9 })
        .mockResolvedValueOnce({ count: 6 })
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 3 })
        .mockResolvedValueOnce({ count: 2 });

      const result = await cleanupStagingSeed();

      expect(result.analytics).toBeGreaterThan(0);
    });

    it('handles zero-count cleanup gracefully (idempotent cleanup)', async () => {
      mockFindMany.mockResolvedValueOnce([]); // no tokens found

      mockDeleteMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await cleanupStagingSeed();

      expect(result.analytics).toBe(0);
      expect(result.burnRecords).toBe(0);
      expect(result.webhookSubscriptions).toBe(0);
      expect(result.tokens).toBe(0);
      expect(result.users).toBe(0);
    });
  });
});
