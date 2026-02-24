import { Test, TestingModule } from "@nestjs/testing";
import { BurnHistoryController } from "./burn-history.controller";
import { BurnHistoryService } from "./burn-history.service";
import {
  BurnHistoryQueryDto,
  BurnType,
  SortBy,
  SortOrder,
} from "./dto/burn-history-query.dto";
import { BurnHistoryResponse } from "./interfaces/burn-history.interface";

const mockResponse: BurnHistoryResponse = {
  success: true,
  data: [
    {
      id: "uuid-1",
      tokenAddress: "0xToken",
      amount: "1000",
      from: "0xFrom",
      type: "self",
      transactionHash: "0xHash",
      blockNumber: "100",
      timestamp: new Date("2024-01-15T10:00:00Z"),
    },
  ],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  filters: { sortBy: "timestamp", sortOrder: "desc" },
};

describe("BurnHistoryController", () => {
  let controller: BurnHistoryController;
  let service: jest.Mocked<BurnHistoryService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BurnHistoryController],
      providers: [
        {
          provide: BurnHistoryService,
          useValue: {
            getHistory: jest.fn().mockResolvedValue(mockResponse),
          },
        },
      ],
    }).compile();

    controller = module.get<BurnHistoryController>(BurnHistoryController);
    service = module.get(BurnHistoryService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("getBurnHistory", () => {
    it("should call service with query params", async () => {
      const query: BurnHistoryQueryDto = {
        tokenAddress: "0xToken",
        type: BurnType.SELF,
        page: 1,
        limit: 10,
        sortBy: SortBy.TIMESTAMP,
        sortOrder: SortOrder.DESC,
      };

      const result = await controller.getBurnHistory(query);

      expect(service.getHistory).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResponse);
    });

    it("should return response with success = true", async () => {
      const result = await controller.getBurnHistory({});

      expect(result.success).toBe(true);
    });

    it("should return data array", async () => {
      const result = await controller.getBurnHistory({});

      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should return pagination metadata", async () => {
      const result = await controller.getBurnHistory({});

      expect(result.pagination).toBeDefined();
      expect(result.pagination).toHaveProperty("page");
      expect(result.pagination).toHaveProperty("limit");
      expect(result.pagination).toHaveProperty("total");
      expect(result.pagination).toHaveProperty("totalPages");
    });

    it("should return filters object", async () => {
      const result = await controller.getBurnHistory({});

      expect(result.filters).toBeDefined();
    });

    it("should pass empty query without error", async () => {
      await expect(controller.getBurnHistory({})).resolves.not.toThrow();
      expect(service.getHistory).toHaveBeenCalledWith({});
    });

    it("should propagate service errors", async () => {
      service.getHistory.mockRejectedValueOnce(
        new Error("DB connection failed")
      );

      await expect(controller.getBurnHistory({})).rejects.toThrow(
        "DB connection failed"
      );
    });
  });
});
