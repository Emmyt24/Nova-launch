/**
 * Governance Event Fixtures
 * 
 * Test fixtures for governance events used in integration tests
 */

export const proposalCreatedEvent = {
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
    title: 'Increase Burn Fee',
    description: 'Proposal to increase the burn fee from 1% to 2%',
    proposal_type: 0, // PARAMETER_CHANGE
    start_time: Math.floor(Date.now() / 1000),
    end_time: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
    quorum: 1000000000000, // 1M tokens
    threshold: 500000000000, // 500K tokens (50%)
    metadata: JSON.stringify({ category: 'fee_adjustment' }),
  },
  in_successful_contract_call: true,
  transaction_hash: 'tx-prop-create-1',
};

export const voteCastEventFor = {
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
    weight: 250000000000, // 250K tokens
    reason: 'I support this proposal for better tokenomics',
  },
  in_successful_contract_call: true,
  transaction_hash: 'tx-vote-1',
};

export const voteCastEventAgainst = {
  type: 'contract',
  ledger: 1000200,
  ledger_close_time: '2024-03-06T14:00:00Z',
  contract_id: 'CGOVCONTRACT123456789',
  id: 'event-vote-2',
  paging_token: 'token-3',
  topic: ['vote_cast', 'CTOKEN123456789'],
  value: {
    proposal_id: 1,
    voter: 'GVOTER2123456789',
    support: false,
    weight: 100000000000, // 100K tokens
    reason: 'Fee increase is too high',
  },
  in_successful_contract_call: true,
  transaction_hash: 'tx-vote-2',
};

export const proposalExecutedEvent = {
  type: 'contract',
  ledger: 1000300,
  ledger_close_time: '2024-03-13T12:00:00Z',
  contract_id: 'CGOVCONTRACT123456789',
  id: 'event-prop-exec-1',
  paging_token: 'token-4',
  topic: ['prop_exec', 'CTOKEN123456789'],
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

export const proposalCancelledEvent = {
  type: 'contract',
  ledger: 1000400,
  ledger_close_time: '2024-03-07T12:00:00Z',
  contract_id: 'CGOVCONTRACT123456789',
  id: 'event-prop-cancel-1',
  paging_token: 'token-5',
  topic: ['prop_cancel', 'CTOKEN123456789'],
  value: {
    proposal_id: 2,
    canceller: 'GPROPOSER123456789',
    reason: 'Proposal no longer needed',
  },
  in_successful_contract_call: true,
  transaction_hash: 'tx-prop-cancel-1',
};

export const proposalStatusChangedEvent = {
  type: 'contract',
  ledger: 1000500,
  ledger_close_time: '2024-03-13T12:00:00Z',
  contract_id: 'CGOVCONTRACT123456789',
  id: 'event-prop-status-1',
  paging_token: 'token-6',
  topic: ['prop_status', 'CTOKEN123456789'],
  value: {
    proposal_id: 1,
    old_status: 0, // ACTIVE
    new_status: 1, // PASSED
  },
  in_successful_contract_call: true,
  transaction_hash: 'tx-prop-status-1',
};

export const adminTransferProposal = {
  type: 'contract',
  ledger: 1000600,
  ledger_close_time: '2024-03-08T12:00:00Z',
  contract_id: 'CGOVCONTRACT123456789',
  id: 'event-prop-create-2',
  paging_token: 'token-7',
  topic: ['prop_create', 'CTOKEN123456789'],
  value: {
    proposal_id: 3,
    proposer: 'GADMIN123456789',
    title: 'Transfer Admin Rights',
    description: 'Proposal to transfer admin rights to new address',
    proposal_type: 1, // ADMIN_TRANSFER
    start_time: Math.floor(Date.now() / 1000),
    end_time: Math.floor(Date.now() / 1000) + 86400 * 3, // 3 days
    quorum: 2000000000000, // 2M tokens
    threshold: 1500000000000, // 1.5M tokens (75%)
    metadata: JSON.stringify({
      new_admin: 'GNEWADMIN123456789',
      reason: 'Transition to DAO governance',
    }),
  },
  in_successful_contract_call: true,
  transaction_hash: 'tx-prop-create-2',
};

export const treasurySpendProposal = {
  type: 'contract',
  ledger: 1000700,
  ledger_close_time: '2024-03-09T12:00:00Z',
  contract_id: 'CGOVCONTRACT123456789',
  id: 'event-prop-create-3',
  paging_token: 'token-8',
  topic: ['prop_create', 'CTOKEN123456789'],
  value: {
    proposal_id: 4,
    proposer: 'GPROPOSER2123456789',
    title: 'Marketing Budget Allocation',
    description: 'Allocate 100K tokens for Q2 marketing campaign',
    proposal_type: 2, // TREASURY_SPEND
    start_time: Math.floor(Date.now() / 1000),
    end_time: Math.floor(Date.now() / 1000) + 86400 * 5, // 5 days
    quorum: 1500000000000, // 1.5M tokens
    threshold: 750000000000, // 750K tokens (50%)
    metadata: JSON.stringify({
      amount: '100000000000',
      recipient: 'GMARKETING123456789',
      purpose: 'Q2 Marketing Campaign',
    }),
  },
  in_successful_contract_call: true,
  transaction_hash: 'tx-prop-create-3',
};

export const allGovernanceEvents = [
  proposalCreatedEvent,
  voteCastEventFor,
  voteCastEventAgainst,
  proposalExecutedEvent,
  proposalCancelledEvent,
  proposalStatusChangedEvent,
  adminTransferProposal,
  treasurySpendProposal,
];

export const governanceEventsByType = {
  prop_create: [proposalCreatedEvent, adminTransferProposal, treasurySpendProposal],
  vote_cast: [voteCastEventFor, voteCastEventAgainst],
  prop_exec: [proposalExecutedEvent],
  prop_cancel: [proposalCancelledEvent],
  prop_status: [proposalStatusChangedEvent],
};
