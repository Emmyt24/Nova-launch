/**
 * GraphQL schema (SDL) for the Nova Launch API.
 *
 * Exposes the four core domain objects already served by the REST layer:
 *   Token, Stream, Proposal (governance), Campaign
 *
 * Design decisions:
 *  - BigInt fields are serialised as String to avoid JS precision loss.
 *  - All list queries accept optional `limit` (max 100) and `offset` args.
 *  - Enum values mirror the Prisma enums so resolvers can pass them through directly.
 *  - Mutations are intentionally excluded – writes go through the existing REST
 *    endpoints which carry full validation / auth middleware.
 */

export const typeDefs = /* GraphQL */ `
  scalar DateTime

  # ── Token ──────────────────────────────────────────────────────────────────

  type Token {
    id: ID!
    address: String!
    creator: String!
    name: String!
    symbol: String!
    decimals: Int!
    totalSupply: String!
    initialSupply: String!
    totalBurned: String!
    burnCount: Int!
    metadataUri: String
    createdAt: DateTime!
    updatedAt: DateTime!
    burnRecords(limit: Int, offset: Int): [BurnRecord!]!
  }

  type BurnRecord {
    id: ID!
    from: String!
    amount: String!
    burnedBy: String!
    isAdminBurn: Boolean!
    txHash: String!
    timestamp: DateTime!
  }

  # ── Stream ─────────────────────────────────────────────────────────────────

  enum StreamStatus {
    CREATED
    CLAIMED
    CANCELLED
  }

  type Stream {
    id: ID!
    streamId: Int!
    creator: String!
    recipient: String!
    amount: String!
    metadata: String
    status: StreamStatus!
    txHash: String!
    createdAt: DateTime!
    claimedAt: DateTime
    cancelledAt: DateTime
  }

  # ── Governance ─────────────────────────────────────────────────────────────

  enum ProposalStatus {
    ACTIVE
    PASSED
    REJECTED
    QUEUED
    EXECUTED
    CANCELLED
    EXPIRED
  }

  enum ProposalType {
    PARAMETER_CHANGE
    ADMIN_TRANSFER
    TREASURY_SPEND
    CONTRACT_UPGRADE
    CUSTOM
  }

  type Proposal {
    id: ID!
    proposalId: Int!
    tokenId: String!
    proposer: String!
    title: String!
    description: String
    proposalType: ProposalType!
    status: ProposalStatus!
    startTime: DateTime!
    endTime: DateTime!
    quorum: String!
    threshold: String!
    metadata: String
    txHash: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    executedAt: DateTime
    votes(limit: Int, offset: Int): [Vote!]!
  }

  type Vote {
    id: ID!
    voter: String!
    support: Boolean!
    weight: String!
    reason: String
    txHash: String!
    timestamp: DateTime!
  }

  # ── Campaign ───────────────────────────────────────────────────────────────

  enum CampaignStatus {
    ACTIVE
    PAUSED
    COMPLETED
    CANCELLED
  }

  enum CampaignType {
    BUYBACK
    AIRDROP
    LIQUIDITY
  }

  type Campaign {
    id: ID!
    campaignId: Int!
    tokenId: String!
    creator: String!
    type: CampaignType!
    status: CampaignStatus!
    targetAmount: String!
    currentAmount: String!
    executionCount: Int!
    startTime: DateTime!
    endTime: DateTime
    metadata: String
    txHash: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    completedAt: DateTime
    cancelledAt: DateTime
  }

  # ── Root Query ─────────────────────────────────────────────────────────────

  type Query {
    # Token queries
    token(address: String!): Token
    tokens(
      creator: String
      limit: Int
      offset: Int
    ): [Token!]!

    # Stream queries
    stream(streamId: Int!): Stream
    streams(
      creator: String
      recipient: String
      status: StreamStatus
      limit: Int
      offset: Int
    ): [Stream!]!

    # Governance queries
    proposal(proposalId: Int!): Proposal
    proposals(
      tokenId: String
      proposer: String
      status: ProposalStatus
      proposalType: ProposalType
      limit: Int
      offset: Int
    ): [Proposal!]!

    # Campaign queries
    campaign(campaignId: Int!): Campaign
    campaigns(
      tokenId: String
      creator: String
      status: CampaignStatus
      type: CampaignType
      limit: Int
      offset: Int
    ): [Campaign!]!
  }
`;
