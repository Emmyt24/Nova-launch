/**
 * Campaign Types
 * Defines all types related to campaign creation and management
 */

export interface CampaignParams {
  title: string;
  description: string;
  budget: string; // in XLM
  duration: number; // in seconds
  slippage: number; // percentage (0-100)
  creatorAddress: string;
  tokenAddress: string;
}

export interface CampaignCreationResult {
  campaignId: string;
  transactionHash: string;
  timestamp: number;
  totalCost: string;
}

export interface CampaignValidationError {
  field: string;
  message: string;
}

export type CampaignStatus = 'idle' | 'validating' | 'submitting' | 'success' | 'error';

export interface CampaignFormState {
  title: string;
  description: string;
  budget: string;
  duration: number;
  slippage: number;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

export interface ContractError {
  code: number;
  message: string;
  userMessage: string;
  details?: string;
}

export interface CampaignFeeBreakdown {
  baseFee: string; // in XLM
  estimatedGasFee: string; // in XLM
  totalFee: string; // in XLM
}

export interface CampaignFormData {
  title: string;
  description: string;
  budget: string;
  duration: number;
  slippage: number;
}

export interface CampaignTransactionState {
  hash: string;
  status: 'pending' | 'success' | 'failed' | 'timeout';
  timestamp: number;
  error?: string;
}

// ── On-chain / contract types ────────────────────────────────────────────────

export type OnChainStepStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export type OnChainCampaignStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/** Raw step shape returned by the Soroban contract */
export interface OnChainBuybackStep {
  id: number;
  step_number: number;
  amount: string;
  status: OnChainStepStatus;
  executed_at?: string;
  tx_hash?: string;
}

/** Raw campaign shape returned by `get_buyback_campaign` */
export interface OnChainBuybackCampaign {
  id: number;
  token_address: string;
  total_amount: string;
  executed_amount: string;
  current_step: number;
  total_steps: number;
  status: OnChainCampaignStatus;
  created_at: string;
  steps: OnChainBuybackStep[];
}

// ── UI / dashboard models ────────────────────────────────────────────────────

export interface BuybackStepModel {
  id: number;
  stepNumber: number;
  amount: string;
  status: OnChainStepStatus;
  executedAt?: string;
  txHash?: string;
}

export interface BuybackCampaignModel {
  id: number;
  tokenAddress: string;
  totalAmount: string;
  executedAmount: string;
  currentStep: number;
  totalSteps: number;
  status: OnChainCampaignStatus;
  createdAt: string;
  steps: BuybackStepModel[];
  /** 0–100 */
  progressPercent: number;
  isActive: boolean;
}
