import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignService } from '../campaignService';
import { ErrorCode } from '../../types';

// Mock StellarService
vi.mock('../stellar.service', () => ({
  StellarService: vi.fn().mockImplementation(() => ({
    createBuybackCampaign: vi.fn(),
  })),
}));

import { StellarService } from '../stellar.service';

const validParams = {
  title: 'Test Campaign',
  description: 'A real buyback campaign',
  budget: '100',
  duration: 86400,
  slippage: 1,
  creatorAddress: 'GCREATOR123456789012345678901234567890123456789012345',
  tokenAddress: 'CTOKEN1234567890123456789012345678901234567890123456',
};

describe('CampaignService — real contract invocation', () => {
  let service: CampaignService;
  let mockCreateBuybackCampaign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CampaignService('testnet');
    mockCreateBuybackCampaign = vi.mocked(StellarService).mock.results[0].value.createBuybackCampaign;
  });

  it('submits real transaction and returns tx hash and campaign ID', async () => {
    mockCreateBuybackCampaign.mockResolvedValue({
      txHash: 'abc123realtxhash',
      campaignId: '42',
    });

    const result = await service.createCampaign(validParams);

    expect(result.transactionHash).toBe('abc123realtxhash');
    expect(result.campaignId).toBe('42');
    expect(mockCreateBuybackCampaign).toHaveBeenCalledOnce();
  });

  it('passes correct budget in stroops to contract', async () => {
    mockCreateBuybackCampaign.mockResolvedValue({ txHash: 'tx1', campaignId: '1' });

    await service.createCampaign({ ...validParams, budget: '100' });

    const call = mockCreateBuybackCampaign.mock.calls[0][0];
    expect(call.budget).toBe(BigInt(100) * BigInt(10_000_000));
  });

  it('passes slippage as basis points to contract', async () => {
    mockCreateBuybackCampaign.mockResolvedValue({ txHash: 'tx1', campaignId: '1' });

    await service.createCampaign({ ...validParams, slippage: 1.5 });

    const call = mockCreateBuybackCampaign.mock.calls[0][0];
    expect(call.maxSlippageBps).toBe(150);
  });

  it('maps contract error code to user-facing message', async () => {
    mockCreateBuybackCampaign.mockRejectedValue(new Error('error: 7'));

    await expect(service.createCampaign(validParams)).rejects.toMatchObject({
      code: ErrorCode.CONTRACT_ERROR,
      message: 'You are not authorized to create campaigns for this token',
    });
  });

  it('maps wallet rejection to WALLET_REJECTED error', async () => {
    mockCreateBuybackCampaign.mockRejectedValue(new Error('User rejected'));

    await expect(service.createCampaign(validParams)).rejects.toMatchObject({
      code: ErrorCode.WALLET_REJECTED,
    });
  });

  it('maps timeout to TIMEOUT_ERROR', async () => {
    mockCreateBuybackCampaign.mockRejectedValue(new Error('timeout waiting for confirmation'));

    await expect(service.createCampaign(validParams)).rejects.toMatchObject({
      code: ErrorCode.TIMEOUT_ERROR,
    });
  });

  it('throws INVALID_INPUT for missing title without calling contract', async () => {
    await expect(
      service.createCampaign({ ...validParams, title: '' })
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });

    expect(mockCreateBuybackCampaign).not.toHaveBeenCalled();
  });
});
