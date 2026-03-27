import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

// ── In-memory stores ─────────────────────────────────────────────────────────
const mockCampaigns = new Map<number, any>();
const mockExecutions = new Map<string, any>();

const mockPrisma = {
  campaign: {
    upsert: vi.fn(async ({ where, create }: any) => {
      if (!mockCampaigns.has(where.campaignId)) {
        const c = { ...create, id: `campaign-${where.campaignId}`, updatedAt: new Date() };
        mockCampaigns.set(where.campaignId, c);
      }
      return mockCampaigns.get(where.campaignId);
    }),
    findUnique: vi.fn(async ({ where }: any) =>
      mockCampaigns.get(where.campaignId) ?? null
    ),
    findMany: vi.fn(async ({ where }: any = {}) => {
      const all = Array.from(mockCampaigns.values());
      if (where?.status) return all.filter((c) => c.status === where.status);
      return all;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      // Support lookup by id or campaignId
      let campaign: any;
      if (where.id) {
        campaign = Array.from(mockCampaigns.values()).find((c) => c.id === where.id);
      } else {
        campaign = mockCampaigns.get(where.campaignId);
      }
      if (!campaign) throw new Error("Campaign not found");

      if (data.currentAmount?.increment)
        campaign.currentAmount = (campaign.currentAmount ?? BigInt(0)) + data.currentAmount.increment;
      if (data.executionCount?.increment)
        campaign.executionCount = (campaign.executionCount ?? 0) + data.executionCount.increment;
      if (data.status) campaign.status = data.status;
      if (data.completedAt) campaign.completedAt = data.completedAt;
      if (data.cancelledAt) campaign.cancelledAt = data.cancelledAt;
      if (data.pausedAt) campaign.pausedAt = data.pausedAt;
      campaign.updatedAt = data.updatedAt ?? new Date();
      return campaign;
    }),
    count: vi.fn(async ({ where }: any = {}) => {
      const all = Array.from(mockCampaigns.values());
      if (where?.status) return all.filter((c) => c.status === where.status).length;
      return all.length;
    }),
    aggregate: vi.fn(async () => ({
      _sum: { currentAmount: BigInt(0), executionCount: 0 },
    })),
  },
  campaignExecution: {
    create: vi.fn(async ({ data }: any) => {
      const exec = { ...data, id: `exec-${data.txHash}` };
      mockExecutions.set(data.txHash, exec);
      return exec;
    }),
    findUnique: vi.fn(async ({ where }: any) =>
      mockExecutions.get(where.txHash) ?? null
    ),
    findMany: vi.fn(async () => Array.from(mockExecutions.values())),
    count: vi.fn(async () => mockExecutions.size),
  },
  $transaction: vi.fn(async (ops: any[]) => {
    const results = [];
    for (const op of ops) results.push(await op);
    return results;
  }),
};

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// ── Imports after mock ────────────────────────────────────────────────────────
let parser: any;
let projectionService: any;

beforeAll(async () => {
  const { CampaignEventParser } = await import(
    "../services/campaignEventParser"
  );
  const { CampaignProjectionService } = await import(
    "../services/campaignProjectionService"
  );
  parser = new CampaignEventParser();
  projectionService = new CampaignProjectionService();
});

beforeEach(() => {
  mockCampaigns.clear();
  mockExecutions.clear();
  vi.clearAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────
const baseCreate = {
  campaignId: 1,
  tokenId: "CTOKEN123",
  creator: "GCREATOR",
  type: "BUYBACK" as const,
  targetAmount: BigInt(1_000_000),
  startTime: new Date("2026-01-01T00:00:00Z"),
  txHash: "tx-create-1",
};

const baseExec = (txHash: string, amount = BigInt(200_000)) => ({
  campaignId: 1,
  executor: "GEXECUTOR",
  amount,
  txHash,
  executedAt: new Date(),
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Campaign Projection Ingestion", () => {
  it("campaign-created event inserts a projection", async () => {
    await parser.parseCampaignCreated(baseCreate);

    const projection = await projectionService.getCampaignById(1);
    expect(projection).not.toBeNull();
    expect(projection.campaignId).toBe(1);
    expect(projection.status).toBe("ACTIVE");
    expect(projection.currentAmount).toBe(BigInt(0));
    expect(projection.executionCount).toBe(0);
  });

  it("step execution updates currentAmount and executionCount", async () => {
    await parser.parseCampaignCreated(baseCreate);
    await parser.parseCampaignExecution(baseExec("tx-exec-1", BigInt(300_000)));
    await parser.parseCampaignExecution(baseExec("tx-exec-2", BigInt(200_000)));

    const projection = await projectionService.getCampaignById(1);
    expect(projection.currentAmount).toBe(BigInt(500_000));
    expect(projection.executionCount).toBe(2);
    expect(projection.progress).toBe(50);
  });

  it("COMPLETED status sets completedAt on projection", async () => {
    await parser.parseCampaignCreated(baseCreate);
    await parser.parseCampaignStatusChange({ campaignId: 1, status: "COMPLETED", txHash: "tx-s1" });

    const projection = await projectionService.getCampaignById(1);
    expect(projection.status).toBe("COMPLETED");
    expect(projection.completedAt).toBeInstanceOf(Date);
  });

  it("CANCELLED status sets cancelledAt on projection", async () => {
    await parser.parseCampaignCreated(baseCreate);
    await parser.parseCampaignStatusChange({ campaignId: 1, status: "CANCELLED", txHash: "tx-s2" });

    const projection = await projectionService.getCampaignById(1);
    expect(projection.status).toBe("CANCELLED");
    expect(projection.cancelledAt).toBeInstanceOf(Date);
  });

  it("PAUSED status sets pausedAt on projection", async () => {
    await parser.parseCampaignCreated(baseCreate);
    await parser.parseCampaignStatusChange({ campaignId: 1, status: "PAUSED", txHash: "tx-s3" });

    const projection = await projectionService.getCampaignById(1);
    expect(projection.status).toBe("PAUSED");
    expect(projection.pausedAt).toBeInstanceOf(Date);
  });

  it("replayed events do not duplicate execution rows", async () => {
    await parser.parseCampaignCreated(baseCreate);

    const exec = baseExec("tx-exec-dup");
    await parser.parseCampaignExecution(exec);
    await parser.parseCampaignExecution(exec); // replay
    await parser.parseCampaignExecution(exec); // replay again

    expect(mockExecutions.size).toBe(1);
    const projection = await projectionService.getCampaignById(1);
    expect(projection.executionCount).toBe(1);
    expect(projection.currentAmount).toBe(BigInt(200_000));
  });

  it("replayed full event stream produces identical projection", async () => {
    const events = [
      () => parser.parseCampaignCreated(baseCreate),
      () => parser.parseCampaignExecution(baseExec("tx-r1", BigInt(100_000))),
      () => parser.parseCampaignExecution(baseExec("tx-r2", BigInt(150_000))),
      () => parser.parseCampaignStatusChange({ campaignId: 1, status: "COMPLETED", txHash: "tx-r3" }),
    ];

    for (const e of events) await e();
    const first = await projectionService.getCampaignById(1);

    for (const e of events) await e(); // replay
    const second = await projectionService.getCampaignById(1);

    expect(second.currentAmount).toBe(first.currentAmount);
    expect(second.executionCount).toBe(first.executionCount);
    expect(second.status).toBe(first.status);
    expect(mockExecutions.size).toBe(2);
  });

  it("getActiveCampaigns returns only ACTIVE campaigns", async () => {
    await parser.parseCampaignCreated({ ...baseCreate, campaignId: 1, txHash: "tx-a1" });
    await parser.parseCampaignCreated({ ...baseCreate, campaignId: 2, txHash: "tx-a2" });
    await parser.parseCampaignStatusChange({ campaignId: 2, status: "COMPLETED", txHash: "tx-a3" });

    const active = await projectionService.getActiveCampaigns();
    expect(active.every((c: any) => c.status === "ACTIVE")).toBe(true);
    expect(active.length).toBe(1);
    expect(active[0].campaignId).toBe(1);
  });
});
