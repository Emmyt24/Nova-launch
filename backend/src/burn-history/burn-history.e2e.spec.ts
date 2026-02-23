import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BurnHistoryModule } from './burn-history.module';
import { BurnTransaction, BurnTransactionType } from './entities/burn-transaction.entity';

const mockTransactions: BurnTransaction[] = [
  {
    id: 'uuid-1',
    tokenAddress: '0xToken1',
    amount: '1000000000000000000',
    from: '0xUser1',
    type: BurnTransactionType.SELF,
    transactionHash: '0xHash1',
    blockNumber: '100',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date(),
  },
  {
    id: 'uuid-2',
    tokenAddress: '0xToken1',
    amount: '2000000000000000000',
    from: '0xAdmin',
    type: BurnTransactionType.ADMIN,
    transactionHash: '0xHash2',
    blockNumber: '101',
    timestamp: new Date('2024-01-16T12:00:00Z'),
    createdAt: new Date(),
  },
];

describe('BurnHistory E2E', () => {
  let app: INestApplication;

  const mockQb = {
    select: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(2),
    getMany: jest.fn().mockResolvedValue(mockTransactions),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BurnHistoryModule],
    })
      .overrideProvider(getRepositoryToken(BurnTransaction))
      .useValue({ createQueryBuilder: jest.fn().mockReturnValue(mockQb) })
      .overrideProvider(CACHE_MANAGER)
      .useValue({ get: jest.fn().mockResolvedValue(null), set: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockQb.getCount.mockResolvedValue(2);
    mockQb.getMany.mockResolvedValue(mockTransactions);
  });

  describe('GET /api/burn/history', () => {
    it('should return 200 with default params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/burn/history')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.filters).toBeDefined();
    });

    it('should return valid pagination structure', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/burn/history')
        .expect(200);

      const { pagination } = res.body;
      expect(pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter by tokenAddress', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/burn/history?tokenAddress=0xToken1')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'bt.tokenAddress = :tokenAddress',
        { tokenAddress: '0xToken1' },
      );
    });

    it('should filter by type=self', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/burn/history?type=self')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockQb.andWhere).toHaveBeenCalledWith('bt.type = :type', { type: 'self' });
    });

    it('should return 400 for invalid type param', async () => {
      await request(app.getHttpServer())
        .get('/api/burn/history?type=invalid')
        .expect(400);
    });

    it('should return 400 for invalid sortBy param', async () => {
      await request(app.getHttpServer())
        .get('/api/burn/history?sortBy=invalid')
        .expect(400);
    });

    it('should return 400 for limit > 100', async () => {
      await request(app.getHttpServer())
        .get('/api/burn/history?limit=101')
        .expect(400);
    });

    it('should return 400 for page < 1', async () => {
      await request(app.getHttpServer())
        .get('/api/burn/history?page=0')
        .expect(400);
    });

    it('should return 400 for invalid startDate', async () => {
      await request(app.getHttpServer())
        .get('/api/burn/history?startDate=not-a-date')
        .expect(400);
    });

    it('should accept full valid query', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/api/burn/history?tokenAddress=0xToken1&type=admin&startDate=2024-01-01T00:00:00Z&endDate=2024-12-31T23:59:59Z&page=1&limit=20&sortBy=amount&sortOrder=asc',
        )
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.filters).toMatchObject({
        tokenAddress: '0xToken1',
        type: 'admin',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        sortBy: 'amount',
        sortOrder: 'asc',
      });
    });

    it('should paginate correctly on page 2', async () => {
      mockQb.getCount.mockResolvedValueOnce(25);

      const res = await request(app.getHttpServer())
        .get('/api/burn/history?page=2&limit=10')
        .expect(200);

      expect(mockQb.skip).toHaveBeenCalledWith(10);
      expect(mockQb.take).toHaveBeenCalledWith(10);
      expect(res.body.pagination.page).toBe(2);
    });

    it('should sort by amount ascending', async () => {
      await request(app.getHttpServer())
        .get('/api/burn/history?sortBy=amount&sortOrder=asc')
        .expect(200);

      expect(mockQb.orderBy).toHaveBeenCalledWith('bt.amount', 'ASC');
    });

    it('should sort by from descending', async () => {
      await request(app.getHttpServer())
        .get('/api/burn/history?sortBy=from&sortOrder=desc')
        .expect(200);

      expect(mockQb.orderBy).toHaveBeenCalledWith('bt.from', 'DESC');
    });
  });
});
