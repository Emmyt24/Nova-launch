import { describe, it, expect } from 'vitest';
import { mapBuybackCampaign } from '../mappers/buybackCampaignMapper';
import type { OnChainBuybackCampaign } from '../../../types/campaign';

const validRaw: OnChainBuybackCampaign = {
  id: 1,
  token_address: 'CTOKEN123',
  total_amount: '10000',
  executed_amount: '4000',
  current_step: 2,
  total_steps: 5,
  status: 'ACTIVE',
  created_at: '2026-03-24T00:00:00Z',
  steps: [
    { id: 1, step_number: 0, amount: '2000', status: 'COMPLETED', executed_at: '2026-03-24T01:00:00Z', tx_hash: 'abc' },
    { id: 2, step_number: 1, amount: '2000', status: 'COMPLETED', executed_at: '2026-03-24T02:00:00Z', tx_hash: 'def' },
    { id: 3, step_number: 2, amount: '2000', status: 'PENDING' },
    { id: 4, step_number: 3, amount: '2000', status: 'PENDING' },
    { id: 5, step_number: 4, amount: '2000', status: 'PENDING' },
  ],
};

describe('mapBuybackCampaign', () => {
  it('maps a valid contract payload to a UI model', () => {
    const model = mapBuybackCampaign(validRaw);

    expect(model.id).toBe(1);
    expect(model.tokenAddress).toBe('CTOKEN123');
    expect(model.totalAmount).toBe('10000');
    expect(model.executedAmount).toBe('4000');
    expect(model.currentStep).toBe(2);
    expect(model.totalSteps).toBe(5);
    expect(model.status).toBe('ACTIVE');
    expect(model.isActive).toBe(true);
    expect(model.steps).toHaveLength(5);
  });

  it('calculates progressPercent correctly', () => {
    const model = mapBuybackCampaign(validRaw);
    expect(model.progressPercent).toBe(40);
  });

  it('caps progressPercent at 100', () => {
    const raw = { ...validRaw, current_step: 10, total_steps: 5 };
    const model = mapBuybackCampaign(raw);
    expect(model.progressPercent).toBe(100);
  });

  it('returns 0 progressPercent when total_steps is 0', () => {
    const raw = { ...validRaw, current_step: 0, total_steps: 0, steps: [] };
    const model = mapBuybackCampaign(raw);
    expect(model.progressPercent).toBe(0);
  });

  it('maps step fields from snake_case to camelCase', () => {
    const model = mapBuybackCampaign(validRaw);
    const step = model.steps[0];
    expect(step.stepNumber).toBe(0);
    expect(step.txHash).toBe('abc');
    expect(step.executedAt).toBe('2026-03-24T01:00:00Z');
  });

  it('sets isActive=false for COMPLETED campaign', () => {
    const raw = { ...validRaw, status: 'COMPLETED' as const };
    const model = mapBuybackCampaign(raw);
    expect(model.isActive).toBe(false);
  });

  it('throws on null payload', () => {
    expect(() => mapBuybackCampaign(null)).toThrow('Campaign payload is not an object');
  });

  it('throws on missing required field', () => {
    const { token_address: _, ...incomplete } = validRaw;
    expect(() => mapBuybackCampaign(incomplete)).toThrow('token_address');
  });

  it('throws on invalid campaign status', () => {
    const raw = { ...validRaw, status: 'UNKNOWN' as never };
    expect(() => mapBuybackCampaign(raw)).toThrow('Invalid campaign status');
  });

  it('throws on invalid step status', () => {
    const raw = {
      ...validRaw,
      steps: [{ ...validRaw.steps[0], status: 'RUNNING' as never }],
    };
    expect(() => mapBuybackCampaign(raw)).toThrow('Invalid step status');
  });

  it('handles optional step fields being absent', () => {
    const model = mapBuybackCampaign(validRaw);
    const pendingStep = model.steps[2];
    expect(pendingStep.txHash).toBeUndefined();
    expect(pendingStep.executedAt).toBeUndefined();
  });
});
