import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compatibilityEnums,
  compatibilitySeedData,
  createCompatibilityHarness,
} from "./utils/seedIntegration";

function mockPrismaClientModule(prisma: any) {
  return {
    PrismaClient: vi.fn(() => prisma),
    Prisma: {},
    ProposalStatus: compatibilityEnums.ProposalStatus,
    ProposalType: compatibilityEnums.ProposalType,
    StreamStatus: compatibilityEnums.StreamStatus,
  };
}

async function loadDbModule(prisma: any) {
  vi.resetModules();
  vi.doMock("../lib/prisma", () => ({ prisma, default: prisma }));
  vi.doMock("@prisma/client", () => ({ Prisma: {} }));
  return import("../lib/db");
}

async function loadCampaignModules(prisma: any) {
  vi.resetModules();
  vi.doMock("@prisma/client", () => mockPrismaClientModule(prisma));
  const campaignEventParserModule =
    await import("../services/campaignEventParser");
  const campaignProjectionModule =
    await import("../services/campaignProjectionService");

  return {
    CampaignEventParser: campaignEventParserModule.CampaignEventParser,
    CampaignProjectionService:
      campaignProjectionModule.CampaignProjectionService,
  };
}

afterEach(() => {
  vi.doUnmock("../lib/prisma");
  vi.doUnmock("@prisma/client");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("migration upgrade compatibility", () => {
  it("preserves existing indexed token and campaign rows on populated-db upgrades", async () => {
    const { prisma, state } = createCompatibilityHarness("legacy-populated");
    const db = await loadDbModule(prisma);
    const { CampaignEventParser, CampaignProjectionService } =
      await loadCampaignModules(prisma);

    const existingToken = await db.getTokenByAddress(
      compatibilitySeedData.legacy.token.address
    );
    expect(existingToken?.name).toBe(compatibilitySeedData.legacy.token.name);
    expect(existingToken?.totalBurned).toBe(BigInt("5000"));

    await db.createBurnRecord({
      tokenId: existingToken.id,
      from: compatibilitySeedData.events.tokenBurn.from,
      amount: compatibilitySeedData.events.tokenBurn.amount,
      burnedBy: compatibilitySeedData.events.tokenBurn.burnedBy,
      isAdminBurn: compatibilitySeedData.events.tokenBurn.isAdminBurn,
      txHash: compatibilitySeedData.events.tokenBurn.txHash,
    });
    await db.updateTokenBurnStats(
      existingToken.id,
      compatibilitySeedData.events.tokenBurn.amount
    );
    await db.upsertDailyAnalytics(
      existingToken.id,
      compatibilitySeedData.legacy.analytics.date,
      compatibilitySeedData.events.tokenBurn.amount,
      3
    );

    const campaignParser = new CampaignEventParser();
    await campaignParser.parseCampaignExecution(
      compatibilitySeedData.events.campaign.execution
    );

    const projectionService = new CampaignProjectionService();
    const upgradedCampaign = await projectionService.getCampaignById(
      compatibilitySeedData.legacy.campaign.campaignId
    );

    expect(upgradedCampaign?.campaignId).toBe(
      compatibilitySeedData.legacy.campaign.campaignId
    );
    expect(upgradedCampaign?.targetAmount).toBe(BigInt("100000"));
    expect(upgradedCampaign?.currentAmount).toBe(BigInt("30000"));
    expect(upgradedCampaign?.executionCount).toBe(2);

    const upgradedToken = await db.getTokenByAddress(
      compatibilitySeedData.legacy.token.address
    );
    expect(upgradedToken?.address).toBe(
      compatibilitySeedData.legacy.token.address
    );
    expect(upgradedToken?.totalBurned).toBe(BigInt("7500"));
    expect(upgradedToken?.burnCount).toBe(3);

    expect(state.analytics).toHaveLength(1);
    expect(state.analytics[0].burnVolume).toBe(BigInt("7500"));
    expect(state.analytics[0].burnCount).toBe(3);
    expect(state.campaignExecutions).toHaveLength(2);
  });

  it("supports fresh setup writes without clean-db-only migration assumptions", async () => {
    const { prisma } = createCompatibilityHarness("empty");
    const db = await loadDbModule(prisma);
    const { CampaignEventParser, CampaignProjectionService } =
      await loadCampaignModules(prisma);

    const createdToken = await db.createToken(
      compatibilitySeedData.fresh.token
    );
    await db.upsertUser(compatibilitySeedData.fresh.token.creator);
    await db.createBurnRecord({
      tokenId: createdToken.id,
      from: compatibilitySeedData.events.tokenBurn.from,
      amount: compatibilitySeedData.events.tokenBurn.amount,
      burnedBy: compatibilitySeedData.events.tokenBurn.burnedBy,
      isAdminBurn: compatibilitySeedData.events.tokenBurn.isAdminBurn,
      txHash: `${compatibilitySeedData.events.tokenBurn.txHash}-fresh`,
    });
    await db.updateTokenBurnStats(
      createdToken.id,
      compatibilitySeedData.events.tokenBurn.amount
    );
    await db.upsertDailyAnalytics(
      createdToken.id,
      new Date("2026-03-16T00:00:00.000Z"),
      compatibilitySeedData.events.tokenBurn.amount,
      1
    );

    const campaignParser = new CampaignEventParser();
    await campaignParser.parseCampaignCreated(
      compatibilitySeedData.events.campaign.created
    );
    await campaignParser.parseCampaignExecution(
      compatibilitySeedData.events.campaign.executionFresh
    );

    const projectionService = new CampaignProjectionService();
    const freshCampaign = await projectionService.getCampaignById(
      compatibilitySeedData.events.campaign.created.campaignId
    );
    const campaignStats = await projectionService.getCampaignStats(
      compatibilitySeedData.events.campaign.created.tokenId
    );

    expect(freshCampaign?.currentAmount).toBe(BigInt("15000"));
    expect(freshCampaign?.executionCount).toBe(1);
    expect(freshCampaign?.progress).toBe(17);
    expect(campaignStats.totalCampaigns).toBe(1);
    expect(campaignStats.activeCampaigns).toBe(1);
    expect(campaignStats.totalVolume).toBe(BigInt("15000"));
    expect(campaignStats.totalExecutions).toBe(1);

    const freshToken = await db.getTokenByAddress(
      compatibilitySeedData.fresh.token.address
    );
    expect(freshToken?.metadataUri).toBe(
      compatibilitySeedData.fresh.token.metadataUri
    );
    expect(freshToken?.totalBurned).toBe(BigInt("2500"));
  });
});
