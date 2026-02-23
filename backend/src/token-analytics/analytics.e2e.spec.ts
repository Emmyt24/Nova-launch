import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { AnalyticsModule } from './analytics.module';
import { BurnEvent, BurnType } from './entities/burn-event.entity';
import { TimePeriod } from './dto/analytics.dto';

// ─── Stubs ────────────────────────────────────────────────────────────────────

const TOKEN = '0xe2d3a739effcd3a99387d015e260eefac72ebea1';

function buildDataSourceStub() {
  let callIndex = 0;
  const data = [
    [{ totalVolume: '2000000', totalCount: 20, uniqueBurners: 8 }],
    [{ volume: '500000', count: 5, uniqueBurners: 3 }],
    [{ volume: '400000', count: 4, uniqueBurners: 2 }],
    [{ volume: '200000', count: 2, uniqueBurners: 1 }],
    [{ volume: '350000', count: 3, uniqueBurners: 2 }],
    [{ volume: '450000', count: 4, uniqueBurners: 3 }],
    [
      {
        ts: new Date(Date.now() - 86_400_000).toISOString(),
        value: '100000',
        count: 1,
      },
    ],
    [
      { burn_type: BurnType.SELF, volume: '350000', cnt: 3 },
      { burn_type: BurnType.ADMIN, volume: '150000', cnt: 2 },
    ],
  ];
  return {
    query: jest.fn().mockImplementation(() => {
      const result = data[callIndex] ?? [];
      callIndex++;
      return Promise.resolve(result);
    }),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Analytics E2E', () => {
  let app: INestApplication;
  let dataSourceStub: ReturnType<typeof buildDataSourceStub>;
  const repoStub = {
    count: jest.fn().mockResolvedValue(20),
    findOne: jest.fn().mockResolvedValue({ amount: '900000', txHash: '0xabc' }),
  };
  const cacheStub = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

  beforeAll(async () => {
    dataSourceStub = buildDataSourceStub();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AnalyticsModule],
    })
      .overrideProvider(getRepositoryToken(BurnEvent))
      .useValue(repoStub)
      .overrideProvider(DataSource)
      .useValue(dataSourceStub)
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());

  // ── 200 responses ────────────────────────────────────────────────────────

  it('GET /api/analytics/:address → 200 with default period', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/analytics/${TOKEN}`)
      .expect(200);

    expect(res.body.tokenAddress).toBe(TOKEN);
    expect(res.body.period).toBe(TimePeriod.D7);
    expect(Array.isArray(res.body.timeSeries)).toBe(true);
    expect(res.body.burnTypeDistribution).toBeDefined();
    expect(res.body.stats24h).toBeDefined();
  });

  it('GET /api/analytics/:address?period=24h → 200', async () => {
    // Re-create stub for fresh call counts
    const module = await Test.createTestingModule({
      imports: [AnalyticsModule],
    })
      .overrideProvider(getRepositoryToken(BurnEvent))
      .useValue({ ...repoStub })
      .overrideProvider(DataSource)
      .useValue(buildDataSourceStub())
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheStub)
      .compile();

    const localApp = module.createNestApplication();
    localApp.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await localApp.init();

    const res = await request(localApp.getHttpServer())
      .get(`/api/analytics/${TOKEN}?period=24h`)
      .expect(200);

    expect(res.body.period).toBe(TimePeriod.H24);
    await localApp.close();
  });

  // ── 404 response ─────────────────────────────────────────────────────────

  it('GET /api/analytics/:address → 404 when no burns exist', async () => {
    const module = await Test.createTestingModule({
      imports: [AnalyticsModule],
    })
      .overrideProvider(getRepositoryToken(BurnEvent))
      .useValue({ count: jest.fn().mockResolvedValue(0), findOne: jest.fn() })
      .overrideProvider(DataSource)
      .useValue(buildDataSourceStub())
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheStub)
      .compile();

    const localApp = module.createNestApplication();
    localApp.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await localApp.init();

    await request(localApp.getHttpServer())
      .get('/api/analytics/0xunknown')
      .expect(404);

    await localApp.close();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('GET /api/analytics/:address?period=invalid → 400', async () => {
    const module = await Test.createTestingModule({
      imports: [AnalyticsModule],
    })
      .overrideProvider(getRepositoryToken(BurnEvent))
      .useValue(repoStub)
      .overrideProvider(DataSource)
      .useValue(buildDataSourceStub())
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheStub)
      .compile();

    const localApp = module.createNestApplication();
    localApp.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await localApp.init();

    await request(localApp.getHttpServer())
      .get(`/api/analytics/${TOKEN}?period=bad_value`)
      .expect(400);

    await localApp.close();
  });
});
