/**
 * Governance Types for Frontend
 */

export enum ProposalType {
  FEE_CHANGE = 0,
  TREASURY_CHANGE = 1,
  PAUSE_CONTRACT = 2,
  UNPAUSE_CONTRACT = 3,
  POLICY_UPDATE = 4,
}

export enum ProposalStatus {
  ACTIVE = 'ACTIVE',
  PASSED = 'PASSED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface ProposalParams {
  proposer: string;
  type: ProposalType;
  payload: Buffer | Uint8Array;
  startTime: bigint;
  endTime: bigint;
  eta: bigint;
  title?: string;       // Optional off-chain metadata
  description?: string; // Optional off-chain metadata
}

export interface VoteParams {
  proposalId: number;
  voter: string;
  support: boolean;
  reason?: string;
}

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  status: ProposalStatus;
  creator: string;
  voteCount: number;
  votesFor: string;
  votesAgainst: string;
  votesAbstain: string;
  createdAt: number;
  votingStartsAt: number;
  votingEndsAt: number;
  executedAt?: number;
  txHash?: string;
  payloadType: string;
  payload: string;
}

export interface GovernanceVote {
  id: string;
  proposalId: string;
  voter: string;
  support: boolean;
  weight: string;
  reason?: string;
  timestamp: number;
  txHash: string;
}

export interface GovernanceStats {
  totalProposals: number;
  activeProposals: number;
  totalVotes: number;
  totalVoters: number;
}
