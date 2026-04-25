import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernanceEventMapper } from "../services/governanceEventMapper";
import { GovernanceEventParser } from "../services/governanceEventParser";
import { StreamEventParser } from "../services/streamEventParser";
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
  vi.doUnmock("@prisma/client");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("projection migration compatibility", () => {
  it("keeps seeded governance and analytics data readable while ingesters continue writing", async () => {
    const { prisma, state } = createCompatibilityHarness("legacy-populated");
    const governanceParser = new GovernanceEventParser(prisma as any);
    const streamParser = new StreamEventParser(prisma as any);
    const { CampaignEventParser } = await loadCampaignModules(prisma);

    await governanceParser.parseVoteCastEvent(
      compatibilitySeedData.events.governance.vote
    );
    await streamParser.parseMetadataUpdatedEvent(
      compatibilitySeedData.events.stream.metadataUpdated
    );

    const campaignParser = new CampaignEventParser();
    await campaignParser.parseCampaignStatusChange(
      compatibilitySeedData.events.campaign.paused
    );

    const proposal = await prisma.proposal.findUnique({
      where: { proposalId: compatibilitySeedData.legacy.proposal.proposalId },
      include: { votes: true },
    });
    const stream = await prisma.stream.findUnique({
      where: { streamId: compatibilitySeedData.legacy.stream.streamId },
    });
    const campaign = await prisma.campaign.findUnique({
      where: { campaignId: compatibilitySeedData.legacy.campaign.campaignId },
    });

    expect(proposal?.title).toBe(compatibilitySeedData.legacy.proposal.title);
    expect(proposal?.votes).toHaveLength(2);
    expect(proposal?.votes[0].reason).toBeNull();
    expect(proposal?.votes[1].reason).toBe("Needs more runway data");

    expect(stream?.amount).toBe(compatibilitySeedData.legacy.stream.amount);
    expect(stream?.metadata).toBe("ipfs://legacy-stream-upgraded");
    expect(campaign?.currentAmount).toBe(
      compatibilitySeedData.legacy.campaign.currentAmount
    );
    expect(campaign?.status).toBe("PAUSED");

    expect(state.analytics).toHaveLength(1);
    expect(state.analytics[0].burnVolume).toBe(
      compatibilitySeedData.legacy.analytics.burnVolume
    );
  });

  it("replays historical governance, campaign, and stream events against the rolled-forward schema", async () => {
    const { prisma } = createCompatibilityHarness("empty");
    const governanceMapper = new GovernanceEventMapper();
    const governanceParser = new GovernanceEventParser(prisma as any);
    const streamParser = new StreamEventParser(prisma as any);
    const { CampaignEventParser, CampaignProjectionService } =
      await loadCampaignModules(prisma);

    for (const rawEvent of compatibilitySeedData.events.rawGovernance) {
      const mapped = governanceMapper.mapEvent(rawEvent as any);
      expect(mapped).not.toBeNull();
      await governanceParser.parseEvent(mapped!);
    }

    await streamParser.parseCreatedEvent(
      compatibilitySeedData.events.stream.created
    );
    await streamParser.parseClaimedEvent(
      compatibilitySeedData.events.stream.claimed
    );

    const campaignParser = new CampaignEventParser();
    await campaignParser.parseCampaignCreated(
      compatibilitySeedData.events.campaign.created
    );
    await campaignParser.parseCampaignExecution(
      compatibilitySeedData.events.campaign.executionFresh
    );
    await campaignParser.parseCampaignStatusChange(
      compatibilitySeedData.events.campaign.completed
    );

    const proposalAnalytics = await governanceParser.getProposalAnalytics(7302);
    const replayStream = await prisma.stream.findUnique({
      where: { streamId: 8202 },
    });
    const replayProposal = await prisma.proposal.findUnique({
      where: { proposalId: 7302 },
      include: { votes: true, executions: true },
    });

    const projectionService = new CampaignProjectionService();
    const replayCampaign = await projectionService.getCampaignById(9102);

    expect(proposalAnalytics.totalVotes).toBe(1);
    expect(proposalAnalytics.votesFor).toBe("42000");
    expect(proposalAnalytics.status).toBe(
      compatibilityEnums.ProposalStatus.EXECUTED
    );
    expect(replayProposal?.metadata).toBe(JSON.stringify({ replay: true }));
    expect(replayProposal?.executions).toHaveLength(1);

    expect(replayStream?.status).toBe(compatibilityEnums.StreamStatus.CLAIMED);
    expect(replayStream?.metadata).toBe("ipfs://stream-replay-metadata");
    expect(replayStream?.claimedAt).toEqual(
      compatibilitySeedData.events.stream.claimed.timestamp
    );

    expect(replayCampaign?.status).toBe("COMPLETED");
    expect(replayCampaign?.currentAmount).toBe(BigInt("15000"));
    expect(replayCampaign?.executionCount).toBe(1);
    expect(replayCampaign?.completedAt).not.toBeNull();
  });
});
