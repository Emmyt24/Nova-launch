/**
 * Governance lifecycle end-to-end integration test.
 *
 * Covers:
 *  1. Proposal submission → indexed in DB
 *  2. Vote submission → proposal vote totals updated
 *  3. Proposal detail endpoint reflects ingested state
 *
 * Uses deterministic accounts and proposal IDs so tests are repeatable.
 * Requires a real (or in-memory) Prisma DB — run with `vitest run`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, ProposalStatus, ProposalType } from '@prisma/client';
import app from '../../index';
import { GovernanceEventParser } from '../../services/governanceEventParser';
import { GovernanceEventMapper } from '../../services/governanceEventMapper';

// ---------------------------------------------------------------------------
// Deterministic test fixtures
// ---------------------------------------------------------------------------
const PROPOSAL_ID = 9001;
const PROPOSER = 'GPROPOSERE2ETEST000000000000000000000000000000000000000001';
const VOTER_A = 'GVOTERA0E2ETEST000000000000000000000000000000000000000001';
const VOTER_B = 'GVOTERB0E2ETEST000000000000000000000000000000000000000001';
const CONTRACT_ID = 'CCONTRACTE2ETEST0000000000000000000000000000000000000001';
const TOKEN_ID = 'CTOKENE2ETEST00000000000000000000000000000000000000000001';

const NOW_S = Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent(overrides: Record<string, unknown>) {
  return {
    type: 'contract' as const,
    ledger: 1,
    ledger_close_time: new Date().toISOString(),
    contract_id: CONTRACT_ID,
    id: `e-${Math.random()}`,
    paging_token: `p-${Math.random()}`,
    in_successful_contract_call: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Governance lifecycle — end-to-end', () => {
  let prisma: PrismaClient;
  let parser: GovernanceEventParser;
  let mapper: GovernanceEventMapper;

  beforeEach(async () => {
    prisma = new PrismaClient();
    parser = new GovernanceEventParser(prisma);
    mapper = new GovernanceEventMapper();

    // Clean slate for this proposal ID
    await prisma.proposalExecution.deleteMany({ where: { proposal: { proposalId: PROPOSAL_ID } } });
    await prisma.vote.deleteMany({ where: { proposal: { proposalId: PROPOSAL_ID } } });
    await prisma.proposal.deleteMany({ where: { proposalId: PROPOSAL_ID } });
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  it('proposal submission creates an indexed proposal', async () => {
    const raw = makeEvent({
      topic: ['prop_cr_v1', TOKEN_ID],
      value: {
        proposal_id: PROPOSAL_ID,
        proposer: PROPOSER,
        title: 'E2E Test Proposal',
        proposal_type: 0,
        start_time: NOW_S,
        end_time: NOW_S + 86400,
        quorum: 1_000_000,
        threshold: 500_000,
      },
      transaction_hash: 'tx-e2e-create',
    });

    const event = mapper.mapEvent(raw as Parameters<typeof mapper.mapEvent>[0]);
    expect(event).not.toBeNull();
    await parser.parseEvent(event!);

    const proposal = await prisma.proposal.findUnique({ where: { proposalId: PROPOSAL_ID } });
    expect(proposal).not.toBeNull();
    expect(proposal!.proposer).toBe(PROPOSER);
    expect(proposal!.proposalType).toBe(ProposalType.PARAMETER_CHANGE);
    expect(proposal!.status).toBe(ProposalStatus.ACTIVE);
  });

  // -------------------------------------------------------------------------
  it('vote submission updates proposal vote totals', async () => {
    // Seed proposal first
    const createRaw = makeEvent({
      topic: ['prop_cr_v1', TOKEN_ID],
      value: {
        proposal_id: PROPOSAL_ID,
        proposer: PROPOSER,
        title: 'E2E Vote Test',
        proposal_type: 0,
        start_time: NOW_S,
        end_time: NOW_S + 86400,
        quorum: 1_000_000,
        threshold: 500_000,
      },
      transaction_hash: 'tx-e2e-create-2',
    });
    await parser.parseEvent(mapper.mapEvent(createRaw as Parameters<typeof mapper.mapEvent>[0])!);

    // Cast two votes
    for (const [voter, support, weight, txHash] of [
      [VOTER_A, true, 600_000, 'tx-vote-a'],
      [VOTER_B, false, 200_000, 'tx-vote-b'],
    ] as const) {
      const voteRaw = makeEvent({
        topic: ['vote_cs_v1', String(PROPOSAL_ID)],
        value: { proposal_id: PROPOSAL_ID, voter, support, weight },
        transaction_hash: txHash,
      });
      await parser.parseEvent(mapper.mapEvent(voteRaw as Parameters<typeof mapper.mapEvent>[0])!);
    }

    const proposal = await prisma.proposal.findUnique({
      where: { proposalId: PROPOSAL_ID },
      include: { votes: true },
    });

    expect(proposal!.votes).toHaveLength(2);
    const forVotes = proposal!.votes.filter(v => v.support);
    const againstVotes = proposal!.votes.filter(v => !v.support);
    expect(forVotes).toHaveLength(1);
    expect(againstVotes).toHaveLength(1);
    expect(Number(forVotes[0].weight)).toBe(600_000);
  });

  // -------------------------------------------------------------------------
  it('proposal detail endpoint reflects ingested state', async () => {
    // Seed proposal + vote via parser
    const createRaw = makeEvent({
      topic: ['prop_cr_v1', TOKEN_ID],
      value: {
        proposal_id: PROPOSAL_ID,
        proposer: PROPOSER,
        title: 'E2E API Test',
        proposal_type: 0,
        start_time: NOW_S,
        end_time: NOW_S + 86400,
        quorum: 1_000_000,
        threshold: 500_000,
      },
      transaction_hash: 'tx-e2e-api',
    });
    await parser.parseEvent(mapper.mapEvent(createRaw as Parameters<typeof mapper.mapEvent>[0])!);

    const voteRaw = makeEvent({
      topic: ['vote_cs_v1', String(PROPOSAL_ID)],
      value: { proposal_id: PROPOSAL_ID, voter: VOTER_A, support: true, weight: 700_000 },
      transaction_hash: 'tx-e2e-api-vote',
    });
    await parser.parseEvent(mapper.mapEvent(voteRaw as Parameters<typeof mapper.mapEvent>[0])!);

    // Query the API
    const res = await request(app).get(`/api/governance/proposals/${PROPOSAL_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data?.proposal ?? res.body.data;
    expect(data).toBeDefined();
    expect(data.proposalId ?? data.proposal_id).toBe(PROPOSAL_ID);
    expect(data.proposer).toBe(PROPOSER);

    // Votes should be present
    const votes = data.votes ?? [];
    expect(votes.length).toBeGreaterThanOrEqual(1);
    expect(votes.some((v: { support: boolean }) => v.support === true)).toBe(true);
  });
});
