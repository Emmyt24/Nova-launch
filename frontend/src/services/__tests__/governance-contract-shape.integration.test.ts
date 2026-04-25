import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GovernanceTransactions } from '../governanceTransactions';
import { StellarService } from '../stellar.service';
import { ProposalType } from '../../types/governance';
import { ErrorCode } from '../../types';

// Mock StellarService
vi.mock('../stellar.service', () => ({
  StellarService: vi.fn().mockImplementation(() => ({
    propose: vi.fn(),
    vote: vi.fn(),
    finalizeProposal: vi.fn(),
    queueProposal: vi.fn(),
    executeProposal: vi.fn(),
    getProposal: vi.fn(),
    getVoteCounts: vi.fn(),
  })),
}));

// Mock StellarTransactionMonitor
vi.mock('../StellarTransactionMonitor.integration', () => ({
  StellarTransactionMonitor: vi.fn().mockImplementation(() => ({
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    destroy: vi.fn(),
  })),
}));

const validProposalParams = {
  proposer: 'GCREATOR123456789012345678901234567890123456789012345',
  type: ProposalType.FEE_CHANGE,
  payload: Buffer.from('test-payload'),
  startTime: BigInt(1700000000),
  endTime: BigInt(1700086400),
  eta: BigInt(1700172800),
};

const validVoteParams = {
  proposalId: 1,
  voter: 'GVOTER12345678901234567890123456789012345678901234567',
  support: true,
};

describe('GovernanceTransactions Integration — contract shape alignment', () => {
  let transactions: GovernanceTransactions;
  let mockStellarService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    transactions = new GovernanceTransactions('testnet');
    mockStellarService = vi.mocked(StellarService).mock.results[0].value;
  });

  it('submits a proposal with correct parameters', async () => {
    mockStellarService.propose.mockResolvedValue('tx_proposal_hash');

    const txHash = await transactions.submitProposal(validProposalParams);

    expect(txHash).toBe('tx_proposal_hash');
    expect(mockStellarService.propose).toHaveBeenCalledWith(validProposalParams);
  });

  it('submits a vote with correct parameters', async () => {
    mockStellarService.vote.mockResolvedValue('tx_vote_hash');

    const txHash = await transactions.submitVote(validVoteParams);

    expect(txHash).toBe('tx_vote_hash');
    expect(mockStellarService.vote).toHaveBeenCalledWith(validVoteParams);
  });

  it('submits finalize proposal correctly', async () => {
    mockStellarService.finalizeProposal.mockResolvedValue('tx_finalize_hash');

    const txHash = await transactions.finalizeProposal('GVOTER123', 1);

    expect(txHash).toBe('tx_finalize_hash');
    expect(mockStellarService.finalizeProposal).toHaveBeenCalledWith('GVOTER123', 1);
  });

  it('submits queue proposal correctly', async () => {
    mockStellarService.queueProposal.mockResolvedValue('tx_queue_hash');

    const txHash = await transactions.queueProposal('GVOTER123', 1);

    expect(txHash).toBe('tx_queue_hash');
    expect(mockStellarService.queueProposal).toHaveBeenCalledWith('GVOTER123', 1);
  });

  it('submits execute proposal correctly', async () => {
    mockStellarService.executeProposal.mockResolvedValue('tx_execute_hash');

    const txHash = await transactions.executeProposal('GVOTER123', 1);

    expect(txHash).toBe('tx_execute_hash');
    expect(mockStellarService.executeProposal).toHaveBeenCalledWith('GVOTER123', 1);
  });

  it('handles contract errors correctly', async () => {
    mockStellarService.propose.mockRejectedValue(new Error('Simulation failed: Error(Contract, 2)'));

    await expect(transactions.submitProposal(validProposalParams)).rejects.toMatchObject({
      code: ErrorCode.CONTRACT_ERROR,
    });
  });

  it('handles wallet rejection correctly', async () => {
    mockStellarService.vote.mockRejectedValue(new Error('User rejected the transaction'));

    await expect(transactions.submitVote(validVoteParams)).rejects.toMatchObject({
      code: ErrorCode.WALLET_REJECTED,
    });
  });
});
