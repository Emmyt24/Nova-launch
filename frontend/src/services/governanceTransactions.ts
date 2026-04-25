import { StellarService } from './stellar.service';
import { StellarTransactionMonitor } from './StellarTransactionMonitor.integration';
import { parseStellarError } from './stellarErrors';
import type { ProposalParams, VoteParams } from '../types/governance';
import type { TransactionStatusUpdate } from './transactionMonitor';

export interface GovernanceTransactionOptions {
  onStatusUpdate?: (update: TransactionStatusUpdate) => void;
  onError?: (error: Error) => void;
}

/**
 * GovernanceTransactions - Manager for governance-related transaction flows.
 * Handles submission, monitoring, and error reporting for proposals and votes.
 */
export class GovernanceTransactions {
  private stellarService: StellarService;
  private monitor: StellarTransactionMonitor;

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    this.stellarService = new StellarService(network);
    this.monitor = new StellarTransactionMonitor(network);
  }

  /**
   * Submit a new proposal and monitor its status
   */
  async submitProposal(
    params: ProposalParams,
    options: GovernanceTransactionOptions = {}
  ): Promise<string> {
    try {
      // 1. Submit transaction to wallet and then to network
      const txHash = await this.stellarService.propose(params);

      // 2. Start monitoring the transaction status
      this.monitor.startMonitoring(
        txHash,
        (update) => {
          options.onStatusUpdate?.(update);
        },
        (error) => {
          options.onError?.(error);
        }
      );

      return txHash;
    } catch (error) {
      // Handle wallet rejection or network errors during submission
      const parsedError = parseStellarError(error);
      options.onError?.(parsedError);
      throw parsedError;
    }
  }

  /**
   * Submit a vote and monitor its status
   */
  async submitVote(
    params: VoteParams,
    options: GovernanceTransactionOptions = {}
  ): Promise<string> {
    try {
      // 1. Submit transaction to wallet and then to network
      const txHash = await this.stellarService.vote(params);

      // 2. Start monitoring the transaction status
      this.monitor.startMonitoring(
        txHash,
        (update) => {
          options.onStatusUpdate?.(update);
        },
        (error) => {
          options.onError?.(error);
        }
      );

      return txHash;
    } catch (error) {
      // Handle wallet rejection or network errors during submission
      const parsedError = parseStellarError(error);
      options.onError?.(parsedError);
      throw parsedError;
    }
  }

  /**
   * Finalize a proposal and monitor its status
   */
  async finalizeProposal(
    voter: string,
    proposalId: number,
    options: GovernanceTransactionOptions = {}
  ): Promise<string> {
    return this.submitProposalMethod(voter, proposalId, (v, p) => this.stellarService.finalizeProposal(v, p), options);
  }

  /**
   * Queue a proposal and monitor its status
   */
  async queueProposal(
    voter: string,
    proposalId: number,
    options: GovernanceTransactionOptions = {}
  ): Promise<string> {
    return this.submitProposalMethod(voter, proposalId, (v, p) => this.stellarService.queueProposal(v, p), options);
  }

  /**
   * Execute a proposal and monitor its status
   */
  async executeProposal(
    voter: string,
    proposalId: number,
    options: GovernanceTransactionOptions = {}
  ): Promise<string> {
    return this.submitProposalMethod(voter, proposalId, (v, p) => this.stellarService.executeProposal(v, p), options);
  }

  private async submitProposalMethod(
    caller: string,
    proposalId: number,
    method: (caller: string, proposalId: number) => Promise<string>,
    options: GovernanceTransactionOptions = {}
  ): Promise<string> {
    try {
      const txHash = await method(caller, proposalId);

      this.monitor.startMonitoring(
        txHash,
        (update) => {
          options.onStatusUpdate?.(update);
        },
        (error) => {
          options.onError?.(error);
        }
      );

      return txHash;
    } catch (error) {
      const parsedError = parseStellarError(error);
      options.onError?.(parsedError);
      throw parsedError;
    }
  }

  /**
   * Stop monitoring a transaction
   */
  stopMonitoring(txHash: string) {
    this.monitor.stopMonitoring(txHash);
  }

  /**
   * Cleanup all monitoring sessions
   */
  cleanup() {
    this.monitor.destroy();
  }
}
