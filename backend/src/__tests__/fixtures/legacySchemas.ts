/**
 * Legacy Schema Fixtures
 * 
 * These fixtures represent older versions of storage models
 * to test backward compatibility and schema evolution.
 */

/**
 * V1 Token Schema (Original)
 * Missing: totalBurned, burnCount, metadataUri
 */
export const tokenV1 = {
  id: 'token-v1-001',
  address: 'CTOKENV1ADDRESS123456789',
  creator: 'GCREATORV1123456789',
  name: 'Legacy Token V1',
  symbol: 'LTKV1',
  decimals: 7,
  totalSupply: '1000000000000',
  initialSupply: '1000000000000',
  createdAt: new Date('2023-01-01T00:00:00Z'),
  updatedAt: new Date('2023-01-01T00:00:00Z'),
};

/**
 * V2 Token Schema (Added burn tracking)
 * Missing: metadataUri
 */
export const tokenV2 = {
  id: 'token-v2-001',
  address: 'CTOKENV2ADDRESS123456789',
  creator: 'GCREATORV2123456789',
  name: 'Legacy Token V2',
  symbol: 'LTKV2',
  decimals: 7,
  totalSupply: '1000000000000',
  initialSupply: '1000000000000',
  totalBurned: '50000000000',
  burnCount: 5,
  createdAt: new Date('2023-06-01T00:00:00Z'),
  updatedAt: new Date('2023-06-01T00:00:00Z'),
};

/**
 * V3 Token Schema (Current - with metadataUri)
 */
export const tokenV3 = {
  id: 'token-v3-001',
  address: 'CTOKENV3ADDRESS123456789',
  creator: 'GCREATORV3123456789',
  name: 'Current Token V3',
  symbol: 'LTKV3',
  decimals: 7,
  totalSupply: '1000000000000',
  initialSupply: '1000000000000',
  totalBurned: '100000000000',
  burnCount: 10,
  metadataUri: 'ipfs://QmTokenMetadata123',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/**
 * V1 Stream Schema (Original)
 * Missing: metadata, claimedAt, cancelledAt
 */
export const streamV1 = {
  id: 'stream-v1-001',
  streamId: 1,
  creator: 'GCREATORSTREAM123456789',
  recipient: 'GRECIPIENTSTREAM123456789',
  amount: '500000000000',
  status: 'CREATED',
  txHash: 'tx-stream-v1-001',
  createdAt: new Date('2023-01-01T00:00:00Z'),
};

/**
 * V2 Stream Schema (Added metadata)
 * Missing: claimedAt, cancelledAt
 */
export const streamV2 = {
  id: 'stream-v2-001',
  streamId: 2,
  creator: 'GCREATORSTREAM223456789',
  recipient: 'GRECIPIENTSTREAM223456789',
  amount: '750000000000',
  metadata: JSON.stringify({ purpose: 'Payment for services' }),
  status: 'CREATED',
  txHash: 'tx-stream-v2-001',
  createdAt: new Date('2023-06-01T00:00:00Z'),
};

/**
 * V3 Stream Schema (Current - with timestamps)
 */
export const streamV3 = {
  id: 'stream-v3-001',
  streamId: 3,
  creator: 'GCREATORSTREAM323456789',
  recipient: 'GRECIPIENTSTREAM323456789',
  amount: '1000000000000',
  metadata: JSON.stringify({ purpose: 'Salary payment', period: 'monthly' }),
  status: 'CLAIMED',
  txHash: 'tx-stream-v3-001',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  claimedAt: new Date('2024-01-15T00:00:00Z'),
  cancelledAt: null,
};

/**
 * V1 Proposal Schema (Original)
 * Missing: description, metadata, executedAt, cancelledAt
 */
export const proposalV1 = {
  id: 'proposal-v1-001',
  proposalId: 1,
  tokenId: 'CTOKENPROP123456789',
  proposer: 'GPROPOSERV1123456789',
  title: 'Legacy Proposal V1',
  proposalType: 'PARAMETER_CHANGE',
  status: 'ACTIVE',
  startTime: new Date('2023-01-01T00:00:00Z'),
  endTime: new Date('2023-01-08T00:00:00Z'),
  quorum: '1000000000000',
  threshold: '500000000000',
  txHash: 'tx-proposal-v1-001',
  createdAt: new Date('2023-01-01T00:00:00Z'),
  updatedAt: new Date('2023-01-01T00:00:00Z'),
};

/**
 * V2 Proposal Schema (Added description and metadata)
 * Missing: executedAt, cancelledAt
 */
export const proposalV2 = {
  id: 'proposal-v2-001',
  proposalId: 2,
  tokenId: 'CTOKENPROP223456789',
  proposer: 'GPROPOSERV2123456789',
  title: 'Legacy Proposal V2',
  description: 'This proposal aims to increase the burn fee',
  proposalType: 'PARAMETER_CHANGE',
  status: 'PASSED',
  startTime: new Date('2023-06-01T00:00:00Z'),
  endTime: new Date('2023-06-08T00:00:00Z'),
  quorum: '1500000000000',
  threshold: '750000000000',
  metadata: JSON.stringify({ category: 'fee_adjustment', impact: 'medium' }),
  txHash: 'tx-proposal-v2-001',
  createdAt: new Date('2023-06-01T00:00:00Z'),
  updatedAt: new Date('2023-06-08T00:00:00Z'),
};

/**
 * V3 Proposal Schema (Current - with execution timestamps)
 */
export const proposalV3 = {
  id: 'proposal-v3-001',
  proposalId: 3,
  tokenId: 'CTOKENPROP323456789',
  proposer: 'GPROPOSERV3123456789',
  title: 'Current Proposal V3',
  description: 'This proposal transfers admin rights to DAO',
  proposalType: 'ADMIN_TRANSFER',
  status: 'EXECUTED',
  startTime: new Date('2024-01-01T00:00:00Z'),
  endTime: new Date('2024-01-08T00:00:00Z'),
  quorum: '2000000000000',
  threshold: '1500000000000',
  metadata: JSON.stringify({ 
    category: 'governance', 
    impact: 'high',
    newAdmin: 'GNEWADMIN123456789'
  }),
  txHash: 'tx-proposal-v3-001',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-08T00:00:00Z'),
  executedAt: new Date('2024-01-09T00:00:00Z'),
  cancelledAt: null,
};

/**
 * V1 Vote Schema (Original)
 * Missing: reason
 */
export const voteV1 = {
  id: 'vote-v1-001',
  proposalId: 'proposal-v1-001',
  voter: 'GVOTERV1123456789',
  support: true,
  weight: '250000000000',
  txHash: 'tx-vote-v1-001',
  timestamp: new Date('2023-01-02T00:00:00Z'),
};

/**
 * V2 Vote Schema (Current - with reason)
 */
export const voteV2 = {
  id: 'vote-v2-001',
  proposalId: 'proposal-v2-001',
  voter: 'GVOTERV2123456789',
  support: true,
  weight: '500000000000',
  reason: 'I support this proposal for better tokenomics',
  txHash: 'tx-vote-v2-001',
  timestamp: new Date('2023-06-02T00:00:00Z'),
};

/**
 * V1 BurnRecord Schema (Original)
 * Missing: isAdminBurn
 */
export const burnRecordV1 = {
  id: 'burn-v1-001',
  tokenId: 'token-v1-001',
  from: 'GBURNERV1123456789',
  amount: '10000000000',
  burnedBy: 'GBURNERV1123456789',
  txHash: 'tx-burn-v1-001',
  timestamp: new Date('2023-01-15T00:00:00Z'),
};

/**
 * V2 BurnRecord Schema (Current - with isAdminBurn)
 */
export const burnRecordV2 = {
  id: 'burn-v2-001',
  tokenId: 'token-v2-001',
  from: 'GBURNERV2123456789',
  amount: '20000000000',
  burnedBy: 'GADMIN123456789',
  isAdminBurn: true,
  txHash: 'tx-burn-v2-001',
  timestamp: new Date('2023-06-15T00:00:00Z'),
};

/**
 * Collection of all legacy fixtures by version
 */
export const legacyFixtures = {
  token: {
    v1: tokenV1,
    v2: tokenV2,
    v3: tokenV3,
  },
  stream: {
    v1: streamV1,
    v2: streamV2,
    v3: streamV3,
  },
  proposal: {
    v1: proposalV1,
    v2: proposalV2,
    v3: proposalV3,
  },
  vote: {
    v1: voteV1,
    v2: voteV2,
  },
  burnRecord: {
    v1: burnRecordV1,
    v2: burnRecordV2,
  },
};

/**
 * Schema evolution timeline
 */
export const schemaEvolution = {
  token: [
    { version: 'v1', date: '2023-01-01', changes: 'Initial schema' },
    { version: 'v2', date: '2023-06-01', changes: 'Added totalBurned, burnCount' },
    { version: 'v3', date: '2024-01-01', changes: 'Added metadataUri' },
  ],
  stream: [
    { version: 'v1', date: '2023-01-01', changes: 'Initial schema' },
    { version: 'v2', date: '2023-06-01', changes: 'Added metadata' },
    { version: 'v3', date: '2024-01-01', changes: 'Added claimedAt, cancelledAt' },
  ],
  proposal: [
    { version: 'v1', date: '2023-01-01', changes: 'Initial schema' },
    { version: 'v2', date: '2023-06-01', changes: 'Added description, metadata' },
    { version: 'v3', date: '2024-01-01', changes: 'Added executedAt, cancelledAt' },
  ],
  vote: [
    { version: 'v1', date: '2023-01-01', changes: 'Initial schema' },
    { version: 'v2', date: '2023-06-01', changes: 'Added reason' },
  ],
  burnRecord: [
    { version: 'v1', date: '2023-01-01', changes: 'Initial schema' },
    { version: 'v2', date: '2023-06-01', changes: 'Added isAdminBurn' },
  ],
};
