import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StagingSeedIds {
  tokens: Record<string, string>;
  users: Record<string, string>;
  burnRecords: Record<string, string>;
  webhooks: Record<string, string>;
}

export interface SeedResult {
  tokens: Array<{ id: string; stableIdentifier: string }>;
  users: Array<{ id: string; stableIdentifier: string }>;
  burnRecords: Array<{ id: string; stableIdentifier: string }>;
  webhookSubscriptions: Array<{ id: string; stableIdentifier: string }>;
  analytics: Array<{ id: string; tokenId: string; date: string }>;
}

export interface CleanupResult {
  analytics: number;
  burnRecords: number;
  webhookSubscriptions: number;
  tokens: number;
  users: number;
}

export interface SeedOverrides {
  token001Address?: string;
}

// ---------------------------------------------------------------------------
// Stable identifier constants
// ---------------------------------------------------------------------------

export const STAGING_SEED_IDS = {
  tokens: {
    TOKEN_001: '0xSTAGING_TOKEN_001',
    TOKEN_002: '0xSTAGING_TOKEN_002',
    TOKEN_003: '0xSTAGING_TOKEN_003',
  },
  users: {
    USER_001: '0xSTAGING_USER_001',
    USER_002: '0xSTAGING_USER_002',
  },
  burnRecords: {
    TX_001: '0xSTAGING_TX_001',
    TX_002: '0xSTAGING_TX_002',
    TX_003: '0xSTAGING_TX_003',
    TX_004: '0xSTAGING_TX_004',
    TX_005: '0xSTAGING_TX_005',
    TX_006: '0xSTAGING_TX_006',
  },
  webhooks: {
    WEBHOOK_001: 'https://staging-hook-001.example.com/webhook',
    WEBHOOK_002: 'https://staging-hook-002.example.com/webhook',
  },
} as const satisfies StagingSeedIds;

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function runStagingSeed(overrides?: SeedOverrides): Promise<SeedResult> {
  const token001Address = overrides?.token001Address ?? STAGING_SEED_IDS.tokens.TOKEN_001;

  // --- Upsert Users ---
  const user001 = await prisma.user.upsert({
    where: { address: STAGING_SEED_IDS.users.USER_001 },
    update: {},
    create: { address: STAGING_SEED_IDS.users.USER_001 },
  });

  const user002 = await prisma.user.upsert({
    where: { address: STAGING_SEED_IDS.users.USER_002 },
    update: {},
    create: { address: STAGING_SEED_IDS.users.USER_002 },
  });

  // --- Upsert Tokens ---
  const token001 = await prisma.token.upsert({
    where: { address: token001Address },
    update: {
      name: 'Staging Alpha',
      symbol: 'SALPHA',
      decimals: 18,
      totalSupply: 1_000_000n * 10n ** 18n,
      initialSupply: 1_000_000n * 10n ** 18n,
      creator: STAGING_SEED_IDS.users.USER_001,
    },
    create: {
      address: token001Address,
      name: 'Staging Alpha',
      symbol: 'SALPHA',
      decimals: 18,
      totalSupply: 1_000_000n * 10n ** 18n,
      initialSupply: 1_000_000n * 10n ** 18n,
      creator: STAGING_SEED_IDS.users.USER_001,
      totalBurned: 0n,
    },
  });

  const token002 = await prisma.token.upsert({
    where: { address: STAGING_SEED_IDS.tokens.TOKEN_002 },
    update: {
      name: 'Staging Beta',
      symbol: 'SBETA',
      decimals: 18,
      totalSupply: 10_000n * 10n ** 18n,
      initialSupply: 10_000n * 10n ** 18n,
      creator: STAGING_SEED_IDS.users.USER_001,
    },
    create: {
      address: STAGING_SEED_IDS.tokens.TOKEN_002,
      name: 'Staging Beta',
      symbol: 'SBETA',
      decimals: 18,
      totalSupply: 10_000n * 10n ** 18n,
      initialSupply: 10_000n * 10n ** 18n,
      creator: STAGING_SEED_IDS.users.USER_001,
      totalBurned: 0n,
    },
  });

  const token003 = await prisma.token.upsert({
    where: { address: STAGING_SEED_IDS.tokens.TOKEN_003 },
    update: {
      name: 'Staging Gamma',
      symbol: 'SGAMMA',
      decimals: 18,
      totalSupply: 500n * 10n ** 18n,
      initialSupply: 500n * 10n ** 18n,
      creator: STAGING_SEED_IDS.users.USER_002,
    },
    create: {
      address: STAGING_SEED_IDS.tokens.TOKEN_003,
      name: 'Staging Gamma',
      symbol: 'SGAMMA',
      decimals: 18,
      totalSupply: 500n * 10n ** 18n,
      initialSupply: 500n * 10n ** 18n,
      creator: STAGING_SEED_IDS.users.USER_002,
      totalBurned: 0n,
    },
  });

  // --- Upsert BurnRecords ---
  const burn001 = await prisma.burnRecord.upsert({
    where: { txHash: STAGING_SEED_IDS.burnRecords.TX_001 },
    update: {},
    create: {
      txHash: STAGING_SEED_IDS.burnRecords.TX_001,
      tokenId: token001.id,
      amount: 100n * 10n ** 18n,
      from: STAGING_SEED_IDS.users.USER_001,
      burnedBy: STAGING_SEED_IDS.users.USER_001,
      isAdminBurn: false,
    },
  });

  const burn002 = await prisma.burnRecord.upsert({
    where: { txHash: STAGING_SEED_IDS.burnRecords.TX_002 },
    update: {},
    create: {
      txHash: STAGING_SEED_IDS.burnRecords.TX_002,
      tokenId: token001.id,
      amount: 200n * 10n ** 18n,
      from: STAGING_SEED_IDS.users.USER_001,
      burnedBy: STAGING_SEED_IDS.users.USER_001,
      isAdminBurn: false,
    },
  });

  const burn003 = await prisma.burnRecord.upsert({
    where: { txHash: STAGING_SEED_IDS.burnRecords.TX_003 },
    update: {},
    create: {
      txHash: STAGING_SEED_IDS.burnRecords.TX_003,
      tokenId: token002.id,
      amount: 50n * 10n ** 18n,
      from: STAGING_SEED_IDS.users.USER_002,
      burnedBy: STAGING_SEED_IDS.users.USER_002,
      isAdminBurn: false,
    },
  });

  const burn004 = await prisma.burnRecord.upsert({
    where: { txHash: STAGING_SEED_IDS.burnRecords.TX_004 },
    update: {},
    create: {
      txHash: STAGING_SEED_IDS.burnRecords.TX_004,
      tokenId: token002.id,
      amount: 75n * 10n ** 18n,
      from: STAGING_SEED_IDS.users.USER_002,
      burnedBy: STAGING_SEED_IDS.users.USER_002,
      isAdminBurn: false,
    },
  });

  const burn005 = await prisma.burnRecord.upsert({
    where: { txHash: STAGING_SEED_IDS.burnRecords.TX_005 },
    update: {},
    create: {
      txHash: STAGING_SEED_IDS.burnRecords.TX_005,
      tokenId: token003.id,
      amount: 10n * 10n ** 18n,
      from: STAGING_SEED_IDS.users.USER_001,
      burnedBy: STAGING_SEED_IDS.users.USER_001,
      isAdminBurn: false,
    },
  });

  const burn006 = await prisma.burnRecord.upsert({
    where: { txHash: STAGING_SEED_IDS.burnRecords.TX_006 },
    update: {},
    create: {
      txHash: STAGING_SEED_IDS.burnRecords.TX_006,
      tokenId: token003.id,
      amount: 15n * 10n ** 18n,
      from: STAGING_SEED_IDS.users.USER_002,
      burnedBy: STAGING_SEED_IDS.users.USER_002,
      isAdminBurn: false,
    },
  });

  // --- Update token.totalBurned ---
  await prisma.token.update({
    where: { id: token001.id },
    data: { totalBurned: 300n * 10n ** 18n },
  });

  await prisma.token.update({
    where: { id: token002.id },
    data: { totalBurned: 125n * 10n ** 18n },
  });

  await prisma.token.update({
    where: { id: token003.id },
    data: { totalBurned: 25n * 10n ** 18n },
  });

  // --- Compute start-of-day dates (UTC) for the 3 most recent calendar days ---
  const now = new Date();
  const day0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const day2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));

  // --- Upsert Analytics records (3 per token, one per day) ---
  const analyticsRecords = await Promise.all([
    // token001: burnVolume=100 * 10^18, burnCount=1 per day
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token001.id, date: day0 } },
      update: { burnVolume: 100n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token001.id, date: day0, burnVolume: 100n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token001.id, date: day1 } },
      update: { burnVolume: 100n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token001.id, date: day1, burnVolume: 100n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token001.id, date: day2 } },
      update: { burnVolume: 100n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token001.id, date: day2, burnVolume: 100n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
    // token002: burnVolume=50 * 10^18, burnCount=1 per day
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token002.id, date: day0 } },
      update: { burnVolume: 50n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token002.id, date: day0, burnVolume: 50n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token002.id, date: day1 } },
      update: { burnVolume: 50n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token002.id, date: day1, burnVolume: 50n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token002.id, date: day2 } },
      update: { burnVolume: 50n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token002.id, date: day2, burnVolume: 50n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
    // token003: burnVolume=10 * 10^18, burnCount=1 per day
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token003.id, date: day0 } },
      update: { burnVolume: 10n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token003.id, date: day0, burnVolume: 10n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token003.id, date: day1 } },
      update: { burnVolume: 10n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token003.id, date: day1, burnVolume: 10n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
    prisma.analytics.upsert({
      where: { tokenId_date: { tokenId: token003.id, date: day2 } },
      update: { burnVolume: 10n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
      create: { tokenId: token003.id, date: day2, burnVolume: 10n * 10n ** 18n, burnCount: 1, uniqueBurners: 1 },
    }),
  ]);

  // --- Upsert WebhookSubscription records ---
  const webhook001 = await prisma.webhookSubscription.upsert({
    where: { endpoint: STAGING_SEED_IDS.webhooks.WEBHOOK_001 },
    update: { userAddress: STAGING_SEED_IDS.users.USER_001 },
    create: {
      endpoint: STAGING_SEED_IDS.webhooks.WEBHOOK_001,
      userAddress: STAGING_SEED_IDS.users.USER_001,
    },
  });

  const webhook002 = await prisma.webhookSubscription.upsert({
    where: { endpoint: STAGING_SEED_IDS.webhooks.WEBHOOK_002 },
    update: { userAddress: STAGING_SEED_IDS.users.USER_002 },
    create: {
      endpoint: STAGING_SEED_IDS.webhooks.WEBHOOK_002,
      userAddress: STAGING_SEED_IDS.users.USER_002,
    },
  });

  const result: SeedResult = {
    tokens: [
      { id: token001.id, stableIdentifier: token001Address },
      { id: token002.id, stableIdentifier: STAGING_SEED_IDS.tokens.TOKEN_002 },
      { id: token003.id, stableIdentifier: STAGING_SEED_IDS.tokens.TOKEN_003 },
    ],
    users: [
      { id: user001.id, stableIdentifier: STAGING_SEED_IDS.users.USER_001 },
      { id: user002.id, stableIdentifier: STAGING_SEED_IDS.users.USER_002 },
    ],
    burnRecords: [
      { id: burn001.id, stableIdentifier: STAGING_SEED_IDS.burnRecords.TX_001 },
      { id: burn002.id, stableIdentifier: STAGING_SEED_IDS.burnRecords.TX_002 },
      { id: burn003.id, stableIdentifier: STAGING_SEED_IDS.burnRecords.TX_003 },
      { id: burn004.id, stableIdentifier: STAGING_SEED_IDS.burnRecords.TX_004 },
      { id: burn005.id, stableIdentifier: STAGING_SEED_IDS.burnRecords.TX_005 },
      { id: burn006.id, stableIdentifier: STAGING_SEED_IDS.burnRecords.TX_006 },
    ],
    analytics: analyticsRecords.map((a) => ({
      id: a.id,
      tokenId: a.tokenId,
      date: a.date.toISOString().split('T')[0],
    })),
    webhookSubscriptions: [
      { id: webhook001.id, stableIdentifier: STAGING_SEED_IDS.webhooks.WEBHOOK_001 },
      { id: webhook002.id, stableIdentifier: STAGING_SEED_IDS.webhooks.WEBHOOK_002 },
    ],
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  return result;
}

// ---------------------------------------------------------------------------
// Cleanup function
// ---------------------------------------------------------------------------

export async function cleanupStagingSeed(): Promise<CleanupResult> {
  const tokenAddresses = Object.values(STAGING_SEED_IDS.tokens);
  const burnTxHashes = Object.values(STAGING_SEED_IDS.burnRecords);
  const webhookEndpoints = Object.values(STAGING_SEED_IDS.webhooks);
  const userAddresses = Object.values(STAGING_SEED_IDS.users);

  // 1. Find token IDs by stable addresses (needed for Analytics deletion)
  const tokens = await prisma.token.findMany({
    where: { address: { in: tokenAddresses } },
    select: { id: true },
  });
  const tokenIds = tokens.map((t) => t.id);

  // 2. Delete in reverse dependency order to avoid FK violations
  const analyticsResult = await prisma.analytics.deleteMany({
    where: { tokenId: { in: tokenIds } },
  });

  const burnRecordsResult = await prisma.burnRecord.deleteMany({
    where: { txHash: { in: burnTxHashes } },
  });

  const webhooksResult = await prisma.webhookSubscription.deleteMany({
    where: { endpoint: { in: webhookEndpoints } },
  });

  const tokensResult = await prisma.token.deleteMany({
    where: { address: { in: tokenAddresses } },
  });

  const usersResult = await prisma.user.deleteMany({
    where: { address: { in: userAddresses } },
  });

  return {
    analytics: analyticsResult.count,
    burnRecords: burnRecordsResult.count,
    webhookSubscriptions: webhooksResult.count,
    tokens: tokensResult.count,
    users: usersResult.count,
  };
}

// Main entrypoint — only runs when executed directly, not when imported
if (require.main === module) {
  const isCleanup = process.argv.includes('--cleanup');

  if (isCleanup) {
    cleanupStagingSeed()
      .then((result) => {
        process.stdout.write(JSON.stringify(result) + '\n');
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      })
      .finally(() => prisma.$disconnect());
  } else {
    const overrides: SeedOverrides = {};
    if (process.env.TOKEN_001_ADDRESS) {
      overrides.token001Address = process.env.TOKEN_001_ADDRESS;
    }
    runStagingSeed(overrides)
      .catch((err) => {
        console.error(err);
        process.exit(1);
      })
      .finally(() => prisma.$disconnect());
  }
}
