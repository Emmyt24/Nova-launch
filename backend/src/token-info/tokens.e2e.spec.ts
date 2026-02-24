import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { ThrottlerModule } from "@nestjs/throttler";
import { CacheModule } from "@nestjs/cache-manager";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { TokensController } from "../../src/tokens/tokens.controller";
import { TokensService } from "../../src/tokens/tokens.service";
import { Token } from "../../src/tokens/interfaces/token.interface";

const VALID_ADDRESS =
  "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const mockToken: Token = {
  basicInfo: {
    name: "USDC",
    symbol: "USDC",
    decimals: 7,
    address: VALID_ADDRESS,
  },
  supplyInfo: {
    total: "1000000.0000000",
    initial: "1000000.0000000",
    circulating: "900000.0000000",
  },
  burnInfo: {
    totalBurned: "1000.0000000",
    burnCount: 2,
    percentBurned: "0.1000",
  },
  creator: {
    address: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    createdAt: "2021-01-01T00:00:00Z",
  },
  analytics: {
    volume24h: "50000.0000000",
    volume7d: "350000.0000000",
    txCount24h: 120,
  },
  metadata: { image: "https://example.com/usdc.png", description: "USD Coin" },
};

const mockTokensService = {
  getToken: jest.fn().mockResolvedValue({ token: mockToken, cached: false }),
};

describe("Tokens E2E Tests (/api/tokens/:address)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        CacheModule.register({ isGlobal: false }),
        ThrottlerModule.forRoot([{ limit: 100, ttl: 60000 }]),
      ],
      controllers: [TokensController],
      providers: [{ provide: TokensService, useValue: mockTokensService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockTokensService.getToken.mockResolvedValue({
      token: mockToken,
      cached: false,
    });
  });

  describe("GET /api/tokens/:address", () => {
    it("should return 200 with token data for valid address", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tokens/${VALID_ADDRESS}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.cached).toBe(false);
      expect(res.body.timestamp).toBeDefined();
    });

    it("should return correct token structure", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tokens/${VALID_ADDRESS}`)
        .expect(200);

      const { data } = res.body;
      expect(data.basicInfo).toMatchObject({ symbol: "USDC", decimals: 7 });
      expect(data.supplyInfo).toHaveProperty("total");
      expect(data.supplyInfo).toHaveProperty("circulating");
      expect(data.burnInfo).toHaveProperty("burnCount");
      expect(data.creator).toHaveProperty("address");
      expect(data.analytics).toHaveProperty("volume24h");
    });

    it("should accept include query params", async () => {
      await request(app.getHttpServer())
        .get(`/api/tokens/${VALID_ADDRESS}?include=metadata&include=burns`)
        .expect(200);

      expect(mockTokensService.getToken).toHaveBeenCalledWith(
        VALID_ADDRESS,
        expect.objectContaining({
          include: expect.arrayContaining(["metadata", "burns"]),
        })
      );
    });

    it("should return cached=true when response is from cache", async () => {
      mockTokensService.getToken.mockResolvedValue({
        token: mockToken,
        cached: true,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/tokens/${VALID_ADDRESS}`)
        .expect(200);

      expect(res.body.cached).toBe(true);
    });

    it("should return 400 for invalid address format", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/tokens/invalid-address")
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toBeDefined();
    });

    it("should return 400 for address without issuer", async () => {
      await request(app.getHttpServer()).get("/api/tokens/USDC").expect(400);
    });

    it("should return 400 for invalid include enum value", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tokens/${VALID_ADDRESS}?include=invalid_field`)
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it("should return 404 when token not found", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      mockTokensService.getToken.mockRejectedValue(
        new NotFoundException("Token not found")
      );

      const res = await request(app.getHttpServer())
        .get(`/api/tokens/${VALID_ADDRESS}`)
        .expect(404);

      expect(res.body.statusCode).toBe(404);
    });

    it("should include all three optional data sections when all are requested", async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/tokens/${VALID_ADDRESS}?include=metadata&include=burns&include=analytics`
        )
        .expect(200);

      expect(mockTokensService.getToken).toHaveBeenCalledWith(VALID_ADDRESS, {
        include: expect.arrayContaining(["metadata", "burns", "analytics"]),
      });
    });
  });
});
