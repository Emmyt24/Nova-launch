import { Router } from "express";
import { campaignProjectionService } from "../services/campaignProjectionService";
import {
  validateCampaignCreate,
  validateCampaignId,
  validateCampaignExecutionQuery,
} from "../middleware/validation";

const router = Router();

// Public route contract: all paths are relative to the /api/campaigns mount point.
// Response shapes are defined in ../contracts/apiSchemas.ts.

/** Serializes BigInt fields in a campaign projection to strings for JSON output. */
function serializeCampaign(c: any) {
  return {
    ...c,
    targetAmount: c.targetAmount?.toString?.() ?? c.targetAmount,
    currentAmount: c.currentAmount?.toString?.() ?? c.currentAmount,
  };
}

/** Serializes BigInt fields in campaign stats to strings for JSON output. */
function serializeCampaignStats(s: any) {
  return {
    ...s,
    totalVolume: s.totalVolume?.toString?.() ?? s.totalVolume,
  };
}

/** @contract CampaignStats */
router.get("/stats/:tokenId?", async (req, res) => {
  try {
    const { tokenId } = req.params;
    const stats = await campaignProjectionService.getCampaignStats(tokenId);
    res.json(serializeCampaignStats(stats));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaign stats" });
  }
});

/** @contract CampaignRecord[] */
router.get("/token/:tokenId", async (req, res) => {
  try {
    const { tokenId } = req.params;
    const campaigns = await campaignProjectionService.getCampaignsByToken(tokenId);
    res.json(campaigns.map(serializeCampaign));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

/** @contract CampaignRecord[] */
router.get("/creator/:creator", async (req, res) => {
  try {
    const { creator } = req.params;
    const campaigns = await campaignProjectionService.getCampaignsByCreator(creator);
    res.json(campaigns.map(serializeCampaign));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

/** @contract CampaignExecutionsResponse */
router.get("/:campaignId/executions", validateCampaignExecutionQuery, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await campaignProjectionService.getExecutionHistory(
      campaignId,
      limit,
      offset
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch execution history" });
  }
});

/** @contract CampaignRecord */
router.get("/:campaignId", validateCampaignId, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const campaign = await campaignProjectionService.getCampaignById(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json(serializeCampaign(campaign));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

/**
 * POST /api/campaigns
 * Create a new campaign. Validated by validateCampaignCreate middleware.
 * @contract CampaignRecord
 */
router.post("/", validateCampaignCreate, async (req, res) => {
  try {
    const { tokenId, creator, type, targetAmount, startTime, endTime, metadata, txHash } = req.body;

    const event = {
      campaignId: Date.now(), // placeholder — real ID comes from on-chain event
      tokenId,
      creator,
      type,
      targetAmount: BigInt(targetAmount),
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : undefined,
      metadata,
      txHash: txHash ?? "",
    };

    const { campaignEventParser } = await import("../services/campaignEventParser");
    await campaignEventParser.parseCampaignCreated(event);

    res.status(201).json({ success: true, message: "Campaign created" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

export default router;
