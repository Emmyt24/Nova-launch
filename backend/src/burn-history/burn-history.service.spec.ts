import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Repository, SelectQueryBuilder } from "typeorm";
import { BurnHistoryService } from "./burn-history.service";
import {
  BurnTransaction,
  BurnTransactionType,
} from "./entities/burn-transaction.entity";
import {
  BurnHistoryQueryDto,
  BurnType,
  SortBy,
  SortOrder,
} from "./dto/burn-history-query.dto";

const mockBurnTransactions: BurnTransaction[] = [
  {
    id: "uuid-1",
    tokenAddress: "0xTokenAddress1",
    amount: "1000000000000000000",
    from: "0xFromAddress1",
    type: BurnTransactionType.SELF,
    transactionHash: "0xHash1",
    blockNumber: "12345678",
    timestamp: new Date("2024-01-15T10:00:00Z"),
    createdAt: new Date("2024-01-15T10:00:00Z"),
  },
  {
    id: "uuid-2",
    tokenAddress: "0xTokenAddress1",
    amount: "500000000000000000",
    from: "0xAdminAddress",
    type: BurnTransactionType.ADMIN,
    transactionHash: "0xHash2",
    blockNumber: "12345679",
    timestamp: new Date("2024-01-16T12:00:00Z"),
    createdAt: new Date("2024-01-16T12:00:00Z"),
  },
];

describe("BurnHistoryService", () => {
  let service: BurnHistoryService;
  let repository: jest.Mocked<Repository<BurnTransaction>>;
  let cacheManager: jest.Mocked<{ get: jest.Mock; set: jest.Mock }>;
  let mockQueryBuilder: Partial<SelectQueryBuilder<BurnTransaction>>;

  beforeEach(async () => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2),
      getMany: jest.fn().mockResolvedValue(mockBurnTransactions),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BurnHistoryService,
        {
          provide: getRepositoryToken(BurnTransaction),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<BurnHistoryService>(BurnHistoryService);
    repository = module.get(getRepositoryToken(BurnTransaction));
    cacheManager = module.get(CACHE_MANAGER);
  });

  afterEach(() => jest.clearAllMocks());

  describe("getHistory", () => {
    it("should return paginated burn history with default params", async () => {
      const query: BurnHistoryQueryDto = {};

      const result = await service.getHistory(query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
      expect(result.filters).toEqual({
        sortBy: SortBy.TIMESTAMP,
        sortOrder: SortOrder.DESC,
      });
    });

    it("should return cached response if available", async () => {
      const cachedResponse = {
        success: true,
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        filters: { sortBy: "timestamp", sortOrder: "desc" },
      };
      (cacheManager.get as jest.Mock).mockResolvedValueOnce(cachedResponse);

      const result = await service.getHistory({});

      expect(result).toEqual(cachedResponse);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("should filter by tokenAddress", async () => {
      const query: BurnHistoryQueryDto = { tokenAddress: "0xTokenAddress1" };

      await service.getHistory(query);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "bt.tokenAddress = :tokenAddress",
        { tokenAddress: "0xTokenAddress1" }
      );
    });

    it("should filter by type = self", async () => {
      const query: BurnHistoryQueryDto = { type: BurnType.SELF };

      await service.getHistory(query);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "bt.type = :type",
        { type: BurnType.SELF }
      );
    });

    it("should NOT add type filter when type = all", async () => {
      const query: BurnHistoryQueryDto = { type: BurnType.ALL };

      await service.getHistory(query);

      const andWhereCalls = (mockQueryBuilder.andWhere as jest.Mock).mock.calls;
      const typeFilterCalled = andWhereCalls.some((call) =>
        call[0].includes("bt.type")
      );
      expect(typeFilterCalled).toBe(false);
    });

    it("should filter by date range", async () => {
      const query: BurnHistoryQueryDto = {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
      };

      await service.getHistory(query);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "bt.timestamp >= :startDate",
        { startDate: new Date("2024-01-01T00:00:00Z") }
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "bt.timestamp <= :endDate",
        { endDate: new Date("2024-01-31T23:59:59Z") }
      );
    });

    it("should apply pagination correctly", async () => {
      const query: BurnHistoryQueryDto = { page: 2, limit: 5 };

      await service.getHistory(query);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5); // (page-1) * limit
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
    });

    it("should calculate totalPages correctly", async () => {
      (mockQueryBuilder.getCount as jest.Mock).mockResolvedValueOnce(25);

      const result = await service.getHistory({ page: 1, limit: 10 });

      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.total).toBe(25);
    });

    it("should apply sortBy and sortOrder", async () => {
      const query: BurnHistoryQueryDto = {
        sortBy: SortBy.AMOUNT,
        sortOrder: SortOrder.ASC,
      };

      await service.getHistory(query);

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith("bt.amount", "ASC");
    });

    it("should sort by timestamp descending by default", async () => {
      await service.getHistory({});

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        "bt.timestamp",
        "DESC"
      );
    });

    it("should include only applied filters in response", async () => {
      const query: BurnHistoryQueryDto = {
        tokenAddress: "0xToken",
        type: BurnType.ADMIN,
        startDate: "2024-01-01T00:00:00Z",
        sortBy: SortBy.FROM,
        sortOrder: SortOrder.ASC,
      };

      const result = await service.getHistory(query);

      expect(result.filters).toEqual({
        tokenAddress: "0xToken",
        type: BurnType.ADMIN,
        startDate: "2024-01-01T00:00:00Z",
        sortBy: SortBy.FROM,
        sortOrder: SortOrder.ASC,
      });
      expect(result.filters).not.toHaveProperty("endDate");
    });

    it("should cache result after fetching from DB", async () => {
      await service.getHistory({ tokenAddress: "0xToken" });

      expect(cacheManager.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = (cacheManager.set as jest.Mock).mock.calls[0];
      expect(key).toContain("burn_history");
      expect(value.success).toBe(true);
      expect(ttl).toBe(60_000);
    });

    it("should map entity fields to response correctly", async () => {
      const result = await service.getHistory({});

      expect(result.data[0]).toMatchObject({
        id: "uuid-1",
        tokenAddress: "0xTokenAddress1",
        amount: "1000000000000000000",
        from: "0xFromAddress1",
        type: "self",
        transactionHash: "0xHash1",
        blockNumber: "12345678",
      });
    });

    it("should handle empty result set gracefully", async () => {
      (mockQueryBuilder.getCount as jest.Mock).mockResolvedValueOnce(0);
      (mockQueryBuilder.getMany as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.getHistory({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it("should combine multiple filters", async () => {
      const query: BurnHistoryQueryDto = {
        tokenAddress: "0xToken",
        type: BurnType.SELF,
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        page: 2,
        limit: 20,
        sortBy: SortBy.AMOUNT,
        sortOrder: SortOrder.ASC,
      };

      await service.getHistory(query);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(4);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith("bt.amount", "ASC");
    });
  });

  describe("invalidateCache", () => {
    it("should not throw when called", async () => {
      await expect(service.invalidateCache("0xToken")).resolves.not.toThrow();
    });

    it("should not throw when called without tokenAddress", async () => {
      await expect(service.invalidateCache()).resolves.not.toThrow();
    });
  });
});
