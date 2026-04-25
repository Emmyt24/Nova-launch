/**
 * Governance Events Versioning Tests
 * 
 * Validates that the backend correctly handles versioned governance events
 * with v1 topics for long-term indexer compatibility.
 * 
 * Tests cover:
 * - Event topic versioning (v1 suffix)
 * - Event payload structure validation
 * - Backward compatibility with legacy event names
 * - Schema immutability assertions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, ProposalStatus, ProposalType } from '@prisma/client';
import { GovernanceEventParser } from '../services/governanceEventParser';
import { GovernanceEventMapper } from '../services/governanceEventMapper';

describe('Governance Events Versioning', () => {
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

  describe('Event Topic Versioning', () => {
    it('should recognize v1 proposal created event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000000,
        ledger_close_time: '2024-03-06T12:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-create-1',
        paging_token: 'token-1',
        topic: ['prop_cr_v1', 'CTOKEN123456789'],
        value: {
          proposal_id: 1,
          proposer: 'GPROPOSER123456789',
          title: 'Test Proposal',
          proposal_type: 0,
          start_time: Math.floor(Date.now() / 1000),
          end_time: Math.floor(Date.now() / 1000) + 86400,
          quorum: 1000000000000,
          threshold: 500000000000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-create-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });

    it('should recognize v1 vote cast event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000100,
        ledger_close_time: '2024-03-06T13:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-vote-1',
        paging_token: 'token-2',
        topic: ['vote_cs_v1', '1'],
        value: {
          proposal_id: 1,
          voter: 'GVOTER1123456789',
          support: true,
          weight: 250000000000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-vote-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });

    it('should recognize v1 proposal queued event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000200,
        ledger_close_time: '2024-03-06T14:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-queue-1',
        paging_token: 'token-3',
        topic: ['prop_qu_v1', '1'],
        value: {
          eta: 3000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-queue-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });

    it('should recognize v1 proposal executed event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000300,
        ledger_close_time: '2024-03-06T15:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-exec-1',
        paging_token: 'token-4',
        topic: ['prop_ex_v1', '1'],
        value: {
          proposal_id: 1,
          executor: 'GEXECUTOR123456789',
          success: true,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-exec-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });

    it('should recognize v1 proposal cancelled event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000400,
        ledger_close_time: '2024-03-06T16:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-cancel-1',
        paging_token: 'token-5',
        topic: ['prop_ca_v1', '1'],
        value: {
          proposal_id: 1,
          canceller: 'GPROPOSER123456789',
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-cancel-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should still recognize legacy proposal created event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000000,
        ledger_close_time: '2024-03-06T12:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-create-1',
        paging_token: 'token-1',
        topic: ['prop_create', 'CTOKEN123456789'],
        value: {
          proposal_id: 1,
          proposer: 'GPROPOSER123456789',
          title: 'Test Proposal',
          proposal_type: 0,
          start_time: Math.floor(Date.now() / 1000),
          end_time: Math.floor(Date.now() / 1000) + 86400,
          quorum: 1000000000000,
          threshold: 500000000000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-create-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });

    it('should still recognize legacy vote cast event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000100,
        ledger_close_time: '2024-03-06T13:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-vote-1',
        paging_token: 'token-2',
        topic: ['vote_cast', 'CTOKEN123456789'],
        value: {
          proposal_id: 1,
          voter: 'GVOTER1123456789',
          support: true,
          weight: 250000000000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-vote-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });

    it('should still recognize legacy proposal executed event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000300,
        ledger_close_time: '2024-03-06T15:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-exec-1',
        paging_token: 'token-4',
        topic: ['prop_exec', 'CTOKEN123456789'],
        value: {
          proposal_id: 1,
          executor: 'GEXECUTOR123456789',
          success: true,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-exec-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });

    it('should still recognize legacy proposal cancelled event topic', () => {
      const event = {
        type: 'contract',
        ledger: 1000400,
        ledger_close_time: '2024-03-06T16:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-cancel-1',
        paging_token: 'token-5',
        topic: ['prop_cancel', 'CTOKEN123456789'],
        value: {
          proposal_id: 1,
          canceller: 'GPROPOSER123456789',
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-cancel-1',
      };

      expect(mapper.isGovernanceEvent(event)).toBe(true);
    });
  });

  describe('Event Payload Schema Validation', () => {
    it('should map v1 proposal created event with correct payload structure', () => {
      const event = {
        type: 'contract',
        ledger: 1000000,
        ledger_close_time: '2024-03-06T12:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-create-1',
        paging_token: 'token-1',
        topic: ['prop_cr_v1', 'CTOKEN123456789'],
        value: {
          proposal_id: 1,
          proposer: 'GPROPOSER123456789',
          title: 'Increase Burn Fee',
          description: 'Proposal to increase the burn fee',
          proposal_type: 0,
          start_time: Math.floor(Date.now() / 1000),
          end_time: Math.floor(Date.now() / 1000) + 86400 * 7,
          quorum: 1000000000000,
          threshold: 500000000000,
          metadata: JSON.stringify({ category: 'fee_adjustment' }),
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-create-1',
      };

      const mapped = mapper.mapEvent(event);

      expect(mapped).not.toBeNull();
      expect(mapped?.type).toBe('proposal_created');
      const proposalEvent = mapped as any;
      expect(proposalEvent.proposalId).toBe(1);
      expect(proposalEvent.proposer).toBe('GPROPOSER123456789');
      expect(proposalEvent.title).toBe('Increase Burn Fee');
      expect(proposalEvent.txHash).toBe('tx-prop-create-1');
      expect(proposalEvent.ledger).toBe(1000000);
    });

    it('should map v1 vote cast event with correct payload structure', () => {
      const event = {
        type: 'contract',
        ledger: 1000100,
        ledger_close_time: '2024-03-06T13:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-vote-1',
        paging_token: 'token-2',
        topic: ['vote_cs_v1', '1'],
        value: {
          proposal_id: 1,
          voter: 'GVOTER1123456789',
          support: true,
          weight: 250000000000,
          reason: 'I support this proposal',
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-vote-1',
      };

      const mapped = mapper.mapEvent(event);

      expect(mapped).not.toBeNull();
      expect(mapped?.type).toBe('vote_cast');
      const voteEvent = mapped as any;
      expect(voteEvent.proposalId).toBe(1);
      expect(voteEvent.voter).toBe('GVOTER1123456789');
      expect(voteEvent.support).toBe(true);
      expect(voteEvent.weight).toBe('250000000000');
      expect(voteEvent.reason).toBe('I support this proposal');
    });

    it('should map v1 proposal executed event with correct payload structure', () => {
      const event = {
        type: 'contract',
        ledger: 1000300,
        ledger_close_time: '2024-03-06T15:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-exec-1',
        paging_token: 'token-4',
        topic: ['prop_ex_v1', '1'],
        value: {
          proposal_id: 1,
          executor: 'GEXECUTOR123456789',
          success: true,
          return_data: '0x01',
          gas_used: 50000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-exec-1',
      };

      const mapped = mapper.mapEvent(event);

      expect(mapped).not.toBeNull();
      expect(mapped?.type).toBe('proposal_executed');
      const execEvent = mapped as any;
      expect(execEvent.proposalId).toBe(1);
      expect(execEvent.executor).toBe('GEXECUTOR123456789');
      expect(execEvent.success).toBe(true);
    });

    it('should map v1 proposal cancelled event with correct payload structure', () => {
      const event = {
        type: 'contract',
        ledger: 1000400,
        ledger_close_time: '2024-03-06T16:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-cancel-1',
        paging_token: 'token-5',
        topic: ['prop_ca_v1', '1'],
        value: {
          proposal_id: 1,
          canceller: 'GPROPOSER123456789',
          reason: 'Proposal no longer needed',
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-cancel-1',
      };

      const mapped = mapper.mapEvent(event);

      expect(mapped).not.toBeNull();
      expect(mapped?.type).toBe('proposal_cancelled');
      const cancelEvent = mapped as any;
      expect(cancelEvent.proposalId).toBe(1);
      expect(cancelEvent.canceller).toBe('GPROPOSER123456789');
    });
  });

  describe('Schema Immutability', () => {
    it('should preserve exact topic names for v1 events', () => {
      const v1Topics = ['prop_cr_v1', 'vote_cs_v1', 'prop_qu_v1', 'prop_ex_v1', 'prop_ca_v1'];

      v1Topics.forEach(topic => {
        const event = {
          type: 'contract',
          ledger: 1000000,
          ledger_close_time: '2024-03-06T12:00:00Z',
          contract_id: 'CGOVCONTRACT123456789',
          id: 'event-1',
          paging_token: 'token-1',
          topic: [topic, '1'],
          value: {},
          in_successful_contract_call: true,
          transaction_hash: 'tx-1',
        };

        expect(mapper.isGovernanceEvent(event)).toBe(true);
      });
    });

    it('should not accept modified topic names', () => {
      const invalidTopics = ['prop_cr_v2', 'vote_cs_v2', 'prop_qu_v2', 'prop_ex_v2', 'prop_ca_v2'];

      invalidTopics.forEach(topic => {
        const event = {
          type: 'contract',
          ledger: 1000000,
          ledger_close_time: '2024-03-06T12:00:00Z',
          contract_id: 'CGOVCONTRACT123456789',
          id: 'event-1',
          paging_token: 'token-1',
          topic: [topic, '1'],
          value: {},
          in_successful_contract_call: true,
          transaction_hash: 'tx-1',
        };

        expect(mapper.isGovernanceEvent(event)).toBe(false);
      });
    });
  });

  describe('Event Processing Integration', () => {
    it('should process v1 proposal created event end-to-end', async () => {
      const event = {
        type: 'contract',
        ledger: 1000000,
        ledger_close_time: '2024-03-06T12:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-create-1',
        paging_token: 'token-1',
        topic: ['prop_cr_v1', 'CTOKEN123456789'],
        value: {
          proposal_id: 1,
          proposer: 'GPROPOSER123456789',
          title: 'Test Proposal',
          proposal_type: 0,
          start_time: Math.floor(Date.now() / 1000),
          end_time: Math.floor(Date.now() / 1000) + 86400,
          quorum: 1000000000000,
          threshold: 500000000000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-create-1',
      };

      const mapped = mapper.mapEvent(event);
      expect(mapped).not.toBeNull();

      await parser.parseEvent(mapped!);

      const proposal = await prisma.proposal.findUnique({
        where: { proposalId: 1 },
      });

      expect(proposal).not.toBeNull();
      expect(proposal?.proposer).toBe('GPROPOSER123456789');
      expect(proposal?.title).toBe('Test Proposal');
      expect(proposal?.txHash).toBe('tx-prop-create-1');
    });

    it('should process v1 vote cast event end-to-end', async () => {
      // First create a proposal
      const proposalEvent = {
        type: 'contract',
        ledger: 1000000,
        ledger_close_time: '2024-03-06T12:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-prop-create-1',
        paging_token: 'token-1',
        topic: ['prop_cr_v1', 'CTOKEN123456789'],
        value: {
          proposal_id: 1,
          proposer: 'GPROPOSER123456789',
          title: 'Test Proposal',
          proposal_type: 0,
          start_time: Math.floor(Date.now() / 1000),
          end_time: Math.floor(Date.now() / 1000) + 86400,
          quorum: 1000000000000,
          threshold: 500000000000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-prop-create-1',
      };

      const mappedProposal = mapper.mapEvent(proposalEvent);
      await parser.parseEvent(mappedProposal!);

      // Then vote
      const voteEvent = {
        type: 'contract',
        ledger: 1000100,
        ledger_close_time: '2024-03-06T13:00:00Z',
        contract_id: 'CGOVCONTRACT123456789',
        id: 'event-vote-1',
        paging_token: 'token-2',
        topic: ['vote_cs_v1', '1'],
        value: {
          proposal_id: 1,
          voter: 'GVOTER1123456789',
          support: true,
          weight: 250000000000,
        },
        in_successful_contract_call: true,
        transaction_hash: 'tx-vote-1',
      };

      const mappedVote = mapper.mapEvent(voteEvent);
      await parser.parseEvent(mappedVote!);

      const votes = await prisma.vote.findMany({
        where: { voter: 'GVOTER1123456789' },
      });

      expect(votes).toHaveLength(1);
      expect(votes[0].support).toBe(true);
      expect(votes[0].weight.toString()).toBe('250000000000');
    });
  });

  describe('Mixed Version Handling', () => {
    it('should handle mix of v1 and legacy events', () => {
      const events = [
        {
          type: 'contract',
          ledger: 1000000,
          ledger_close_time: '2024-03-06T12:00:00Z',
          contract_id: 'CGOVCONTRACT123456789',
          id: 'event-1',
          paging_token: 'token-1',
          topic: ['prop_cr_v1', 'CTOKEN123456789'],
          value: { proposal_id: 1, proposer: 'GPROPOSER123456789' },
          in_successful_contract_call: true,
          transaction_hash: 'tx-1',
        },
        {
          type: 'contract',
          ledger: 1000100,
          ledger_close_time: '2024-03-06T13:00:00Z',
          contract_id: 'CGOVCONTRACT123456789',
          id: 'event-2',
          paging_token: 'token-2',
          topic: ['vote_cast', 'CTOKEN123456789'],
          value: { proposal_id: 1, voter: 'GVOTER1123456789', support: true },
          in_successful_contract_call: true,
          transaction_hash: 'tx-2',
        },
      ];

      const mapped = mapper.mapEvents(events);
      expect(mapped).toHaveLength(2);
      expect(mapped[0].type).toBe('proposal_created');
      expect(mapped[1].type).toBe('vote_cast');
    });
  });
});
