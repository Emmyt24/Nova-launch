import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Field Defaults Regression Tests
 * 
 * These tests verify that:
 * 1. Optional fields have correct default values
 * 2. New fields don't break existing functionality
 * 3. Null handling is consistent
 * 4. Default values are applied correctly
 */

describe('Field Defaults Regression - Token Model', () => {
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

  describe('totalBurned Field', () => {
    it('should default to 0 when not provided', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CDEFAULT1',
          creator: 'GCREATOR1',
          name: 'Default Test 1',
          symbol: 'DT1',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      expect(token.totalBurned).toBe(BigInt(0));
    });

    it('should accept explicit 0 value', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CEXPLICIT1',
          creator: 'GCREATOR2',
          name: 'Explicit Test 1',
          symbol: 'ET1',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
          totalBurned: BigInt(0),
        },
      });

      expect(token.totalBurned).toBe(BigInt(0));
    });

    it('should accept non-zero values', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CNONZERO1',
          creator: 'GCREATOR3',
          name: 'Non-Zero Test 1',
          symbol: 'NZ1',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
          totalBurned: BigInt('500000000000'),
        },
      });

      expect(token.totalBurned.toString()).toBe('500000000000');
    });

    it('should maintain default after update without totalBurned', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CUPDATE1',
          creator: 'GCREATOR4',
          name: 'Update Test 1',
          symbol: 'UT1',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      const updated = await prisma.token.update({
        where: { id: token.id },
        data: { name: 'Updated Name' },
      });

      expect(updated.totalBurned).toBe(BigInt(0));
    });
  });

  describe('burnCount Field', () => {
    it('should default to 0 when not provided', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CDEFAULT2',
          creator: 'GCREATOR5',
          name: 'Default Test 2',
          symbol: 'DT2',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      expect(token.burnCount).toBe(0);
    });

    it('should increment correctly from default', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CINCREMENT1',
          creator: 'GCREATOR6',
          name: 'Increment Test 1',
          symbol: 'IT1',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      expect(token.burnCount).toBe(0);

      const updated = await prisma.token.update({
        where: { id: token.id },
        data: { burnCount: { increment: 1 } },
      });

      expect(updated.burnCount).toBe(1);
    });
  });

  describe('metadataUri Field', () => {
    it('should default to null when not provided', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CDEFAULT3',
          creator: 'GCREATOR7',
          name: 'Default Test 3',
          symbol: 'DT3',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      expect(token.metadataUri).toBeNull();
    });

    it('should accept explicit null', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CNULL1',
          creator: 'GCREATOR8',
          name: 'Null Test 1',
          symbol: 'NT1',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
          metadataUri: null,
        },
      });

      expect(token.metadataUri).toBeNull();
    });

    it('should accept string values', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CSTRING1',
          creator: 'GCREATOR9',
          name: 'String Test 1',
          symbol: 'ST1',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
          metadataUri: 'ipfs://QmTest123',
        },
      });

      expect(token.metadataUri).toBe('ipfs://QmTest123');
    });

    it('should allow null to string transition', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CTRANSITION1',
          creator: 'GCREATOR10',
          name: 'Transition Test 1',
          symbol: 'TT1',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      expect(token.metadataUri).toBeNull();

      const updated = await prisma.token.update({
        where: { id: token.id },
        data: { metadataUri: 'ipfs://QmTransition' },
      });

      expect(updated.metadataUri).toBe('ipfs://QmTransition');
    });

    it('should allow string to null transition', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CTRANSITION2',
          creator: 'GCREATOR11',
          name: 'Transition Test 2',
          symbol: 'TT2',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
          metadataUri: 'ipfs://QmInitial',
        },
      });

      expect(token.metadataUri).toBe('ipfs://QmInitial');

      const updated = await prisma.token.update({
        where: { id: token.id },
        data: { metadataUri: null },
      });

      expect(updated.metadataUri).toBeNull();
    });
  });

  describe('decimals Field', () => {
    it('should default to 18 when not provided', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CDEFAULT4',
          creator: 'GCREATOR12',
          name: 'Default Test 4',
          symbol: 'DT4',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      expect(token.decimals).toBe(18);
    });

    it('should accept custom decimal values', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CCUSTOM1',
          creator: 'GCREATOR13',
          name: 'Custom Test 1',
          symbol: 'CT1',
          decimals: 7,
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      expect(token.decimals).toBe(7);
    });
  });
});

describe('Field Defaults Regression - Stream Model', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await prisma.stream.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('metadata Field', () => {
    it('should default to null when not provided', async () => {
      const stream = await prisma.stream.create({
        data: {
          streamId: 1,
          creator: 'GCREATOR1',
          recipient: 'GRECIPIENT1',
          amount: BigInt('1000000000000'),
          status: 'CREATED',
          txHash: 'tx-stream-1',
        },
      });

      expect(stream.metadata).toBeNull();
    });

    it('should accept JSON string', async () => {
      const metadata = JSON.stringify({ purpose: 'payment' });
      const stream = await prisma.stream.create({
        data: {
          streamId: 2,
          creator: 'GCREATOR2',
          recipient: 'GRECIPIENT2',
          amount: BigInt('1000000000000'),
          metadata,
          status: 'CREATED',
          txHash: 'tx-stream-2',
        },
      });

      expect(stream.metadata).toBe(metadata);
    });
  });

  describe('status Field', () => {
    it('should default to CREATED when not provided', async () => {
      const stream = await prisma.stream.create({
        data: {
          streamId: 3,
          creator: 'GCREATOR3',
          recipient: 'GRECIPIENT3',
          amount: BigInt('1000000000000'),
          txHash: 'tx-stream-3',
        },
      });

      expect(stream.status).toBe('CREATED');
    });

    it('should accept all valid status values', async () => {
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

  describe('Timestamp Fields', () => {
    it('should default claimedAt to null', async () => {
      const stream = await prisma.stream.create({
        data: {
          streamId: 4,
          creator: 'GCREATOR4',
          recipient: 'GRECIPIENT4',
          amount: BigInt('1000000000000'),
          status: 'CREATED',
          txHash: 'tx-stream-4',
        },
      });

      expect(stream.claimedAt).toBeNull();
    });

    it('should default cancelledAt to null', async () => {
      const stream = await prisma.stream.create({
        data: {
          streamId: 5,
          creator: 'GCREATOR5',
          recipient: 'GRECIPIENT5',
          amount: BigInt('1000000000000'),
          status: 'CREATED',
          txHash: 'tx-stream-5',
        },
      });

      expect(stream.cancelledAt).toBeNull();
    });

    it('should accept explicit timestamp values', async () => {
      const claimTime = new Date();
      const stream = await prisma.stream.create({
        data: {
          streamId: 6,
          creator: 'GCREATOR6',
          recipient: 'GRECIPIENT6',
          amount: BigInt('1000000000000'),
          status: 'CLAIMED',
          txHash: 'tx-stream-6',
          claimedAt: claimTime,
        },
      });

      expect(stream.claimedAt).toEqual(claimTime);
    });
  });
});

describe('Field Defaults Regression - Governance Models', () => {
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

  describe('Proposal Optional Fields', () => {
    it('should default description to null', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 1,
          tokenId: 'CTOKEN1',
          proposer: 'GPROPOSER1',
          title: 'Test Proposal',
          proposalType: 'PARAMETER_CHANGE',
          status: 'ACTIVE',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-1',
        },
      });

      expect(proposal.description).toBeNull();
    });

    it('should default metadata to null', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 2,
          tokenId: 'CTOKEN2',
          proposer: 'GPROPOSER2',
          title: 'Test Proposal 2',
          proposalType: 'PARAMETER_CHANGE',
          status: 'ACTIVE',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-2',
        },
      });

      expect(proposal.metadata).toBeNull();
    });

    it('should default executedAt to null', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 3,
          tokenId: 'CTOKEN3',
          proposer: 'GPROPOSER3',
          title: 'Test Proposal 3',
          proposalType: 'PARAMETER_CHANGE',
          status: 'ACTIVE',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-3',
        },
      });

      expect(proposal.executedAt).toBeNull();
    });

    it('should default cancelledAt to null', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 4,
          tokenId: 'CTOKEN4',
          proposer: 'GPROPOSER4',
          title: 'Test Proposal 4',
          proposalType: 'PARAMETER_CHANGE',
          status: 'ACTIVE',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-4',
        },
      });

      expect(proposal.cancelledAt).toBeNull();
    });

    it('should default status to ACTIVE', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 5,
          tokenId: 'CTOKEN5',
          proposer: 'GPROPOSER5',
          title: 'Test Proposal 5',
          proposalType: 'PARAMETER_CHANGE',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-5',
        },
      });

      expect(proposal.status).toBe('ACTIVE');
    });
  });

  describe('Vote Optional Fields', () => {
    it('should default reason to null', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 100,
          tokenId: 'CTOKEN100',
          proposer: 'GPROPOSER100',
          title: 'Test Proposal',
          proposalType: 'PARAMETER_CHANGE',
          status: 'ACTIVE',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-100',
        },
      });

      const vote = await prisma.vote.create({
        data: {
          proposalId: proposal.id,
          voter: 'GVOTER1',
          support: true,
          weight: BigInt('250000000000'),
          txHash: 'tx-vote-1',
          timestamp: new Date(),
        },
      });

      expect(vote.reason).toBeNull();
    });

    it('should accept reason string', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 101,
          tokenId: 'CTOKEN101',
          proposer: 'GPROPOSER101',
          title: 'Test Proposal',
          proposalType: 'PARAMETER_CHANGE',
          status: 'ACTIVE',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-101',
        },
      });

      const vote = await prisma.vote.create({
        data: {
          proposalId: proposal.id,
          voter: 'GVOTER2',
          support: true,
          weight: BigInt('250000000000'),
          reason: 'I support this proposal',
          txHash: 'tx-vote-2',
          timestamp: new Date(),
        },
      });

      expect(vote.reason).toBe('I support this proposal');
    });
  });

  describe('ProposalExecution Optional Fields', () => {
    it('should default returnData to null', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 200,
          tokenId: 'CTOKEN200',
          proposer: 'GPROPOSER200',
          title: 'Test Proposal',
          proposalType: 'PARAMETER_CHANGE',
          status: 'PASSED',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-200',
        },
      });

      const execution = await prisma.proposalExecution.create({
        data: {
          proposalId: proposal.id,
          executor: 'GEXECUTOR1',
          success: true,
          txHash: 'tx-execution-1',
        },
      });

      expect(execution.returnData).toBeNull();
    });

    it('should default gasUsed to null', async () => {
      const proposal = await prisma.proposal.create({
        data: {
          proposalId: 201,
          tokenId: 'CTOKEN201',
          proposer: 'GPROPOSER201',
          title: 'Test Proposal',
          proposalType: 'PARAMETER_CHANGE',
          status: 'PASSED',
          startTime: new Date(),
          endTime: new Date(Date.now() + 86400000),
          quorum: BigInt('1000000000000'),
          threshold: BigInt('500000000000'),
          txHash: 'tx-proposal-201',
        },
      });

      const execution = await prisma.proposalExecution.create({
        data: {
          proposalId: proposal.id,
          executor: 'GEXECUTOR2',
          success: true,
          txHash: 'tx-execution-2',
        },
      });

      expect(execution.gasUsed).toBeNull();
    });
  });
});

describe('Field Defaults Regression - BurnRecord Model', () => {
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

  describe('isAdminBurn Field', () => {
    it('should default to false when not provided', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CTOKENBURN1',
          creator: 'GCREATORBURN1',
          name: 'Burn Test Token',
          symbol: 'BTT',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      const burn = await prisma.burnRecord.create({
        data: {
          tokenId: token.id,
          from: 'GBURNER1',
          amount: BigInt('10000000000'),
          burnedBy: 'GBURNER1',
          txHash: 'tx-burn-1',
          timestamp: new Date(),
        },
      });

      expect(burn.isAdminBurn).toBe(false);
    });

    it('should accept explicit false', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CTOKENBURN2',
          creator: 'GCREATORBURN2',
          name: 'Burn Test Token 2',
          symbol: 'BTT2',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      const burn = await prisma.burnRecord.create({
        data: {
          tokenId: token.id,
          from: 'GBURNER2',
          amount: BigInt('10000000000'),
          burnedBy: 'GBURNER2',
          isAdminBurn: false,
          txHash: 'tx-burn-2',
          timestamp: new Date(),
        },
      });

      expect(burn.isAdminBurn).toBe(false);
    });

    it('should accept explicit true', async () => {
      const token = await prisma.token.create({
        data: {
          address: 'CTOKENBURN3',
          creator: 'GCREATORBURN3',
          name: 'Burn Test Token 3',
          symbol: 'BTT3',
          totalSupply: BigInt('1000000000000'),
          initialSupply: BigInt('1000000000000'),
        },
      });

      const burn = await prisma.burnRecord.create({
        data: {
          tokenId: token.id,
          from: 'GBURNER3',
          amount: BigInt('10000000000'),
          burnedBy: 'GADMIN1',
          isAdminBurn: true,
          txHash: 'tx-burn-3',
          timestamp: new Date(),
        },
      });

      expect(burn.isAdminBurn).toBe(true);
    });
  });
});
