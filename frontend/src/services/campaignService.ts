/**
 * Campaign Service
 * Handles campaign creation via real Soroban contract invocation.
 */

import { StellarService } from './stellar.service';
import type { CampaignParams, CampaignCreationResult, CampaignFeeBreakdown, ContractError } from '../types/campaign';
import type { AppError } from '../types';
import { ErrorCode } from '../types';

// XLM stroops per unit
const STROOPS = 10_000_000n;

const CONTRACT_ERROR_MAP: Record<number, ContractError> = {
  1: { code: 1, message: 'Invalid campaign parameters', userMessage: 'Please check your campaign details and try again' },
  2: { code: 2, message: 'Insufficient balance for campaign budget', userMessage: 'Your wallet does not have enough funds for this campaign' },
  3: { code: 3, message: 'Campaign duration too short', userMessage: 'Campaign must run for at least 1 hour' },
  4: { code: 4, message: 'Campaign duration too long', userMessage: 'Campaign cannot exceed 1 year' },
  5: { code: 5, message: 'Invalid slippage value', userMessage: 'Slippage must be between 0% and 100%' },
  6: { code: 6, message: 'Token not found', userMessage: 'The specified token does not exist' },
  7: { code: 7, message: 'Unauthorized creator', userMessage: 'You are not authorized to create campaigns for this token' },
  8: { code: 8, message: 'Campaign already exists', userMessage: 'A campaign with this ID already exists' },
};

export class CampaignService {
  private stellar: StellarService;

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    this.stellar = new StellarService(network);
  }

  calculateFees(): CampaignFeeBreakdown {
    const baseFee = '0.5';
    const estimatedGasFee = '0.1';
    return { baseFee, estimatedGasFee, totalFee: (0.5 + 0.1).toString() };
  }

  async createCampaign(params: CampaignParams): Promise<CampaignCreationResult> {
    this.validateCampaignParams(params);

    const now = Math.floor(Date.now() / 1000);
    const startTime = now;
    const endTime = now + params.duration;
    const budget = BigInt(Math.round(parseFloat(params.budget))) * STROOPS;
    // Convert slippage % to basis points (e.g. 1% → 100 bps)
    const maxSlippageBps = Math.round(params.slippage * 100);

    try {
      const { txHash, campaignId } = await this.stellar.createBuybackCampaign({
        creatorAddress: params.creatorAddress,
        tokenIndex: 0, // resolved from tokenAddress by caller context; default 0
        budget,
        startTime,
        endTime,
        minInterval: 3600, // 1 hour minimum between executions
        maxSlippageBps,
        sourceToken: params.tokenAddress,
        targetToken: params.tokenAddress,
      });

      return {
        campaignId,
        transactionHash: txHash,
        timestamp: Date.now(),
        totalCost: this.calculateFees().totalFee,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private validateCampaignParams(params: CampaignParams): void {
    if (!params.title?.trim()) throw this.createError(ErrorCode.INVALID_INPUT, 'Campaign title is required');
    if (!params.description?.trim()) throw this.createError(ErrorCode.INVALID_INPUT, 'Campaign description is required');
    if (!params.budget || parseFloat(params.budget) <= 0) throw this.createError(ErrorCode.INVALID_INPUT, 'Budget must be greater than 0');
    if (params.duration < 3600 || params.duration > 31536000) throw this.createError(ErrorCode.INVALID_INPUT, 'Duration must be between 1 hour and 1 year');
    if (params.slippage < 0 || params.slippage > 100) throw this.createError(ErrorCode.INVALID_INPUT, 'Slippage must be between 0% and 100%');
    if (!params.creatorAddress?.startsWith('G')) throw this.createError(ErrorCode.INVALID_INPUT, 'Invalid creator address');
    if (!params.tokenAddress?.startsWith('C')) throw this.createError(ErrorCode.INVALID_INPUT, 'Invalid token address');
  }

  private parseContractError(errorMessage: string): ContractError | null {
    const match = errorMessage.match(/error[:\s]+(\d+)/i);
    if (match) return CONTRACT_ERROR_MAP[parseInt(match[1], 10)] ?? null;
    return null;
  }

  private createError(code: string, message: string, details?: string): AppError {
    return { code, message, details };
  }

  private handleError(error: any): AppError {
    if (error && typeof error === 'object' && 'code' in error) return error as AppError;
    const message = error instanceof Error ? error.message : String(error);
    const contractError = this.parseContractError(message);
    if (contractError) return this.createError(ErrorCode.CONTRACT_ERROR, contractError.userMessage, contractError.message);
    if (message.includes('insufficient')) return this.createError(ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance for campaign');
    if (message.includes('rejected')) return this.createError(ErrorCode.WALLET_REJECTED, 'Transaction was rejected');
    if (message.includes('timeout')) return this.createError(ErrorCode.TIMEOUT_ERROR, 'Transaction confirmation timeout');
    if (message.includes('network')) return this.createError(ErrorCode.NETWORK_ERROR, 'Network error occurred');
    return this.createError(ErrorCode.TRANSACTION_FAILED, 'Campaign creation failed', message);
  }
}
