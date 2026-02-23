import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TimePeriod, TokenAnalyticsResponseDto } from './dto/analytics.dto';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const TOKEN = '0xtoken';

function makeResponse(
  period = TimePeriod.D7,
): TokenAnalyticsResponseDto {
  return {
    tokenAddress: TOKEN,
    period,
    generatedAt: new Date().toISOString(),
    totalBurned: '1000000',
    totalBurnCount: 10,
    allTimeUniqueBurners: 5,
    largestBurn: '900000',
    largestBurnTx: '0xabc',
    stats24h: { volume: '100000', count: 1, uniqueBurners: 1 },
    stats7d: { volume: '300000', count: 3, uniqueBurners: 2 },
    stats30d: { volume: '700000', count: 7, uniqueBurners: 4 },
    periodVolume: '300000',
    periodBurnCount: 3,
    periodUniqueBurners: 2,
    averageBurnAmount: '100000',
    burnFrequencyPerDay: 0.43,
    volumeChangePercent: 25,
    countChangePercent: 20,
    timeSeries: [
      { timestamp: '2024-01-01T00:00:00.000Z', value: '100000', count: 1 },
    ],
    burnTypeDistribution: {
      self: '700000',
      admin: '300000',
      selfPercentage: 70,
      adminPercentage: 30,
    },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: jest.Mocked<AnalyticsService>;

  beforeEach(async () => {
    const mockService: jest.Mocked<
      Pick<AnalyticsService, 'getTokenAnalytics'>
    > = {
      getTokenAnalytics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockService },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Happy path ──────────────────────────────────────────────────────────

  it('calls service with address and default period', async () => {
    service.getTokenAnalytics.mockResolvedValueOnce(makeResponse());
    await controller.getTokenAnalytics(TOKEN, {});
    expect(service.getTokenAnalytics).toHaveBeenCalledWith(
      TOKEN,
      TimePeriod.D7,
    );
  });

  it('passes explicit period to service', async () => {
    service.getTokenAnalytics.mockResolvedValueOnce(
      makeResponse(TimePeriod.H24),
    );
    await controller.getTokenAnalytics(TOKEN, { period: TimePeriod.H24 });
    expect(service.getTokenAnalytics).toHaveBeenCalledWith(
      TOKEN,
      TimePeriod.H24,
    );
  });

  it('returns the service response unchanged', async () => {
    const expected = makeResponse();
    service.getTokenAnalytics.mockResolvedValueOnce(expected);
    const result = await controller.getTokenAnalytics(TOKEN, {});
    expect(result).toEqual(expected);
  });

  it.each([
    TimePeriod.H24,
    TimePeriod.D7,
    TimePeriod.D30,
    TimePeriod.D90,
    TimePeriod.ALL,
  ])('handles period %s', async (period) => {
    service.getTokenAnalytics.mockResolvedValueOnce(makeResponse(period));
    const result = await controller.getTokenAnalytics(TOKEN, { period });
    expect(result.period).toBe(period);
  });

  // ── Error propagation ───────────────────────────────────────────────────

  it('propagates NotFoundException from service', async () => {
    service.getTokenAnalytics.mockRejectedValueOnce(
      new NotFoundException('No data'),
    );
    await expect(
      controller.getTokenAnalytics('0xunknown', {}),
    ).rejects.toThrow(NotFoundException);
  });

  // ── Response shape ──────────────────────────────────────────────────────

  it('response contains all required top-level keys', async () => {
    service.getTokenAnalytics.mockResolvedValueOnce(makeResponse());
    const result = await controller.getTokenAnalytics(TOKEN, {});

    const requiredKeys: (keyof TokenAnalyticsResponseDto)[] = [
      'tokenAddress',
      'period',
      'generatedAt',
      'totalBurned',
      'totalBurnCount',
      'allTimeUniqueBurners',
      'largestBurn',
      'periodVolume',
      'periodBurnCount',
      'periodUniqueBurners',
      'averageBurnAmount',
      'burnFrequencyPerDay',
      'volumeChangePercent',
      'countChangePercent',
      'timeSeries',
      'burnTypeDistribution',
      'stats24h',
      'stats7d',
      'stats30d',
    ];

    for (const key of requiredKeys) {
      expect(result).toHaveProperty(key);
    }
  });
});
