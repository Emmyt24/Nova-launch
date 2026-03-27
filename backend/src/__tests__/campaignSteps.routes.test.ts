import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mock PrismaClient ─────────────────────────────────────────────────────────
const { mockFindUnique, mockCount } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    buybackCampaign: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: mockFindUnique,
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    buybackStep: {
      update: vi.fn(),
      count: mockCount,
    },
  })),
}));

import buybackRoutes from '../routes/buyback';

const app = express();
app.use(express.json());
app.use('/api/buyback', buybackRoutes);

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makeStep = (
  n: number,
  status: 'PENDING' | 'COMPLETED' | 'FAILED',
  txHash?: string
) => ({
  id: n + 1,
  campaignId: 1,
  stepNumber: n,
  amount: '2000',
  status,
  executedAt: status !== 'PENDING' ? new Date('2026-03-24T01:00:00Z') : null,
  txHash: txHash ?? null,
});

const makeCampaign = (steps: ReturnType<typeof makeStep>[]) => ({
  id: 1,
  tokenAddress: 'CTOKEN123',
  totalAmount: '10000',
  executedAmount: '0',
  currentStep: 0,
  totalSteps: steps.length,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  steps,
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/buyback/campaigns/:id/steps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(0);
  });

  it('returns steps in ascending stepNumber order with pagination envelope', async () => {
    const steps = [
      makeStep(0, 'COMPLETED', 'tx-aaa'),
      makeStep(1, 'COMPLETED', 'tx-bbb'),
      makeStep(2, 'PENDING'),
    ];
    mockFindUnique.mockResolvedValue(makeCampaign(steps));
    mockCount.mockResolvedValue(3);

    const res = await request(app).get('/api/buyback/campaigns/1/steps').expect(200);

    expect(res.body.steps).toHaveLength(3);
    expect(res.body.steps[0].stepNumber).toBe(0);
    expect(res.body.steps[1].stepNumber).toBe(1);
    expect(res.body.steps[2].stepNumber).toBe(2);
    expect(res.body.pagination).toMatchObject({ total: 3, limit: 50, offset: 0 });
  });

  it('completed steps contain executedAt and txHash', async () => {
    const steps = [makeStep(0, 'COMPLETED', 'tx-completed-1')];
    mockFindUnique.mockResolvedValue(makeCampaign(steps));
    mockCount.mockResolvedValue(1);

    const res = await request(app).get('/api/buyback/campaigns/1/steps').expect(200);

    const step = res.body.steps[0];
    expect(step.status).toBe('COMPLETED');
    expect(step.txHash).toBe('tx-completed-1');
    expect(step.executedAt).toBeDefined();
  });

  it('failed steps contain executedAt and no txHash', async () => {
    const steps = [makeStep(0, 'FAILED')];
    mockFindUnique.mockResolvedValue(makeCampaign(steps));
    mockCount.mockResolvedValue(1);

    const res = await request(app).get('/api/buyback/campaigns/1/steps').expect(200);

    const step = res.body.steps[0];
    expect(step.status).toBe('FAILED');
    expect(step.executedAt).toBeDefined();
    expect(step.txHash == null).toBe(true); // null from DB, undefined after mapping
  });

  it('empty-step campaign returns empty array with total 0', async () => {
    mockFindUnique.mockResolvedValue(makeCampaign([]));
    mockCount.mockResolvedValue(0);

    const res = await request(app).get('/api/buyback/campaigns/1/steps').expect(200);

    expect(res.body.steps).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('returns 404 when campaign not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/buyback/campaigns/999/steps').expect(404);

    expect(res.body.error).toBe('Campaign not found');
  });

  it('respects limit and offset query params', async () => {
    const steps = [makeStep(5, 'PENDING')];
    mockFindUnique.mockResolvedValue(makeCampaign(steps));
    mockCount.mockResolvedValue(10);

    const res = await request(app)
      .get('/api/buyback/campaigns/1/steps?limit=5&offset=5')
      .expect(200);

    expect(res.body.pagination).toMatchObject({ total: 10, limit: 5, offset: 5 });
  });

  it('returns 500 on unexpected service error', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app).get('/api/buyback/campaigns/1/steps').expect(500);

    expect(res.body.error).toBe('Failed to fetch campaign steps');
  });
});
