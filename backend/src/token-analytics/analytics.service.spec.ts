import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { BurnEvent, BurnType } from './entities/burn-event.entity';
import { TimePeriod } from './dto/analytics.dto';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const TOKEN = '0xtoken123';

const makeAllTimeRow = (overrides = {}) => ({
  totalVolume: '1000000',
  totalCount: 10,
  uniqueBurners: 5,
  ...overrides,
});

const makePeriodRow = (overrides = {}) => ({
  volume: '500000',
  count: 5,
  uniqueBurners: 3,
  ...overrides,
});

const makeBurnTypeRows = () => [
  { burn_type: BurnType.SELF, volume: '700000', cnt: 7 },
  { burn_type: BurnType.ADMIN, volume: '300000', cnt: 3 },
];

const makeTimeSeriesRows = () => [
  {
    ts: '2024-01-01 00:00:00+00',
    value: '100000',
    count: 1,
  },
];

const makeLargestBurn = (): Partial<BurnEvent> => ({
  amount: '900000',
  txHash: '0xabc',
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

function buildQueryMock(
  overrides: Partial<Record<number, unknown[]>> = {},
): jest.Mock {
  // The service calls dataSource.query multiple times; we match by call order.
  let callIndex = 0;
  const defaults: unknown[][] = [
    [makeAllTimeRow()],          // 0 – getAllTimeStats
    [makePeriodRow()],            // 1 – getPeriodStats (current)
    [makePeriodRow({ volume: '400000', count: 4, uniqueBurners: 2 })], // 2 – getPeriodStats (prev)
    [makePeriodRow({ volume: '200000', count: 2 })],  // 3 – stats24h
    [makePeriodRow({ volume: '350000', count: 3 })],  // 4 – stats7d
    [makePeriodRow({ volume: '450000', count: 4 })],  // 5 – stats30d
    makeTimeSeriesRows(),                              // 6 – timeSeries
    makeBurnTypeRows(),                                // 7 – burnTypeDistribution
  ];

  return jest.fn().mockImplementation(() => {
    const result = overrides[callIndex] ?? defaults[callIndex] ?? [];
    callIndex++;
    return Promise.resolve(result);
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let queryMock: jest.Mock;

  const mockRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
  };

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    queryMock = buildQueryMock();
    mockDataSource.query = queryMock;
    mockRepo.count.mockResolvedValue(10);
    mockRepo.findOne.mockResolvedValue(makeLargestBurn());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(BurnEvent), useValue: mockRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Existence check ─────────────────────────────────────────────────────

  it('throws NotFoundException when no burns exist for token', async () => {
    mockRepo.count.mockResolvedValueOnce(0);
    await expect(
      service.getTokenAnalytics(TOKEN, TimePeriod.D7),
    ).rejects.toThrow(NotFoundException);
  });

  // ── Happy-path shape ────────────────────────────────────────────────────

  it('returns a well-shaped analytics response for 7d period', async () => {
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);

    expect(result.tokenAddress).toBe(TOKEN);
    expect(result.period).toBe(TimePeriod.D7);
    expect(result.totalBurned).toBe('1000000');
    expect(result.totalBurnCount).toBe(10);
    expect(result.allTimeUniqueBurners).toBe(5);
    expect(result.largestBurn).toBe('900000');
    expect(result.largestBurnTx).toBe('0xabc');
    expect(result.periodVolume).toBe('500000');
    expect(result.periodBurnCount).toBe(5);
    expect(result.periodUniqueBurners).toBe(3);
    expect(result.averageBurnAmount).toBe('100000');
    expect(typeof result.burnFrequencyPerDay).toBe('number');
    expect(Array.isArray(result.timeSeries)).toBe(true);
    expect(result.generatedAt).toBeTruthy();
  });

  // ── Period variations ───────────────────────────────────────────────────

  it.each([
    TimePeriod.H24,
    TimePeriod.D7,
    TimePeriod.D30,
    TimePeriod.D90,
    TimePeriod.ALL,
  ])('resolves without error for period %s', async (period) => {
    queryMock = buildQueryMock();
    mockDataSource.query = queryMock;
    await expect(
      service.getTokenAnalytics(TOKEN, period),
    ).resolves.toBeDefined();
  });

  // ── Comparison metrics ──────────────────────────────────────────────────

  it('calculates positive volumeChangePercent when current > previous', async () => {
    // current=500000, prev=400000 → +25 %
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    expect(result.volumeChangePercent).toBeCloseTo(25, 1);
  });

  it('returns 100 volumeChangePercent when previous period has zero volume', async () => {
    mockDataSource.query = buildQueryMock({
      2: [{ volume: '0', count: 0, uniqueBurners: 0 }],
    });
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    expect(result.volumeChangePercent).toBe(100);
  });

  it('returns 0 changePercent when both periods are zero', async () => {
    mockDataSource.query = buildQueryMock({
      1: [{ volume: '0', count: 0, uniqueBurners: 0 }],
      2: [{ volume: '0', count: 0, uniqueBurners: 0 }],
    });
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    expect(result.volumeChangePercent).toBe(0);
  });

  // ── averageBurnAmount ───────────────────────────────────────────────────

  it('returns 0 for averageBurnAmount when count is zero', async () => {
    mockDataSource.query = buildQueryMock({
      1: [{ volume: '0', count: 0, uniqueBurners: 0 }],
    });
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    expect(result.averageBurnAmount).toBe('0');
  });

  // ── Burn-type distribution ──────────────────────────────────────────────

  it('calculates burn type distribution percentages correctly', async () => {
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    const dist = result.burnTypeDistribution;

    expect(dist.self).toBe('700000');
    expect(dist.admin).toBe('300000');
    expect(dist.selfPercentage).toBe(70);
    expect(dist.adminPercentage).toBe(30);
    expect(dist.selfPercentage + dist.adminPercentage).toBe(100);
  });

  it('handles zero total volume in burn type distribution', async () => {
    mockDataSource.query = buildQueryMock({
      7: [
        { burn_type: BurnType.SELF, volume: '0', cnt: 0 },
        { burn_type: BurnType.ADMIN, volume: '0', cnt: 0 },
      ],
    });
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    expect(result.burnTypeDistribution.selfPercentage).toBe(0);
    expect(result.burnTypeDistribution.adminPercentage).toBe(0);
  });

  it('handles missing burn types gracefully (only self burns exist)', async () => {
    mockDataSource.query = buildQueryMock({
      7: [{ burn_type: BurnType.SELF, volume: '500000', cnt: 5 }],
    });
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    expect(result.burnTypeDistribution.admin).toBe('0');
    expect(result.burnTypeDistribution.adminPercentage).toBe(0);
  });

  // ── Time series ─────────────────────────────────────────────────────────

  it('returns timeSeries as an array of TimeSeriesDataPoint objects', async () => {
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    expect(result.timeSeries.length).toBeGreaterThan(0);
    for (const point of result.timeSeries) {
      expect(point).toHaveProperty('timestamp');
      expect(point).toHaveProperty('value');
      expect(point).toHaveProperty('count');
    }
  });

  it('fills zero-value gaps in time series', async () => {
    // Return only 1 data point for a 7d window (should have 7 points)
    mockDataSource.query = buildQueryMock({
      6: makeTimeSeriesRows(),
    });
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    const zeros = result.timeSeries.filter((p) => p.value === '0');
    expect(zeros.length).toBeGreaterThan(0);
  });

  // ── Address normalisation ───────────────────────────────────────────────

  it('normalises the token address to lowercase before querying', async () => {
    const upper = '0xTOKEN123';
    await service.getTokenAnalytics(upper, TimePeriod.D7);
    const firstQueryArgs = mockRepo.count.mock.calls[0][0];
    expect(firstQueryArgs.where.tokenAddress).toBe(upper.toLowerCase());
  });

  // ── Fixed-window stats ──────────────────────────────────────────────────

  it('returns stats24h, stats7d, stats30d on the response', async () => {
    const result = await service.getTokenAnalytics(TOKEN, TimePeriod.D7);
    expect(result.stats24h).toHaveProperty('volume');
    expect(result.stats7d).toHaveProperty('count');
    expect(result.stats30d).toHaveProperty('uniqueBurners');
  });
});
