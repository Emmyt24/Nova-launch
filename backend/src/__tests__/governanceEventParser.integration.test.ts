import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, ProposalStatus, ProposalType } from '@prisma/client';
import { GovernanceEventParser } from '../services/governanceEventParser';
import { GovernanceEventMapper } from '../services/governanceEventMapper';
import {
  proposalCreatedEvent,
  voteCastEventFor,
  voteCastEventAgainst,
  proposalExecutedEvent,
  proposalCancelledEvent,
  proposalStatusChangedEvent,
  adminTransferProposal,
  treasurySpendProposal,
} from './fixtures/governanceEvents';

describe('Governance Event Parser Integration Tests', () => {
  let prisma: PrismaClient;
  let parser: GovernanceEventParser;
  let mapper: GovernanceEventMapper;

  beforeEach(async () => {
    prisma = new PrismaClient();
    parser = new GovernanceEventParser(prisma);
    mapper = new GovernanceEventMapper();

    // Clean up test data
    await prisma.proposalExecution.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.proposal.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('Proposal Created Event', () => {
    it('should parse and persist proposal created event', async () => {
      const governanceEvent = mapper.mapEvent(proposalCreatedEvent);
      expect(governanceEvent).not.toBeNull();

      await parser.parseEvent(governanceEvent!);

      const proposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
      });

      expect(proposal).not.toBeNull();
      expect(proposal?.proposer).toBe('GPROPOSER123456789');
      expect(proposal?.title).toBe('Increase Burn Fee');
      expect(proposal?.proposalType).toBe(ProposalType.PARAMETER_CHANGE);
      expect(proposal?.status).toBe(ProposalStatus.ACTIVE);
      expect(proposal?.txHash).toBe('tx-prop-create-1');
    });

    it('should handle admin transfer proposal type', async () => {
      const governanceEvent = mapper.mapEvent(adminTransferProposal);
      await parser.parseEvent(governanceEvent!);

      const proposal = await prisma.proposal.findUnique({
        where: { proposalId: 3 },
      });

      expect(proposal?.proposalType).toBe(ProposalType.ADMIN_TRANSFER);
      expect(proposal?.title).toBe('Transfer Admin Rights');
    });

    it('should handle treasury spend proposal type', async () => {
      const governanceEvent = mapper.mapEvent(treasurySpendProposal);
      await parser.parseEvent(governanceEvent!);

      const proposal = await prisma.proposal.findUnique({
        where: { proposalId: 4 },
      });

      expect(proposal?.proposalType).toBe(ProposalType.TREASURY_SPEND);
      expect(proposal?.title).toBe('Marketing Budget Allocation');
    });
  });

  describe('Vote Cast Event', () => {
    beforeEach(async () => {
      // Create proposal first
      const proposalEvent = mapper.mapEvent(proposalCreatedEvent);
      await parser.parseEvent(proposalEvent!);
    });

    it('should parse and persist vote for event', async () => {
      const voteEvent = mapper.mapEvent(voteCastEventFor);
      await parser.parseEvent(voteEvent!);

      const votes = await prisma.vote.findMany({
        where: { voter: 'GVOTER1123456789' },
      });

      expect(votes).toHaveLength(1);
      expect(votes[0].support).toBe(true);
      expect(votes[0].weight.toString()).toBe('250000000000');
      expect(votes[0].reason).toBe('I support this proposal for better tokenomics');
    });

    it('should parse and persist vote against event', async () => {
      const voteEvent = mapper.mapEvent(voteCastEventAgainst);
      await parser.parseEvent(voteEvent!);

      const votes = await prisma.vote.findMany({
        where: { voter: 'GVOTER2123456789' },
      });

      expect(votes).toHaveLength(1);
      expect(votes[0].support).toBe(false);
      expect(votes[0].weight.toString()).toBe('100000000000');
    });

    it('should handle multiple votes on same proposal', async () => {
      const voteFor = mapper.mapEvent(voteCastEventFor);
      const voteAgainst = mapper.mapEvent(voteCastEventAgainst);

      await parser.parseEvent(voteFor!);
      await parser.parseEvent(voteAgainst!);

      const proposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
        include: { votes: true },
      });

      expect(proposal?.votes).toHaveLength(2);
    });
  });

  describe('Proposal Executed Event', () => {
    beforeEach(async () => {
      const proposalEvent = mapper.mapEvent(proposalCreatedEvent);
      await parser.parseEvent(proposalEvent!);
    });

    it('should parse and persist proposal execution', async () => {
      const execEvent = mapper.mapEvent(proposalExecutedEvent);
      await parser.parseEvent(execEvent!);

      const execution = await prisma.proposalExecution.findUnique({
        where: { txHash: 'tx-prop-exec-1' },
      });

      expect(execution).not.toBeNull();
      expect(execution?.executor).toBe('GEXECUTOR123456789');
      expect(execution?.success).toBe(true);
      expect(execution?.gasUsed?.toString()).toBe('50000');
    });

    it('should update proposal status to EXECUTED', async () => {
      const execEvent = mapper.mapEvent(proposalExecutedEvent);
      await parser.parseEvent(execEvent!);

      const proposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
      });

      expect(proposal?.status).toBe(ProposalStatus.EXECUTED);
      expect(proposal?.executedAt).not.toBeNull();
    });
  });

  describe('Proposal Cancelled Event', () => {
    beforeEach(async () => {
      // Create a different proposal for cancellation
      const cancelProposal = {
        ...proposalCreatedEvent,
        value: { ...proposalCreatedEvent.value, proposal_id: 2 },
        transaction_hash: 'tx-prop-create-cancel',
      };
      const proposalEvent = mapper.mapEvent(cancelProposal);
      await parser.parseEvent(proposalEvent!);
    });

    it('should parse and persist proposal cancellation', async () => {
      const cancelEvent = mapper.mapEvent(proposalCancelledEvent);
      await parser.parseEvent(cancelEvent!);

      const proposal = await prisma.proposal.findUnique({
        where: { proposalId: 2 },
      });

      expect(proposal?.status).toBe(ProposalStatus.CANCELLED);
      expect(proposal?.cancelledAt).not.toBeNull();
    });
  });

  describe('Proposal Status Changed Event', () => {
    beforeEach(async () => {
      const proposalEvent = mapper.mapEvent(proposalCreatedEvent);
      await parser.parseEvent(proposalEvent!);
    });

    it('should update proposal status', async () => {
      const statusEvent = mapper.mapEvent(proposalStatusChangedEvent);
      await parser.parseEvent(statusEvent!);

      const proposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
      });

      expect(proposal?.status).toBe(ProposalStatus.PASSED);
    });
  });

  describe('Proposal Analytics', () => {
    beforeEach(async () => {
      const proposalEvent = mapper.mapEvent(proposalCreatedEvent);
      await parser.parseEvent(proposalEvent!);

      const voteFor = mapper.mapEvent(voteCastEventFor);
      const voteAgainst = mapper.mapEvent(voteCastEventAgainst);

      await parser.parseEvent(voteFor!);
      await parser.parseEvent(voteAgainst!);
    });

    it('should calculate proposal analytics correctly', async () => {
      const analytics = await parser.getProposalAnalytics(1);

      expect(analytics.proposalId).toBe(1);
      expect(analytics.totalVotes).toBe(2);
      expect(analytics.votesFor).toBe('250000000000');
      expect(analytics.votesAgainst).toBe('100000000000');
      expect(analytics.uniqueVoters).toBe(2);
      expect(analytics.participationRate).toBeGreaterThan(0);
    });
  });

  describe('Governance Statistics', () => {
    beforeEach(async () => {
      // Create multiple proposals
      const proposal1 = mapper.mapEvent(proposalCreatedEvent);
      const proposal2 = mapper.mapEvent(adminTransferProposal);
      const proposal3 = mapper.mapEvent(treasurySpendProposal);

      await parser.parseEvent(proposal1!);
      await parser.parseEvent(proposal2!);
      await parser.parseEvent(proposal3!);

      // Add votes
      const vote1 = mapper.mapEvent(voteCastEventFor);
      const vote2 = mapper.mapEvent(voteCastEventAgainst);

      await parser.parseEvent(vote1!);
      await parser.parseEvent(vote2!);
    });

    it('should calculate governance stats correctly', async () => {
      const stats = await parser.getGovernanceStats();

      expect(stats.totalProposals).toBe(3);
      expect(stats.activeProposals).toBeGreaterThanOrEqual(0);
      expect(stats.totalVotes).toBe(2);
      expect(stats.uniqueVoters).toBe(2);
      expect(stats.proposalsByType).toHaveProperty(ProposalType.PARAMETER_CHANGE);
      expect(stats.proposalsByType).toHaveProperty(ProposalType.ADMIN_TRANSFER);
      expect(stats.proposalsByType).toHaveProperty(ProposalType.TREASURY_SPEND);
    });
  });

  describe('Event Mapping', () => {
    it('should correctly identify governance events', () => {
      expect(mapper.isGovernanceEvent(proposalCreatedEvent)).toBe(true);
      expect(mapper.isGovernanceEvent(voteCastEventFor)).toBe(true);
      expect(mapper.isGovernanceEvent(proposalExecutedEvent)).toBe(true);
    });

    it('should map all governance event types', () => {
      const events = [
        proposalCreatedEvent,
        voteCastEventFor,
        proposalExecutedEvent,
        proposalCancelledEvent,
        proposalStatusChangedEvent,
      ];

      const mappedEvents = mapper.mapEvents(events);
      expect(mappedEvents).toHaveLength(5);
      expect(mappedEvents[0].type).toBe('proposal_created');
      expect(mappedEvents[1].type).toBe('vote_cast');
      expect(mappedEvents[2].type).toBe('proposal_executed');
      expect(mappedEvents[3].type).toBe('proposal_cancelled');
      expect(mappedEvents[4].type).toBe('proposal_status_changed');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent proposal when voting', async () => {
      const voteEvent = mapper.mapEvent(voteCastEventFor);

      await expect(parser.parseEvent(voteEvent!)).rejects.toThrow('Proposal 1 not found');
    });

    it('should throw error for non-existent proposal when executing', async () => {
      const execEvent = mapper.mapEvent(proposalExecutedEvent);

      await expect(parser.parseEvent(execEvent!)).rejects.toThrow('Proposal 1 not found');
    });
  });

  describe('Full Event Flow', () => {
    it('should handle complete proposal lifecycle', async () => {
      // 1. Create proposal
      const createEvent = mapper.mapEvent(proposalCreatedEvent);
      await parser.parseEvent(createEvent!);

      let proposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
      });
      expect(proposal?.status).toBe(ProposalStatus.ACTIVE);

      // 2. Cast votes
      const voteFor = mapper.mapEvent(voteCastEventFor);
      const voteAgainst = mapper.mapEvent(voteCastEventAgainst);
      await parser.parseEvent(voteFor!);
      await parser.parseEvent(voteAgainst!);

      const votes = await prisma.vote.count({
        where: { proposalId: proposal!.id },
      });
      expect(votes).toBe(2);

      // 3. Change status to PASSED
      const statusEvent = mapper.mapEvent(proposalStatusChangedEvent);
      await parser.parseEvent(statusEvent!);

      proposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
      });
      expect(proposal?.status).toBe(ProposalStatus.PASSED);

      // 4. Execute proposal
      const execEvent = mapper.mapEvent(proposalExecutedEvent);
      await parser.parseEvent(execEvent!);

      proposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
        include: { executions: true },
      });
      expect(proposal?.status).toBe(ProposalStatus.EXECUTED);
      expect(proposal?.executions).toHaveLength(1);
    });
  });
});
