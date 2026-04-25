import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GovernanceTransactions } from '../governanceTransactions';
import { StellarService } from '../stellar.service';
import { StellarTransactionMonitor } from '../StellarTransactionMonitor.integration';
import { ErrorCode } from '../../types';
import { ProposalType } from '../../types/governance';
import { WalletService } from '../wallet';

// Mock dependencies
vi.mock('../stellar.service', () => ({
  StellarService: vi.fn()
}));
vi.mock('../StellarTransactionMonitor.integration', () => ({
  StellarTransactionMonitor: vi.fn()
}));
vi.mock('../wallet');

describe('GovernanceTransactions Resilience Tests', () => {
  let governanceTransactions: GovernanceTransactions;
  let mockStellarService: any;
  let mockMonitor: any;

  const mockProposalParams = {
    title: 'Test Proposal',
    description: 'This is a test proposal',
    type: ProposalType.PARAMETER_CHANGE,
    action: {
      contractId: 'C123',
      functionName: 'update_param',
      args: ['param1', 'val1']
    },
    proposer: 'G123'
  };

  const mockVoteParams = {
    proposalId: 1,
    voter: 'G123',
    support: true,
    reason: 'Good idea'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockStellarService = {
      propose: vi.fn(),
      vote: vi.fn()
    };
    (StellarService as any).mockImplementation(function() {
      return mockStellarService;
    });

    mockMonitor = {
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      destroy: vi.fn()
    };
    (StellarTransactionMonitor as any).mockImplementation(function() {
      return mockMonitor;
    });

    governanceTransactions = new GovernanceTransactions('testnet');
  });

  describe('Proposal Submission Flow', () => {
    it('should handle successful proposal submission and status monitoring', async () => {
      const txHash = '0x123';
      mockStellarService.propose.mockResolvedValue(txHash);
      
      const onStatusUpdate = vi.fn();
      
      const result = await governanceTransactions.submitProposal(mockProposalParams, {
        onStatusUpdate
      });

      expect(result).toBe(txHash);
      expect(mockStellarService.propose).toHaveBeenCalledWith(mockProposalParams);
      expect(mockMonitor.startMonitoring).toHaveBeenCalledWith(
        txHash,
        expect.any(Function),
        expect.any(Function)
      );

      // Simulate a status update from the monitor
      const statusUpdateCallback = mockMonitor.startMonitoring.mock.calls[0][1];
      statusUpdateCallback({ status: 'success', hash: txHash });
      
      expect(onStatusUpdate).toHaveBeenCalledWith({ status: 'success', hash: txHash });
    });

    it('should handle wallet rejection during proposal submission', async () => {
      const rejectionError = new Error('User declined');
      mockStellarService.propose.mockRejectedValue(rejectionError);
      
      const onError = vi.fn();

      await expect(
        governanceTransactions.submitProposal(mockProposalParams, { onError })
      ).rejects.toThrow();

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: ErrorCode.WALLET_REJECTED
      }));
      expect(mockMonitor.startMonitoring).not.toHaveBeenCalled();
    });

    it('should handle network error during proposal submission', async () => {
      mockStellarService.propose.mockRejectedValue(new Error('Network error'));
      
      const onError = vi.fn();

      await expect(
        governanceTransactions.submitProposal(mockProposalParams, { onError })
      ).rejects.toThrow();

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        code: ErrorCode.NETWORK_ERROR
      }));
    });
  });

  describe('Vote Submission Flow', () => {
    it('should handle successful vote submission and monitor timeouts', async () => {
      const txHash = '0x456';
      mockStellarService.vote.mockResolvedValue(txHash);
      
      const onStatusUpdate = vi.fn();
      
      await governanceTransactions.submitVote(mockVoteParams, {
        onStatusUpdate
      });

      // Simulate a timeout from the monitor
      const statusUpdateCallback = mockMonitor.startMonitoring.mock.calls[0][1];
      statusUpdateCallback({ status: 'timeout', hash: txHash });
      
      expect(onStatusUpdate).toHaveBeenCalledWith({ status: 'timeout', hash: txHash });
    });
  });

  describe('Mid-flow Resilience (Wallet Disconnect)', () => {
    /**
     * Test mid-flow wallet disconnect during proposal monitoring.
     * Monitoring should continue regardless of wallet state as it uses Horizon API.
     */
    it('should continue monitoring if wallet disconnects mid-flow', async () => {
      const txHash = '0x789';
      mockStellarService.propose.mockResolvedValue(txHash);
      
      const onStatusUpdate = vi.fn();
      
      await governanceTransactions.submitProposal(mockProposalParams, {
        onStatusUpdate
      });

      // Simulate wallet disconnect (this would be handled by a higher level hook usually)
      (WalletService.isInstalled as any).mockResolvedValue(false);
      
      // Monitoring should STILL work
      const statusUpdateCallback = mockMonitor.startMonitoring.mock.calls[0][1];
      statusUpdateCallback({ status: 'success', hash: txHash });
      
      expect(onStatusUpdate).toHaveBeenCalledWith({ status: 'success', hash: txHash });
    });
  });
});
