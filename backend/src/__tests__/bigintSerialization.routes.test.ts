/**
 * BigInt Serialization Regression Tests — Backend Public APIs (#651)
 *
 * Verifies that all public JSON endpoints serialize BigInt fields as strings
 * and never throw "Do not know how to serialize a BigInt" errors.
 *
 * Strategy: mock the service/DB layer to return objects with BigInt fields,
 * then assert the HTTP response body contains string representations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before route imports
// ---------------------------------------------------------------------------

vi.mock("../lib/prisma", () => ({
  prisma: {
    token: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../services/campaignProjectionService", () => ({
  campaignProjectionService: {
    getCampaignStats: vi.fn(),
    getCampaignsByToken: vi.fn(),
    getCampaignsByCreator: vi.fn(),
    getCampaignById: vi.fn(),
    getExecutionHistory: vi.fn(),
  },
}));

// Governance route creates its own `new PrismaClient()` — mock the class.
// Use vi.hoisted so the variables are available inside the vi.mock factory.
const { mockProposalFindMany, mockProposalCount } = vi.hoisted(() => ({
  mockProposalFindMany: vi.fn(),
  mockProposalCount: vi.fn(),
}));

vi.mock("@prisma/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prisma/client")>();
  return {
    ...actual,
    PrismaClient: vi.fn().mockImplementation(() => ({
      proposal: {
        findMany: mockProposalFindMany,
        count: mockProposalCount,
        findUnique: vi.fn(),
      },
      vote: { findMany: vi.fn(), count: vi.fn() },
      $disconnect: vi.fn(),
    })),
  };
});

// ---------------------------------------------------------------------------
// Route imports (after mocks)
// ---------------------------------------------------------------------------
import tokenSearchRouter from "../routes/tokens";
import campaignRouter from "../routes/campaigns";
import governanceRouter from "../routes/governance";

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use("/api/tokens", tokenSearchRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/governance", governanceRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively checks that no value in the object is a raw BigInt */
function assertNoBigInt(obj: unknown, path = "root"): void {
  if (typeof obj === "bigint") {
    throw new Error(`Raw BigInt found at ${path}`);
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => assertNoBigInt(item, `${path}[${i}]`));
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      assertNoBigInt(value, `${path}.${key}`);
    }
  }
}

/** Checks that a field value is a numeric string (not a number or BigInt) */
function assertNumericString(value: unknown, fieldPath: string): void {
  expect(typeof value, `${fieldPath} should be a string`).toBe("string");
  expect(isNaN(Number(value)), `${fieldPath} should be numeric`).toBe(false);
}

// ---------------------------------------------------------------------------
// Token search route — BigInt fields: totalSupply, initialSupply, totalBurned
// ---------------------------------------------------------------------------

describe("BigInt Serialization — GET /api/tokens/search", () => {
  let prisma: any;

  beforeEach(async () => {
    const mod = await import("../lib/prisma");
    prisma = mod.prisma;
    vi.clearAllMocks();
  });

  const tokenWithBigInt = {
    id: "tok-1",
    address: "GTOKEN1",
    creator: "GCREATOR1",
    name: "Test Token",
    symbol: "TST",
    decimals: 7,
    totalSupply: BigInt("9007199254740993"), // > Number.MAX_SAFE_INTEGER
    initialSupply: BigInt("1000000000000"),
    totalBurned: BigInt("500000000"),
    burnCount: 3,
    metadataUri: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
  };

  it("serializes totalSupply as string", async () => {
    prisma.token.findMany.mockResolvedValue([tokenWithBigInt]);
    prisma.token.count.mockResolvedValue(1);

    const res = await request(app).get("/api/tokens/search");
    expect(res.status).toBe(200);
    assertNumericString(res.body.data[0].totalSupply, "totalSupply");
    expect(res.body.data[0].totalSupply).toBe("9007199254740993");
  });

  it("serializes initialSupply as string", async () => {
    prisma.token.findMany.mockResolvedValue([tokenWithBigInt]);
    prisma.token.count.mockResolvedValue(1);

    const res = await request(app).get("/api/tokens/search");
    expect(res.status).toBe(200);
    assertNumericString(res.body.data[0].initialSupply, "initialSupply");
  });

  it("serializes totalBurned as string", async () => {
    prisma.token.findMany.mockResolvedValue([tokenWithBigInt]);
    prisma.token.count.mockResolvedValue(1);

    const res = await request(app).get("/api/tokens/search");
    expect(res.status).toBe(200);
    assertNumericString(res.body.data[0].totalBurned, "totalBurned");
  });

  it("does not throw when BigInt values exceed Number.MAX_SAFE_INTEGER", async () => {
    const largeToken = {
      ...tokenWithBigInt,
      totalSupply: BigInt("99999999999999999999"),
    };
    prisma.token.findMany.mockResolvedValue([largeToken]);
    prisma.token.count.mockResolvedValue(1);

    const res = await request(app).get("/api/tokens/search?q=large-supply");
    expect(res.status).toBe(200);
    expect(res.body.data[0].totalSupply).toBe("99999999999999999999");
  });

  it("response body contains no raw BigInt values", async () => {
    prisma.token.findMany.mockResolvedValue([tokenWithBigInt]);
    prisma.token.count.mockResolvedValue(1);

    const res = await request(app).get("/api/tokens/search?q=no-bigint-check");
    expect(res.status).toBe(200);
    expect(() => assertNoBigInt(res.body)).not.toThrow();
  });

  it("serializes multiple tokens correctly", async () => {
    const tokens = [
      { ...tokenWithBigInt, id: "tok-1", totalSupply: BigInt("1000") },
      { ...tokenWithBigInt, id: "tok-2", totalSupply: BigInt("2000") },
    ];
    prisma.token.findMany.mockResolvedValue(tokens);
    prisma.token.count.mockResolvedValue(2);

    // Use unique query param to bypass the in-memory cache
    const res = await request(app).get("/api/tokens/search?q=multi-test");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].totalSupply).toBe("1000");
    expect(res.body.data[1].totalSupply).toBe("2000");
  });
});

// ---------------------------------------------------------------------------
// Campaign routes — BigInt fields: targetAmount, currentAmount
// ---------------------------------------------------------------------------

describe("BigInt Serialization — Campaign Routes", () => {
  let campaignService: any;

  beforeEach(async () => {
    const mod = await import("../services/campaignProjectionService");
    campaignService = mod.campaignProjectionService;
    vi.clearAllMocks();
  });

  const campaignWithBigInt = {
    id: "camp-1",
    campaignId: 42,
    tokenId: "tok-1",
    creator: "GCREATOR1",
    type: "BUYBACK",
    status: "ACTIVE",
    targetAmount: BigInt("5000000000000"),
    currentAmount: BigInt("1234567890123"),
    executionCount: 5,
    progress: 24,
    txHash: "txhash123",
    startTime: new Date("2024-01-01"),
    endTime: new Date("2024-12-31"),
    metadata: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
  };

  it("GET /api/campaigns/stats — does not return 500", async () => {
    campaignService.getCampaignStats.mockResolvedValue({
      totalCampaigns: 10,
      activeCampaigns: 3,
      completedCampaigns: 7,
      totalVolume: BigInt("9999999999999999"),
      totalExecutions: 50,
    });

    const res = await request(app).get("/api/campaigns/stats");
    expect(res.status).not.toBe(500);
  });

  it("GET /api/campaigns/token/:tokenId — does not return 500", async () => {
    campaignService.getCampaignsByToken.mockResolvedValue([campaignWithBigInt]);

    const res = await request(app).get("/api/campaigns/token/tok-1");
    expect(res.status).not.toBe(500);
  });

  it("GET /api/campaigns/creator/:creator — does not return 500", async () => {
    campaignService.getCampaignsByCreator.mockResolvedValue([campaignWithBigInt]);

    const res = await request(app).get("/api/campaigns/creator/GCREATOR1");
    expect(res.status).not.toBe(500);
  });

  it("GET /api/campaigns/:id — does not return 500", async () => {
    campaignService.getCampaignById.mockResolvedValue(campaignWithBigInt);

    const res = await request(app).get("/api/campaigns/42");
    expect(res.status).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Governance routes — BigInt fields: quorum, threshold, vote weight
// ---------------------------------------------------------------------------

describe("BigInt Serialization — GET /api/governance/proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const proposalWithBigInt = {
    id: "prop-1",
    proposalId: 1,
    tokenId: "tok-1",
    proposer: "GPROPOSER1",
    proposalType: "PARAMETER_CHANGE",
    status: "ACTIVE",
    quorum: BigInt("1000000000000"),
    threshold: BigInt("510000000000"),
    startTime: new Date("2024-01-01"),
    endTime: new Date("2024-12-31"),
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    votes: [
      {
        id: "vote-1",
        voter: "GVOTER1",
        support: true,
        weight: BigInt("100000000000"),
        timestamp: new Date("2024-01-05"),
      },
    ],
    executions: [],
  };

  it("serializes quorum as string", async () => {
    mockProposalFindMany.mockResolvedValue([proposalWithBigInt]);
    mockProposalCount.mockResolvedValue(1);

    const res = await request(app).get("/api/governance/proposals");
    expect(res.status).toBe(200);
    assertNumericString(res.body.data.proposals[0].quorum, "quorum");
    expect(res.body.data.proposals[0].quorum).toBe("1000000000000");
  });

  it("serializes threshold as string", async () => {
    mockProposalFindMany.mockResolvedValue([proposalWithBigInt]);
    mockProposalCount.mockResolvedValue(1);

    const res = await request(app).get("/api/governance/proposals");
    expect(res.status).toBe(200);
    assertNumericString(res.body.data.proposals[0].threshold, "threshold");
  });

  it("serializes vote weight as string", async () => {
    mockProposalFindMany.mockResolvedValue([proposalWithBigInt]);
    mockProposalCount.mockResolvedValue(1);

    const res = await request(app).get("/api/governance/proposals");
    expect(res.status).toBe(200);
    const vote = res.body.data.proposals[0].votes[0];
    assertNumericString(vote.weight, "vote.weight");
    expect(vote.weight).toBe("100000000000");
  });

  it("does not throw when BigInt values exceed Number.MAX_SAFE_INTEGER", async () => {
    const largeProposal = {
      ...proposalWithBigInt,
      quorum: BigInt("99999999999999999999"),
      threshold: BigInt("51000000000000000000"),
    };
    mockProposalFindMany.mockResolvedValue([largeProposal]);
    mockProposalCount.mockResolvedValue(1);

    const res = await request(app).get("/api/governance/proposals");
    expect(res.status).toBe(200);
    expect(res.body.data.proposals[0].quorum).toBe("99999999999999999999");
  });

  it("response body contains no raw BigInt values", async () => {
    mockProposalFindMany.mockResolvedValue([proposalWithBigInt]);
    mockProposalCount.mockResolvedValue(1);

    const res = await request(app).get("/api/governance/proposals");
    expect(res.status).toBe(200);
    expect(() => assertNoBigInt(res.body)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-route consistency — numeric fields are always strings
// ---------------------------------------------------------------------------

describe("BigInt Serialization — Cross-Route Consistency", () => {
  let prisma: any;

  beforeEach(async () => {
    const prismaModule = await import("../lib/prisma");
    prisma = prismaModule.prisma;
    vi.clearAllMocks();
  });

  it("token totalSupply is always a string regardless of BigInt magnitude", async () => {
    const magnitudes = [
      BigInt("0"),
      BigInt("1"),
      BigInt("1000000000"),
      BigInt("9007199254740993"), // > MAX_SAFE_INTEGER
    ];

    for (let i = 0; i < magnitudes.length; i++) {
      const supply = magnitudes[i];
      vi.clearAllMocks();
      prisma.token.findMany.mockResolvedValue([
        {
          id: "tok-x",
          address: "GTOKEN",
          creator: "GCREATOR",
          name: "T",
          symbol: "T",
          decimals: 7,
          totalSupply: supply,
          initialSupply: supply,
          totalBurned: BigInt("0"),
          burnCount: 0,
          metadataUri: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      prisma.token.count.mockResolvedValue(1);

      // Use unique query param per iteration to bypass the in-memory cache
      const res = await request(app).get(`/api/tokens/search?q=magnitude-test-${i}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.data[0].totalSupply).toBe("string");
      expect(res.body.data[0].totalSupply).toBe(supply.toString());
    }
  });

  it("frontend can parse serialized numeric fields without precision loss", async () => {
    const bigSupply = BigInt("9007199254740993");
    prisma.token.findMany.mockResolvedValue([
      {
        id: "tok-x",
        address: "GTOKEN",
        creator: "GCREATOR",
        name: "T",
        symbol: "T",
        decimals: 7,
        totalSupply: bigSupply,
        initialSupply: BigInt("1000"),
        totalBurned: BigInt("0"),
        burnCount: 0,
        metadataUri: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prisma.token.count.mockResolvedValue(1);

    const res = await request(app).get("/api/tokens/search?q=frontend-parse-test");
    expect(res.status).toBe(200);

    // Frontend parses the JSON string — BigInt(string) should round-trip correctly
    const parsed = BigInt(res.body.data[0].totalSupply);
    expect(parsed).toBe(bigSupply);
  });
});
