import type {
  OnChainBuybackCampaign,
  OnChainBuybackStep,
  BuybackCampaignModel,
  BuybackStepModel,
} from '../../types/campaign';

const REQUIRED_CAMPAIGN_KEYS: (keyof OnChainBuybackCampaign)[] = [
  'id',
  'token_address',
  'total_amount',
  'executed_amount',
  'current_step',
  'total_steps',
  'status',
  'created_at',
  'steps',
];

const VALID_STATUSES = new Set(['ACTIVE', 'COMPLETED', 'CANCELLED']);
const VALID_STEP_STATUSES = new Set(['PENDING', 'COMPLETED', 'FAILED']);

function assertValidCampaign(raw: unknown): asserts raw is OnChainBuybackCampaign {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Campaign payload is not an object');
  }
  for (const key of REQUIRED_CAMPAIGN_KEYS) {
    if (!(key in (raw as object))) {
      throw new Error(`Campaign payload missing required field: ${key}`);
    }
  }
  const r = raw as Record<string, unknown>;
  if (!VALID_STATUSES.has(r.status as string)) {
    throw new Error(`Invalid campaign status: ${r.status}`);
  }
  if (!Array.isArray(r.steps)) {
    throw new Error('Campaign steps must be an array');
  }
}

function mapStep(raw: OnChainBuybackStep): BuybackStepModel {
  if (!VALID_STEP_STATUSES.has(raw.status)) {
    throw new Error(`Invalid step status: ${raw.status}`);
  }
  return {
    id: raw.id,
    stepNumber: raw.step_number,
    amount: raw.amount,
    status: raw.status,
    executedAt: raw.executed_at,
    txHash: raw.tx_hash,
  };
}

export function mapBuybackCampaign(raw: unknown): BuybackCampaignModel {
  assertValidCampaign(raw);

  const steps = raw.steps.map(mapStep);
  const progressPercent =
    raw.total_steps > 0
      ? Math.min(100, (raw.current_step / raw.total_steps) * 100)
      : 0;

  return {
    id: raw.id,
    tokenAddress: raw.token_address,
    totalAmount: raw.total_amount,
    executedAmount: raw.executed_amount,
    currentStep: raw.current_step,
    totalSteps: raw.total_steps,
    status: raw.status,
    createdAt: raw.created_at,
    steps,
    progressPercent,
    isActive: raw.status === 'ACTIVE',
  };
}
