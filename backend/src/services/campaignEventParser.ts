import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface CampaignEvent {
  campaignId: number;
  tokenId: string;
  creator: string;
  type: "BUYBACK" | "AIRDROP" | "LIQUIDITY";
  targetAmount: bigint;
  startTime: Date;
  endTime?: Date;
  metadata?: string;
  txHash: string;
}

export interface CampaignExecutionEvent {
  campaignId: number;
  executor: string;
  amount: bigint;
  recipient?: string;
  txHash: string;
  executedAt: Date;
}

export interface CampaignStatusEvent {
  campaignId: number;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  txHash: string;
}

export class CampaignEventParser {
  async parseCampaignCreated(event: CampaignEvent) {
    await prisma.campaign.upsert({
      where: { campaignId: event.campaignId },
      create: {
        campaignId: event.campaignId,
        tokenId: event.tokenId,
        creator: event.creator,
        type: event.type,
        status: "ACTIVE",
        targetAmount: event.targetAmount,
        currentAmount: BigInt(0),
        executionCount: 0,
        startTime: event.startTime,
        endTime: event.endTime,
        metadata: event.metadata,
        txHash: event.txHash,
      },
      update: {},
    });
  }

  async parseCampaignExecution(event: CampaignExecutionEvent) {
    const campaign = await prisma.campaign.findUnique({
      where: { campaignId: event.campaignId },
    });

    if (!campaign) {
      throw new Error(`Campaign ${event.campaignId} not found`);
    }

    // Idempotency: skip if already processed
    const existingExecution = await prisma.campaignExecution.findUnique({
      where: { txHash: event.txHash },
    });

    if (existingExecution) {
      return;
    }

    await prisma.$transaction([
      prisma.campaignExecution.create({
        data: {
          campaignId: campaign.id,
          executor: event.executor,
          amount: event.amount,
          recipient: event.recipient,
          txHash: event.txHash,
          executedAt: event.executedAt,
        },
      }),
      prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          currentAmount: { increment: event.amount },
          executionCount: { increment: 1 },
          updatedAt: new Date(),
        },
      }),
    ]);
  }

  async parseCampaignStatusChange(event: CampaignStatusEvent) {
    const campaign = await prisma.campaign.findUnique({
      where: { campaignId: event.campaignId },
    });

    if (!campaign) {
      throw new Error(`Campaign ${event.campaignId} not found`);
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: event.status,
      updatedAt: now,
    };

    if (event.status === "COMPLETED") {
      updateData.completedAt = now;
    } else if (event.status === "CANCELLED") {
      updateData.cancelledAt = now;
    } else if (event.status === "PAUSED") {
      updateData.pausedAt = now;
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: updateData,
    });
  }
}

export const campaignEventParser = new CampaignEventParser();
