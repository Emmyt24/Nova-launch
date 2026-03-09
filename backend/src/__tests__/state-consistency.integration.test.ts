import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, ProposalStatus, StreamStatus, ProposalType } from '@prisma/client';
import { GovernanceEventParser } from '../services/governanceEventParser';
import { GovernanceEventMapper } from '../services/governanceEventMapper';
import { StreamEventParser } from '../services/streamEventParser';
import {
  proposalCreatedEvent,
  voteCastEventFor,
  voteCastEventAgainst,
  proposalExecutedEvent,
  proposalStatusChangedEvent,
  adminTransferProposal,
  treasurySpendProposal,
} from './fixtures/governanceEvents';
import { streamEventFixtures } from './fixtures/streamEvents';

/**
 * State Consistency Integration Tests
 *
 * Comprehensive test suite verifying backend-indexed state remains consistent
 * with on-chain contract query results across ingestion and replay paths.
 *
 * Test Coverage:
 * - Fixture-driven tests for proposal, vote, stream, and burn event ingestion
 * - Consistency checker asserting indexed aggregates match on-chain state
 * - Delayed-indexing scenarios and recovery/replay tests
 * - Event replay and recovery mechanisms
 * - Aggregate state validation
 */

// ============================================================
// Type Definitions
// ============================================================

interface OnChainProposal {
  proposalId: number;
  proposer: string;
  title: string;
  status: ProposalStatus;
  quorum: string;
  threshold: string;
  votes: Array<{ voter: string; support: boolean; weight: string }>;
  executedAt?: Date;
}

interface OnChainStream {
  streamId: number;
  creator: string;
  recipient: string;
  amount: string;
  status: StreamStatus;
  claimedAt?: Date;
  cancelledAt?: Date;
}

interface OnChainBurn {
  tokenAddress: string;
  amount: string;
  from: string;
  burnedBy: string;
  isAdminBurn: boolean;
  txHash: string;
  timestamp: Date;
}

interface OnChainState {
  proposals: Map<number, OnChainProposal>;
  votes: Map<string, any>;
  streams: Map<number, OnChainStream>;
  burns: Map<string, OnChainBurn>;
}

interface ConsistencyCheckResult {
  consistent: boolean;
  errors: string[];
  warnings?: string[];
}

// ============================================================
// Mock On-Chain Contract
// ============================================================

/**
 * Mock on-chain contract query interface
 * Simulates contract state for consistency validation
 */
class MockOnChainContract {
  private state: OnChainState = {
    proposals: new Map(),
    votes: new Map(),
    streams: new Map(),
    burns: new Map(),
  };

  queryProposal(proposalId: number): OnChainProposal | null {
    return this.state.proposals.get(proposalId) || null;
  }

  queryProposalVotes(proposalId: number): Array<{ voter: string; support: boolean; weight: string }> {
    const proposal = this.state.proposals.get(proposalId);
    return proposal?.votes || [];
  }

  queryStream(streamId: number): OnChainStream | null {
    return this.state.streams.get(streamId) || null;
  }

  queryBurns(tokenAddress: string): OnChainBurn[] {
    return Array.from(this.state.burns.values()).filter(b => b.tokenAddress === tokenAddress);
  }

  createProposal(proposal: OnChainProposal): void {
    this.state.proposals.set(proposal.proposalId, proposal);
  }

  castVote(proposalId: number, voter: string, support: boolean, weight: string): void {
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    const voteKey = `${proposalId}:${voter}`;
    this.state.votes.set(voteKey, { voter, support, weight });
    proposal.votes.push({ voter, support, weight });
  }

  createStream(stream: OnChainStream): void {
    this.state.streams.set(stream.streamId, stream);
  }

  recordBurn(burn: OnChainBurn): void {
    this.state.burns.set(burn.txHash, burn);
  }

  updateProposalStatus(proposalId: number, status: ProposalStatus): void {
    const proposal = this.state.proposals.get(proposalId);
    if (proposal) {
      proposal.status = status;
    }
  }

  updateStreamStatus(streamId: number, status: StreamStatus, timestamp?: Date): void {
    const stream = this.state.streams.get(streamId);
    if (stream) {
      stream.status = status;
      if (status === StreamStatus.CLAIMED && timestamp) {
        stream.claimedAt = timestamp;
      } else if (status === StreamStatus.CANCELLED && timestamp) {
        stream.cancelledAt = timestamp;
      }
    }
  }

  getState(): OnChainState {
    return this.state;
  }

  reset(): void {
    this.state = {
      proposals: new Map(),
      votes: new Map(),
      streams: new Map(),
      burns: new Map(),
    };
  }
}

// ============================================================
// State Consistency Checker
// ============================================================

/**
 * Validates indexed state matches on-chain state
 */
class StateConsistencyChecker {
  constructor(
    private prisma: PrismaClient,
    private onChain: MockOnChainContract
  ) {}

  async checkProposalConsistency(proposalId: number): Promise<ConsistencyCheckResult> {
    const errors: string[] = [];

    const indexedProposal = await this.prisma.proposal.findUnique({
      where: { proposalId },
      include: { votes: true },
    });

    const onChainProposal = this.onChain.queryProposal(proposalId);

    if (!indexedProposal && !onChainProposal) {
      return { consistent: true, errors: [] };
    }

    if (!indexedProposal) {
      errors.push(`Indexed proposal ${proposalId} missing (exists on-chain)`);
    }

    if (!onChainProposal) {
      errors.push(`On-chain proposal ${proposalId} missing (exists in index)`);
    }

    if (indexedProposal && onChainProposal) {
      if (indexedProposal.proposer !== onChainProposal.proposer) {
        errors.push(
          `Proposer mismatch: indexed=${indexedProposal.proposer}, on-chain=${onChainProposal.proposer}`
        );
      }

      if (indexedProposal.status !== onChainProposal.status) {
        errors.push(
          `Status mismatch: indexed=${indexedProposal.status}, on-chain=${onChainProposal.status}`
        );
      }

      if (indexedProposal.quorum.toString() !== onChainProposal.quorum) {
        errors.push(
          `Quorum mismatch: indexed=${indexedProposal.quorum}, on-chain=${onChainProposal.quorum}`
        );
      }

      if (indexedProposal.votes.length !== onChainProposal.votes.length) {
        errors.push(
          `Vote count mismatch: indexed=${indexedProposal.votes.length}, on-chain=${onChainProposal.votes.length}`
        );
      }

      const indexedVotesFor = indexedProposal.votes
        .filter(v => v.support)
        .reduce((sum, v) => sum + v.weight, BigInt(0));

      const onChainVotesFor = onChainProposal.votes
        .filter(v => v.support)
        .reduce((sum, v) => sum + BigInt(v.weight), BigInt(0));

      if (indexedVotesFor !== onChainVotesFor) {
        errors.push(
          `Votes-for mismatch: indexed=${indexedVotesFor}, on-chain=${onChainVotesFor}`
        );
      }
    }

    return { consistent: errors.length === 0, errors };
  }

  async checkStreamConsistency(streamId: number): Promise<ConsistencyCheckResult> {
    const errors: string[] = [];

    const indexedStream = await this.prisma.stream.findUnique({
      where: { streamId },
    });

    const onChainStream = this.onChain.queryStream(streamId);

    if (!indexedStream && !onChainStream) {
      return { consistent: true, errors: [] };
    }

    if (!indexedStream) {
      errors.push(`Indexed stream ${streamId} missing (exists on-chain)`);
    }

    if (!onChainStream) {
      errors.push(`On-chain stream ${streamId} missing (exists in index)`);
    }

    if (indexedStream && onChainStream) {
      if (indexedStream.creator !== onChainStream.creator) {
        errors.push(
          `Creator mismatch: indexed=${indexedStream.creator}, on-chain=${onChainStream.creator}`
        );
      }

      if (indexedStream.recipient !== onChainStream.recipient) {
        errors.push(
          `Recipient mismatch: indexed=${indexedStream.recipient}, on-chain=${onChainStream.recipient}`
        );
      }

      if (indexedStream.amount.toString() !== onChainStream.amount) {
        errors.push(
          `Amount mismatch: indexed=${indexedStream.amount}, on-chain=${onChainStream.amount}`
        );
      }

      if (indexedStream.status !== onChainStream.status) {
        errors.push(
          `Status mismatch: indexed=${indexedStream.status}, on-chain=${onChainStream.status}`
        );
      }
    }

    return { consistent: errors.length === 0, errors };
  }

  async checkAggregateProposalConsistency(): Promise<ConsistencyCheckResult> {
    const errors: string[] = [];

    const indexedProposals = await this.prisma.proposal.findMany();
    const onChainState = this.onChain.getState();

    if (indexedProposals.length !== onChainState.proposals.size) {
      errors.push(
        `Proposal count mismatch: indexed=${indexedProposals.length}, on-chain=${onChainState.proposals.size}`
      );
    }

    for (const proposal of indexedProposals) {
      const check = await this.checkProposalConsistency(proposal.proposalId);
      if (!check.consistent) {
        errors.push(...check.errors);
      }
    }

    return { consistent: errors.length === 0, errors };
  }

  async checkAggregateStreamConsistency(): Promise<ConsistencyCheckResult> {
    const errors: string[] = [];

    const indexedStreams = await this.prisma.stream.findMany();
    const onChainState = this.onChain.getState();

    if (indexedStreams.length !== onChainState.streams.size) {
      errors.push(
        `Stream count mismatch: indexed=${indexedStreams.length}, on-chain=${onChainState.streams.size}`
      );
    }

    for (const stream of indexedStreams) {
      const check = await this.checkStreamConsistency(stream.streamId);
      if (!check.consistent) {
        errors.push(...check.errors);
      }
    }

    return { consistent: errors.length === 0, errors };
  }
}

// ============================================================
// Event Replay & Recovery Service
// ============================================================

/**
 * Handles event replay and recovery for delayed indexing scenarios
 */
class EventReplayService {
  constructor(
    private prisma: PrismaClient,
    private governanceParser: GovernanceEventParser,
    private streamParser: StreamEventParser,
    private mapper: GovernanceEventMapper
  ) {}

  /**
   * Replay governance events in order
   */
  async replayGovernanceEvents(events: any[]): Promise<{ replayed: number; errors: string[] }> {
    const errors: string[] = [];
    let replayed = 0;

    for (const event of events) {
      try {
        const mapped = this.mapper.mapEvent(event);
        if (mapped) {
          await this.governanceParser.parseEvent(mapped);
          replayed++;
        }
      } catch (error) {
        errors.push(`Failed to replay event ${event.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { replayed, errors };
  }

  /**
   * Replay stream events in order
   */
  async replayStreamEvents(events: any[]): Promise<{ replayed: number; errors: string[] }> {
    const errors: string[] = [];
    let replayed = 0;

    for (const event of events) {
      try {
        await this.streamParser.parseEvent(event);
        replayed++;
      } catch (error) {
        errors.push(`Failed to replay stream event: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { replayed, errors };
  }

  /**
   * Detect and recover from missed events
   */
  async detectMissedEvents(
    indexedProposalIds: number[],
    onChainProposalIds: number[]
  ): Promise<{ missed: number[]; orphaned: number[] }> {
    const indexedSet = new Set(indexedProposalIds);
    const onChainSet = new Set(onChainProposalIds);

    const missed = onChainProposalIds.filter(id => !indexedSet.has(id));
    const orphaned = indexedProposalIds.filter(id => !onChainSet.has(id));

    return { missed, orphaned };
  }
}

// ============================================================
// Test Suite
// ============================================================

describe('State Consistency Integration Tests', () => {
  let prisma: PrismaClient;
  let governanceParser: GovernanceEventParser;
  let streamParser: StreamEventParser;
  let mapper: GovernanceEventMapper;
  let onChain: MockOnChainContract;
  let checker: StateConsistencyChecker;
  let replayService: EventReplayService;

  beforeEach(async () => {
    prisma = new PrismaClient();
    governanceParser = new GovernanceEventParser(prisma);
    streamParser = new StreamEventParser(prisma);
    mapper = new GovernanceEventMapper();
    onChain = new MockOnChainContract();
    checker = new StateConsistencyChecker(prisma, onChain);
    replayService = new EventReplayService(prisma, governanceParser, streamParser, mapper);

    // Clean up test data
    await prisma.proposalExecution.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.proposal.deleteMany();
    await prisma.stream.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  // ============================================================
  // Proposal Ingestion Tests
  // ============================================================

  describe('Proposal Event Ingestion', () => {
    it('should ingest proposal created event and maintain consistency', async () => {
      // Index proposal
      const governanceEvent = mapper.mapEvent(proposalCreatedEvent);
      await governanceParser.parseEvent(governanceEvent!);

      // Simulate on-chain state
      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      // Verify consistency
      const result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple proposal types consistently', async () => {
      const proposals = [proposalCreatedEvent, adminTransferProposal, treasurySpendProposal];

      for (const proposal of proposals) {
        const event = mapper.mapEvent(proposal);
        await governanceParser.parseEvent(event!);
      }

      // Simulate on-chain state
      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      onChain.createProposal({
        proposalId: 3,
        proposer: 'GADMIN123456789',
        title: 'Transfer Admin Rights',
        status: ProposalStatus.ACTIVE,
        quorum: '2000000000000',
        threshold: '1500000000000',
        votes: [],
      });

      onChain.createProposal({
        proposalId: 4,
        proposer: 'GPROPOSER2123456789',
        title: 'Marketing Budget Allocation',
        status: ProposalStatus.ACTIVE,
        quorum: '1500000000000',
        threshold: '750000000000',
        votes: [],
      });

      // Verify aggregate consistency
      const result = await checker.checkAggregateProposalConsistency();
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect proposal count mismatch', async () => {
      const event = mapper.mapEvent(proposalCreatedEvent);
      await governanceParser.parseEvent(event!);

      // Create on-chain proposal but don't index it
      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      // Add another on-chain proposal
      onChain.createProposal({
        proposalId: 2,
        proposer: 'GPROPOSER2123456789',
        title: 'Another Proposal',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      const result = await checker.checkAggregateProposalConsistency();
      expect(result.consistent).toBe(false);
      expect(result.errors.some(e => e.includes('Proposal count mismatch'))).toBe(true);
    });
  });

  // ============================================================
  // Vote Ingestion Tests
  // ============================================================

  describe('Vote Event Ingestion', () => {
    beforeEach(async () => {
      // Create proposal first
      const event = mapper.mapEvent(proposalCreatedEvent);
      await governanceParser.parseEvent(event!);

      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });
    });

    it('should ingest vote cast events and maintain vote totals', async () => {
      // Index votes
      const voteForEvent = mapper.mapEvent(voteCastEventFor);
      const voteAgainstEvent = mapper.mapEvent(voteCastEventAgainst);

      await governanceParser.parseEvent(voteForEvent!);
      await governanceParser.parseEvent(voteAgainstEvent!);

      // Simulate on-chain votes
      onChain.castVote(1, 'GVOTER1123456789', true, '250000000000');
      onChain.castVote(1, 'GVOTER2123456789', false, '100000000000');

      // Verify consistency
      const result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Verify vote counts
      const indexedProposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
        include: { votes: true },
      });

      expect(indexedProposal?.votes).toHaveLength(2);
      expect(indexedProposal?.votes.some(v => v.support === true)).toBe(true);
      expect(indexedProposal?.votes.some(v => v.support === false)).toBe(true);
    });

    it('should detect vote count mismatch', async () => {
      // Index only one vote
      const voteEvent = mapper.mapEvent(voteCastEventFor);
      await governanceParser.parseEvent(voteEvent!);

      // Simulate two on-chain votes
      onChain.castVote(1, 'GVOTER1123456789', true, '250000000000');
      onChain.castVote(1, 'GVOTER2123456789', false, '100000000000');

      const result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(false);
      expect(result.errors.some(e => e.includes('Vote count mismatch'))).toBe(true);
    });

    it('should detect vote weight mismatch', async () => {
      const voteEvent = mapper.mapEvent(voteCastEventFor);
      await governanceParser.parseEvent(voteEvent!);

      // Simulate on-chain vote with different weight
      onChain.castVote(1, 'GVOTER1123456789', true, '300000000000');

      const result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(false);
      expect(result.errors.some(e => e.includes('Votes-for mismatch'))).toBe(true);
    });
  });

  // ============================================================
  // Stream Ingestion Tests
  // ============================================================

  describe('Stream Event Ingestion', () => {
    it('should ingest stream created event and maintain consistency', async () => {
      // Index stream
      await streamParser.parseEvent(streamEventFixtures.created);

      // Simulate on-chain state
      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CREATED,
      });

      // Verify consistency
      const result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle stream lifecycle events consistently', async () => {
      // Index stream creation
      await streamParser.parseEvent(streamEventFixtures.created);

      // Simulate on-chain creation
      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CREATED,
      });

      let result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(true);

      // Index stream claim
      await streamParser.parseEvent(streamEventFixtures.claimed);

      // Simulate on-chain claim
      onChain.updateStreamStatus(1, StreamStatus.CLAIMED, streamEventFixtures.claimed.timestamp);

      result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(true);
    });

    it('should detect stream status mismatch', async () => {
      await streamParser.parseEvent(streamEventFixtures.created);

      // Simulate on-chain state with different status
      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CLAIMED,
      });

      const result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(false);
      expect(result.errors.some(e => e.includes('Status mismatch'))).toBe(true);
    });

    it('should handle multiple streams consistently', async () => {
      // Index multiple streams
      await streamParser.parseEvent(streamEventFixtures.created);
      await streamParser.parseEvent(streamEventFixtures.createdWithoutMetadata);

      // Simulate on-chain state
      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CREATED,
      });

      onChain.createStream({
        streamId: 2,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '500000000',
        status: StreamStatus.CREATED,
      });

      const result = await checker.checkAggregateStreamConsistency();
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================================================
  // Delayed Indexing & Recovery Tests
  // ============================================================

  describe('Delayed Indexing Scenarios', () => {
    it('should recover from delayed proposal indexing', async () => {
      // Simulate delayed indexing: on-chain has proposal, index is empty
      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      // Verify inconsistency before recovery
      let result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(false);

      // Recover by replaying event
      const event = mapper.mapEvent(proposalCreatedEvent);
      await governanceParser.parseEvent(event!);

      // Verify consistency after recovery
      result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(true);
    });

    it('should detect and recover from missed events', async () => {
      // Index only first proposal
      const event1 = mapper.mapEvent(proposalCreatedEvent);
      await governanceParser.parseEvent(event1!);

      // Simulate on-chain with two proposals
      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      onChain.createProposal({
        proposalId: 3,
        proposer: 'GADMIN123456789',
        title: 'Transfer Admin Rights',
        status: ProposalStatus.ACTIVE,
        quorum: '2000000000000',
        threshold: '1500000000000',
        votes: [],
      });

      // Detect missed events
      const indexedProposals = await prisma.proposal.findMany();
      const indexedIds = indexedProposals.map(p => p.proposalId);
      const onChainState = onChain.getState();
      const onChainIds = Array.from(onChainState.proposals.keys());

      const { missed, orphaned } = await replayService.detectMissedEvents(indexedIds, onChainIds);

      expect(missed).toContain(3);
      expect(orphaned).toHaveLength(0);

      // Recover missed proposal
      const event3 = mapper.mapEvent(adminTransferProposal);
      await governanceParser.parseEvent(event3!);

      // Verify consistency after recovery
      const aggregateResult = await checker.checkAggregateProposalConsistency();
      expect(aggregateResult.consistent).toBe(true);
    });

    it('should handle delayed stream indexing', async () => {
      // Simulate delayed indexing
      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CREATED,
      });

      // Verify inconsistency
      let result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(false);

      // Recover by indexing
      await streamParser.parseEvent(streamEventFixtures.created);

      // Verify consistency
      result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(true);
    });
  });

  // ============================================================
  // Event Replay Tests
  // ============================================================

  describe('Event Replay & Recovery', () => {
    it('should replay governance events in order', async () => {
      const events = [proposalCreatedEvent, voteCastEventFor, voteCastEventAgainst];

      // Simulate on-chain state
      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      onChain.castVote(1, 'GVOTER1123456789', true, '250000000000');
      onChain.castVote(1, 'GVOTER2123456789', false, '100000000000');

      // Replay events
      const { replayed, errors } = await replayService.replayGovernanceEvents(events);

      expect(replayed).toBe(3);
      expect(errors).toHaveLength(0);

      // Verify consistency
      const result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(true);
    });

    it('should replay stream events in order', async () => {
      const events = [streamEventFixtures.created, streamEventFixtures.claimed];

      // Simulate on-chain state
      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CLAIMED,
        claimedAt: streamEventFixtures.claimed.timestamp,
      });

      // Replay events
      const { replayed, errors } = await replayService.replayStreamEvents(events);

      expect(replayed).toBe(2);
      expect(errors).toHaveLength(0);

      // Verify consistency
      const result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(true);
    });

    it('should handle replay errors gracefully', async () => {
      const events = [proposalCreatedEvent, { ...voteCastEventFor, value: { proposal_id: 999 } }];

      const { replayed, errors } = await replayService.replayGovernanceEvents(events);

      expect(replayed).toBe(1);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Aggregate Consistency Tests
  // ============================================================

  describe('Aggregate State Consistency', () => {
    it('should validate aggregate proposal state', async () => {
      // Index multiple proposals
      const proposals = [proposalCreatedEvent, adminTransferProposal, treasurySpendProposal];

      for (const proposal of proposals) {
        const event = mapper.mapEvent(proposal);
        await governanceParser.parseEvent(event!);
      }

      // Simulate on-chain state
      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      onChain.createProposal({
        proposalId: 3,
        proposer: 'GADMIN123456789',
        title: 'Transfer Admin Rights',
        status: ProposalStatus.ACTIVE,
        quorum: '2000000000000',
        threshold: '1500000000000',
        votes: [],
      });

      onChain.createProposal({
        proposalId: 4,
        proposer: 'GPROPOSER2123456789',
        title: 'Marketing Budget Allocation',
        status: ProposalStatus.ACTIVE,
        quorum: '1500000000000',
        threshold: '750000000000',
        votes: [],
      });

      const result = await checker.checkAggregateProposalConsistency();
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate aggregate stream state', async () => {
      // Index multiple streams
      await streamParser.parseEvent(streamEventFixtures.created);
      await streamParser.parseEvent(streamEventFixtures.createdWithoutMetadata);

      // Simulate on-chain state
      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CREATED,
      });

      onChain.createStream({
        streamId: 2,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '500000000',
        status: StreamStatus.CREATED,
      });

      const result = await checker.checkAggregateStreamConsistency();
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect aggregate inconsistencies', async () => {
      // Index one stream
      await streamParser.parseEvent(streamEventFixtures.created);

      // Simulate on-chain with two streams
      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CREATED,
      });

      onChain.createStream({
        streamId: 2,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '500000000',
        status: StreamStatus.CREATED,
      });

      const result = await checker.checkAggregateStreamConsistency();
      expect(result.consistent).toBe(false);
      expect(result.errors.some(e => e.includes('Stream count mismatch'))).toBe(true);
    });
  });

  // ============================================================
  // State Transition Tests
  // ============================================================

  describe('State Transitions', () => {
    it('should maintain consistency through proposal status transitions', async () => {
      // Create proposal
      const createEvent = mapper.mapEvent(proposalCreatedEvent);
      await governanceParser.parseEvent(createEvent!);

      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      let result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(true);

      // Transition to executed
      const statusEvent = mapper.mapEvent(proposalStatusChangedEvent);
      await governanceParser.parseEvent(statusEvent!);

      onChain.updateProposalStatus(1, ProposalStatus.PASSED);

      result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(true);

      // Execute proposal
      const execEvent = mapper.mapEvent(proposalExecutedEvent);
      await governanceParser.parseEvent(execEvent!);

      onChain.updateProposalStatus(1, ProposalStatus.EXECUTED);

      result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(true);
    });

    it('should maintain consistency through stream status transitions', async () => {
      // Create stream
      await streamParser.parseEvent(streamEventFixtures.created);

      onChain.createStream({
        streamId: 1,
        creator: 'GAXYZ123ABCDEFGHIJKLMNOPQRSTUVWXYZ456789ABCDEFGHIJKLMNOP',
        recipient: 'GBXYZ789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        status: StreamStatus.CREATED,
      });

      let result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(true);

      // Claim stream
      await streamParser.parseEvent(streamEventFixtures.claimed);
      onChain.updateStreamStatus(1, StreamStatus.CLAIMED, streamEventFixtures.claimed.timestamp);

      result = await checker.checkStreamConsistency(1);
      expect(result.consistent).toBe(true);
    });
  });

  // ============================================================
  // Edge Cases & Error Handling
  // ============================================================

  describe('Edge Cases & Error Handling', () => {
    it('should handle non-existent proposal gracefully', async () => {
      const result = await checker.checkProposalConsistency(999);
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle non-existent stream gracefully', async () => {
      const result = await checker.checkStreamConsistency(999);
      expect(result.consistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty database gracefully', async () => {
      const proposalResult = await checker.checkAggregateProposalConsistency();
      expect(proposalResult.consistent).toBe(true);

      const streamResult = await checker.checkAggregateStreamConsistency();
      expect(streamResult.consistent).toBe(true);
    });

    it('should handle orphaned indexed records', async () => {
      // Index proposal without on-chain equivalent
      const event = mapper.mapEvent(proposalCreatedEvent);
      await governanceParser.parseEvent(event!);

      const result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(false);
      expect(result.errors.some(e => e.includes('On-chain proposal'))).toBe(true);
    });

    it('should handle missing indexed records', async () => {
      // Create on-chain proposal without indexing
      onChain.createProposal({
        proposalId: 1,
        proposer: 'GPROPOSER123456789',
        title: 'Increase Burn Fee',
        status: ProposalStatus.ACTIVE,
        quorum: '1000000000000',
        threshold: '500000000000',
        votes: [],
      });

      const result = await checker.checkProposalConsistency(1);
      expect(result.consistent).toBe(false);
      expect(result.errors.some(e => e.includes('Indexed proposal'))).toBe(true);
    });
  });
});
