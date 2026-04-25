import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { legacyFixtures, schemaEvolution } from './fixtures/legacySchemas';

/**
 * Schema Evolution and Backward Compatibility Tests
 * 
 * These tests verify that:
 * 1. Old data remains readable after schema upgrades
 * 2. New fields have proper defaults
 * 3. No key collisions occur
 * 4. Data integrity is maintained across versions
 */

describe('Schema Evolution - Token Model', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    // Clean up test data
    await prisma.burnRecord.deleteMany();
    await prisma.analytics.deleteMany();
    await prisma.token.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('V1 to V3 Migration', () => {
    it('should read V1 token data (missing totalBurned, burnCount, metadataUri)', async () => {
      // Insert V1 token (without new fields)
      const v1Token = await prisma.token.create({
        data: {
          id: legacyFixtures.token.v1.id,
          address: legacyFixtures.token.v1.address,
          creator: legacyFixtures.token.v1.creator,
          name: legacyFixtures.token.v1.name,
          symbol: legacyFixtures.token.v1.symbol,
          decimals: legacyFixtures.token.v1.decimals,
          totalSupply: BigInt(legacyFixtures.token.v1.totalSupply),
          initialSupply: BigInt(legacyFixtures.token.v1.initialSupply),
          createdAt: legacyFixtures.token.v1.createdAt,
          updatedAt: legacyFixtures.token.v1.updatedAt,
        },
      });

      // Verify V1 data is readable
      const retrieved = await prisma.token.findUnique({
        where: { id: v1Token.id },
      });

      expect(retrieved).not.toBeNull();
      expect(retrieved?.address).toBe(legacyFixtures.token.v1.address);
      expect(retrieved?.name).toBe(legacyFixtures.token.v1.name);
      
      // Verify new fields have defaults
      expect(retrieved?.totalBurned).toBe(BigInt(0));
      expect(retrieved?.burnCount).toBe(0);
      expect(retrieved?.metadataUri).toBeNull();
    });

    it('should write to V1 token without breaking existing data', async () => {
      // Create V1 token
      const v1Token = await prisma.token.create({
        data: {
          id: legacyFixtures.token.v1.id,
          address: legacyFixtures.token.v1.address,
          creator: legacyFixtures.token.v1.creator,
          name: legacyFixtures.token.v1.name,
          symbol: legacyFixtures.token.v1.symbol,
          decimals: legacyFixtures.token.v1.decimals,
          totalSupply: BigInt(legacyFixtures.token.v1.totalSupply),
          initialSupply: BigInt(legacyFixtures.token.v1.initialSupply),
        },
      });

      // Update with new fields
      const updated = await prisma.token.update({
        where: { id: v1Token.id },
        data: {
          totalBurned: BigInt('50000000000'),
          burnCount: 5,
          metadataUri: 'ipfs://QmNewMetadata',
        },
      });

      // Verify original data intact
      expect(updated.address).toBe(legacyFixtures.token.v1.address);
      expect(updated.name).toBe(legacyFixtures.token.v1.name);
      
      // Verify new fields updated
      expect(updated.totalBurned).toBe(BigInt('50000000000'));
      expect(updated.burnCount).toBe(5);
      expect(updated.metadataUri).toBe('ipfs://QmNewMetadata');
    });

    it('should handle V2 token data (missing metadataUri)', async () => {
      const v2Token = await prisma.token.create({
        data: {
          id: legacyFixtures.token.v2.id,
          address: legacyFixtures.token.v2.address,
          creator: legacyFixtures.token.v2.creator,
          name: legacyFixtures.token.v2.name,
          symbol: legacyFixtures.token.v2.symbol,
          decimals: legacyFixtures.token.v2.decimals,
          totalSupply: BigInt(legacyFixtures.token.v2.totalSupply),
          initialSupply: BigInt(legacyFixtures.token.v2.initialSupply),
          totalBurned: BigInt(legacyFixtures.token.v2.totalBurned),
          burnCount: legacyFixtures.token.v2.burnCount,
        },
      });

      const retrieved = await prisma.token.findUnique({
        where: { id: v2Token.id },
      });

      expect(retrieved?.totalBurned.toString()).toBe(legacyFixtures.token.v2.totalBurned);
      expect(retrieved?.burnCount).toBe(legacyFixtures.token.v2.burnCount);
      expect(retrieved?.metadataUri).toBeNull();
    });
  });

  describe('Field Default Values', () => {
    it('should apply correct defaults for optional fields', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CDEFAULTTEST123456789',
          creator: 'GCREATORDEFAULT123456789',
          name: 'Default Test Token',
          symbol: 'DTT',
          decimals: 7,
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      expect(token.totalBurned).toBe(BigInt(0));
      expect(token.burnCount).toBe(0);
      expect(token.metadataUri).toBeNull();
      expect(token.decimals).toBe(7);
    });

    it('should allow explicit null for optional fields', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CNULLTEST123456789',
          creator: 'GCREATORNULL123456789',
          name: 'Null Test Token',
          symbol: 'NTT',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
          metadataUri: null,
        },
      });

      expect(token.metadataUri).toBeNull();
    });
  });

  describe('No Key Collisions', () => {
    it('should not have conflicts between old and new field names', async () => {
      // Create tokens with all versions of fields
      const tokens = await Promise.all([
        prisma.token.create({
          data: {
            address: 'CTOKEN1',
            creator: 'GCREATOR1',
            name: 'Token 1',
            symbol: 'TK1',
            totalSupply: BigInt('1000000000000'),
            initialSupply: BigInt('1000000000000'),
          },
        }),
        prisma.token.create({
          data: {
            address: 'CTOKEN2',
            creator: 'GCREATOR2',
            name: 'Token 2',
            symbol: 'TK2',
            totalSupply: BigInt('1000000000000'),
            initialSupply: BigInt('1000000000000'),
            totalBurned: BigInt('100000000000'),
            burnCount: 10,
          },
        }),
        prisma.token.create({
          data: {
            address: 'CTOKEN3',
            creator: 'GCREATOR3',
            name: 'Token 3',
            symbol: 'TK3',
            totalSupply: BigInt('1000000000000'),
            initialSupply: BigInt('1000000000000'),
            totalBurned: BigInt('200000000000'),
            burnCount: 20,
            metadataUri: 'ipfs://QmMetadata',
          },
        }),
      ]);

      // Verify all tokens are retrievable and distinct
      const retrieved = await prisma.token.findMany({
        where: {
          address: { in: ['CTOKEN1', 'CTOKEN2', 'CTOKEN3'] },
        },
      });

      expect(retrieved).toHaveLength(3);
      expect(new Set(retrieved.map(t => t.address)).size).toBe(3);
    });
  });
});

describe('Schema Evolution - Stream Model', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await prisma.stream.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('V1 to V3 Migration', () => {
    it('should read V1 stream data (missing metadata, timestamps)', async () => {
      const v1Stream = await prisma.stream.create({
        data: {
          streamId: legacyFixtures.stream.v1.streamId,
          creator: legacyFixtures.stream.v1.creator,
          recipient: legacyFixtures.stream.v1.recipient,
          amount: BigInt(legacyFixtures.stream.v1.amount),
          status: legacyFixtures.stream.v1.status as any,
          txHash: legacyFixtures.stream.v1.txHash,
          createdAt: legacyFixtures.stream.v1.createdAt,
        },
      });

      const retrieved = await prisma.stream.findUnique({
        where: { streamId: v1Stream.streamId },
      });

      expect(retrieved).not.toBeNull();
      expect(retrieved?.metadata).toBeNull();
      expect(retrieved?.claimedAt).toBeNull();
      expect(retrieved?.cancelledAt).toBeNull();
    });

    it('should handle V2 stream data (missing timestamps)', async () => {
      const v2Stream = await prisma.stream.create({
        data: {
          streamId: legacyFixtures.stream.v2.streamId,
          creator: legacyFixtures.stream.v2.creator,
          recipient: legacyFixtures.stream.v2.recipient,
          amount: BigInt(legacyFixtures.stream.v2.amount),
          metadata: legacyFixtures.stream.v2.metadata,
          status: legacyFixtures.stream.v2.status as any,
          txHash: legacyFixtures.stream.v2.txHash,
        },
      });

      const retrieved = await prisma.stream.findUnique({
        where: { streamId: v2Stream.streamId },
      });

      expect(retrieved?.metadata).toBe(legacyFixtures.stream.v2.metadata);
      expect(retrieved?.claimedAt).toBeNull();
      expect(retrieved?.cancelledAt).toBeNull();
    });

    it('should update V1 stream with new fields', async () => {
      const v1Stream = await prisma.stream.create({
        data: {
          streamId: 100,
          creator: 'GCREATOR100',
          recipient: 'GRECIPIENT100',
          amount: BigInt('1000000000000'),
          status: 'CREATED',
          txHash: 'tx-stream-100',
        },
      });

      const updated = await prisma.stream.update({
        where: { streamId: v1Stream.streamId },
        data: {
          status: 'CLAIMED',
          claimedAt: new Date(),
        },
      });

      expect(updated.status).toBe('CLAIMED');
      expect(updated.claimedAt).not.toBeNull();
      expect(updated.creator).toBe('GCREATOR100');
    });
  });

  describe('Status Transitions', () => {
    it('should handle all status values across versions', async () => {
      const statuses = ['CREATED', 'CLAIMED', 'CANCELLED'];

      for (const status of statuses) {
        const stream = await prisma.stream.create({
          data: {
            streamId: Math.floor(Math.random() * 1000000),
            creator: `GCREATOR${status}`,
            recipient: `GRECIPIENT${status}`,
            amount: BigInt('1000000000000'),
            status: status as any,
            txHash: `tx-${status}-${Date.now()}`,
          },
        });

        expect(stream.status).toBe(status);
      }
    });
  });
});

describe('Schema Evolution - Governance Models', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await prisma.proposalExecution.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.proposal.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('Proposal V1 to V3 Migration', () => {
    it('should read V1 proposal data (missing description, metadata, timestamps)', async () => {
      const v1Proposal = await prisma.proposal.create({
        data: {
          proposalId: legacyFixtures.proposal.v1.proposalId,
          tokenId: legacyFixtures.proposal.v1.tokenId,
          proposer: legacyFixtures.proposal.v1.proposer,
          title: legacyFixtures.proposal.v1.title,
          proposalType: legacyFixtures.proposal.v1.proposalType as any,
          status: legacyFixtures.proposal.v1.status as any,
          startTime: legacyFixtures.proposal.v1.startTime,
          endTime: legacyFixtures.proposal.v1.endTime,
          quorum: BigInt(legacyFixtures.proposal.v1.quorum),
          threshold: BigInt(legacyFixtures.proposal.v1.threshold),
          txHash: legacyFixtures.proposal.v1.txHash,
        },
      });

      const retrieved = await prisma.proposal.findUnique({
        where: { proposalId: v1Proposal.proposalId },
      });

      expect(retrieved).not.toBeNull();
      expect(retrieved?.description).toBeNull();
      expect(retrieved?.metadata).toBeNull();
      expect(retrieved?.executedAt).toBeNull();
      expect(retrieved?.cancelledAt).toBeNull();
    });

    it('should handle V2 proposal data (missing timestamps)', async () => {
      const v2Proposal = await prisma.proposal.create({
        data: {
          proposalId: legacyFixtures.proposal.v2.proposalId,
          tokenId: legacyFixtures.proposal.v2.tokenId,
          proposer: legacyFixtures.proposal.v2.proposer,
          title: legacyFixtures.proposal.v2.title,
          description: legacyFixtures.proposal.v2.description,
          proposalType: legacyFixtures.proposal.v2.proposalType as any,
          status: legacyFixtures.proposal.v2.status as any,
          startTime: legacyFixtures.proposal.v2.startTime,
          endTime: legacyFixtures.proposal.v2.endTime,
          quorum: BigInt(legacyFixtures.proposal.v2.quorum),
          threshold: BigInt(legacyFixtures.proposal.v2.threshold),
          metadata: legacyFixtures.proposal.v2.metadata,
          txHash: legacyFixtures.proposal.v2.txHash,
        },
      });

      const retrieved = await prisma.proposal.findUnique({
        where: { proposalId: v2Proposal.proposalId },
      });

      expect(retrieved?.description).toBe(legacyFixtures.proposal.v2.description);
      expect(retrieved?.metadata).toBe(legacyFixtures.proposal.v2.metadata);
      expect(retrieved?.executedAt).toBeNull();
      expect(retrieved?.cancelledAt).toBeNull();
    });
  });

  describe('Vote V1 to V2 Migration', () => {
    it('should read V1 vote data (missing reason)', async () => {
      // Create proposal first
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 1000,
          tokenId: 'CTOKEN1000',
          proposer: 'GPROPOSER1000',
          title: 'Test Proposal',
          proposalType: 'PARAMETER_CHANGE',
          status: 'ACTIVE',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-1000',
        },
      });

      const v1Vote = await prisma.vote.create({
        data: {
          proposalId: proposal.id,
          voter: legacyFixtures.vote.v1.voter,
          support: legacyFixtures.vote.v1.support,
          weight: BigInt(legacyFixtures.vote.v1.weight),
          txHash: legacyFixtures.vote.v1.txHash,
          timestamp: legacyFixtures.vote.v1.timestamp,
        },
      });

      const retrieved = await prisma.vote.findUnique({
        where: { txHash: v1Vote.txHash },
      });

      expect(retrieved).not.toBeNull();
      expect(retrieved?.reason).toBeNull();
      expect(retrieved?.support).toBe(true);
    });
  });

  describe('Proposal Type and Status Evolution', () => {
    it('should handle all proposal types', async () => {
      const types = [
        'PARAMETER_CHANGE',
        'ADMIN_TRANSFER',
        'TREASURY_SPEND',
        'CONTRACT_UPGRADE',
        'CUSTOM',
      ];

      for (const type of types) {
        const proposal = await prisma.proposal.create({
          data: {
            proposalId: Math.floor(Math.random() * 1000000),
            tokenId: `CTOKEN${type}`,
            proposer: `GPROPOSER${type}`,
            title: `${type} Proposal`,
            proposalType: type as any,
            status: 'ACTIVE',
            startTime: new Date(),
            endTime: new Date(Date.now() + 86400000),
            quorum: BigInt('1000000000000'),
            threshold: BigInt('500000000000'),
            txHash: `tx-${type}-${Date.now()}`,
          },
        });

        expect(proposal.proposalType).toBe(type);
      }
    });

    it('should handle all proposal statuses', async () => {
      const statuses = [
        'ACTIVE',
        'PASSED',
        'REJECTED',
        'EXECUTED',
        'CANCELLED',
        'EXPIRED',
      ];

      for (const status of statuses) {
        const proposal = await prisma.proposal.create({
          data: {
            proposalId: Math.floor(Math.random() * 1000000),
            tokenId: `CTOKEN${status}`,
            proposer: `GPROPOSER${status}`,
            title: `${status} Proposal`,
            proposalType: 'PARAMETER_CHANGE',
            status: status as any,
            startTime: new Date(),
            endTime: new Date(Date.now() + 86400000),
            quorum: BigInt('1000000000000'),
            threshold: BigInt('500000000000'),
            txHash: `tx-${status}-${Date.now()}`,
          },
        });

        expect(proposal.status).toBe(status);
      }
    });
  });
});

describe('Schema Evolution - BurnRecord Model', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await prisma.burnRecord.deleteMany();
    await prisma.analytics.deleteMany();
    await prisma.token.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('should read V1 burn record (missing isAdminBurn)', async () => {
    // Create token first
    const token = await prisma.token.create({
      data: {
        address: 'CTOKENBURN123',
        creator: 'GCREATORBURN123',
        name: 'Burn Test Token',
        symbol: 'BTT',
        totalSupply: BigInt('1000000000000'),
        initialSupply: BigInt('1000000000000'),
      },
    });

    const v1Burn = await prisma.burnRecord.create({
      data: {
        tokenId: token.id,
        from: legacyFixtures.burnRecord.v1.from,
        amount: BigInt(legacyFixtures.burnRecord.v1.amount),
        burnedBy: legacyFixtures.burnRecord.v1.burnedBy,
        txHash: legacyFixtures.burnRecord.v1.txHash,
        timestamp: legacyFixtures.burnRecord.v1.timestamp,
      },
    });

    const retrieved = await prisma.burnRecord.findUnique({
      where: { txHash: v1Burn.txHash },
    });

    expect(retrieved).not.toBeNull();
    expect(retrieved?.isAdminBurn).toBe(false); // Default value
  });

  it('should handle V2 burn record (with isAdminBurn)', async () => {
    const token = await prisma.token.create({
      data: {
        address: 'CTOKENBURN456',
        creator: 'GCREATORBURN456',
        name: 'Burn Test Token 2',
        symbol: 'BTT2',
        totalSupply: BigInt('1000000000000'),
        initialSupply: BigInt('1000000000000'),
      },
    });

    const v2Burn = await prisma.burnRecord.create({
      data: {
        tokenId: token.id,
        from: legacyFixtures.burnRecord.v2.from,
        amount: BigInt(legacyFixtures.burnRecord.v2.amount),
        burnedBy: legacyFixtures.burnRecord.v2.burnedBy,
        isAdminBurn: legacyFixtures.burnRecord.v2.isAdminBurn,
        txHash: legacyFixtures.burnRecord.v2.txHash,
        timestamp: legacyFixtures.burnRecord.v2.timestamp,
      },
    });

    const retrieved = await prisma.burnRecord.findUnique({
      where: { txHash: v2Burn.txHash },
    });

    expect(retrieved?.isAdminBurn).toBe(true);
  });
});

describe('Cross-Version Data Integrity', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await prisma.burnRecord.deleteMany();
    await prisma.analytics.deleteMany();
    await prisma.token.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('should maintain referential integrity across schema versions', async () => {
    // Create V1 token
    const token = await prisma.token.create({
      data: {
        address: 'CTOKENINTEGRITY',
        creator: 'GCREATORINTEGRITY',
        name: 'Integrity Test Token',
        symbol: 'ITT',
        totalSupply: BigInt('1000000000000'),
        initialSupply: BigInt('1000000000000'),
      },
    });

    // Add V1 burn record
    const burn = await prisma.burnRecord.create({
      data: {
        tokenId: token.id,
        from: 'GBURNER123',
        amount: BigInt('10000000000'),
        burnedBy: 'GBURNER123',
        txHash: 'tx-integrity-burn',
        timestamp: new Date(),
      },
    });

    // Upgrade token to V3
    const upgradedToken = await prisma.token.update({
      where: { id: token.id },
      data: {
        totalBurned: BigInt('10000000000'),
        burnCount: 1,
        metadataUri: 'ipfs://QmIntegrity',
      },
    });

    // Verify relationship intact
    const tokenWithBurns = await prisma.token.findUnique({
      where: { id: token.id },
      include: { burnRecords: true },
    });

    expect(tokenWithBurns?.burnRecords).toHaveLength(1);
    expect(tokenWithBurns?.burnRecords[0].txHash).toBe('tx-integrity-burn');
    expect(tokenWithBurns?.metadataUri).toBe('ipfs://QmIntegrity');
  });
});
