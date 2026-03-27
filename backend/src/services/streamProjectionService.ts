import { PrismaClient, StreamStatus } from "@prisma/client";
import { performance } from "perf_hooks";

const prisma = new PrismaClient();

export interface StreamProjection {
  id: string;
  streamId: number;
  creator: string;
  recipient: string;
  amount: string;
  metadata?: string;
  status: StreamStatus;
  txHash: string;
  createdAt: Date;
  claimedAt?: Date;
  cancelledAt?: Date;
}

export interface StreamStats {
  totalStreams: number;
  activeStreams: number;
  claimedVolume: string;
  cancelledVolume: string;
}

export class StreamProjectionService {
  async getStreamById(streamId: number): Promise<StreamProjection | null> {
    const start = performance.now();
    const stream = await prisma.stream.findUnique({
      where: { streamId },
    });
    const duration = performance.now() - start;
    if (duration > 100) {
      console.warn(`[PERF] getStreamById took ${duration.toFixed(2)}ms`);
    }

    if (!stream) return null;

    return this.buildProjection(stream);
  }

  async getStreamsByCreator(creator: string): Promise<StreamProjection[]> {
    const streams = await prisma.stream.findMany({
      where: { creator },
      orderBy: { createdAt: "desc" },
    });

    return streams.map((s) => this.buildProjection(s));
  }

  async getStreamsByRecipient(recipient: string): Promise<StreamProjection[]> {
    const streams = await prisma.stream.findMany({
      where: { recipient },
      orderBy: { createdAt: "desc" },
    });

    return streams.map((s) => this.buildProjection(s));
  }

  async getStreamStats(address?: string): Promise<StreamStats> {
    const where: any = address ? { OR: [{ creator: address }, { recipient: address }] } : {};

    const [totalStreams, activeStreams, claimedStreams, cancelledStreams] = await Promise.all([
      prisma.stream.count({ where }),
      prisma.stream.count({ where: { ...where, status: StreamStatus.CREATED } }),
      prisma.stream.findMany({ where: { ...where, status: StreamStatus.CLAIMED } }),
      prisma.stream.findMany({ where: { ...where, status: StreamStatus.CANCELLED } }),
    ]);

    const claimedVolume = claimedStreams
      .reduce((sum, s) => sum + s.amount, BigInt(0))
      .toString();
    
    const cancelledVolume = cancelledStreams
      .reduce((sum, s) => sum + s.amount, BigInt(0))
      .toString();

    return {
      totalStreams,
      activeStreams,
      claimedVolume,
      cancelledVolume,
    };
  }

  private buildProjection(stream: any): StreamProjection {
    return {
      id: stream.id,
      streamId: stream.streamId,
      creator: stream.creator,
      recipient: stream.recipient,
      amount: stream.amount.toString(),
      metadata: stream.metadata || undefined,
      status: stream.status,
      txHash: stream.txHash,
      createdAt: stream.createdAt,
      claimedAt: stream.claimedAt || undefined,
      cancelledAt: stream.cancelledAt || undefined,
    };
  }
}

export const streamProjectionService = new StreamProjectionService();
