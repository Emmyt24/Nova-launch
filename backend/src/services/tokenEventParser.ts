import { PrismaClient } from "@prisma/client";

export interface RawTokenEvent {
  type: "tok_reg" | "tok_burn" | "adm_burn" | "tok_meta";
  tokenAddress: string;
  transactionHash: string;
  ledger: number;
  // tok_reg fields
  creator?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  initialSupply?: string;
  // burn fields
  from?: string;
  amount?: string;
  burner?: string;
  admin?: string;
  // metadata fields
  metadataUri?: string;
  updatedBy?: string;
}

export class TokenEventParser {
  constructor(private readonly prisma: PrismaClient) {}

  async parseEvent(event: RawTokenEvent): Promise<void> {
    switch (event.type) {
      case "tok_reg":
        await this.handleTokenCreated(event);
        break;
      case "tok_burn":
        await this.handleBurn(event, false);
        break;
      case "adm_burn":
        await this.handleBurn(event, true);
        break;
      case "tok_meta":
        await this.handleMetadataUpdate(event);
        break;
    }
  }

  private async handleTokenCreated(event: RawTokenEvent): Promise<void> {
    const initialSupply = BigInt(event.initialSupply ?? "0");

    await this.prisma.token.upsert({
      where: { address: event.tokenAddress },
      create: {
        address: event.tokenAddress,
        creator: event.creator ?? "",
        name: event.name ?? "",
        symbol: event.symbol ?? "",
        decimals: event.decimals ?? 7,
        totalSupply: initialSupply,
        initialSupply,
      },
      update: {}, // idempotent — do not overwrite on replay
    });
  }

  private async handleBurn(
    event: RawTokenEvent,
    isAdminBurn: boolean
  ): Promise<void> {
    // Idempotency: txHash is unique on BurnRecord
    const existing = await this.prisma.burnRecord.findUnique({
      where: { txHash: event.transactionHash },
    });
    if (existing) return;

    const token = await this.prisma.token.findUnique({
      where: { address: event.tokenAddress },
    });
    if (!token) {
      console.warn(
        `TokenEventParser: burn for unknown token ${event.tokenAddress}, skipping`
      );
      return;
    }

    const amount = BigInt(event.amount ?? "0");

    await this.prisma.$transaction([
      this.prisma.burnRecord.create({
        data: {
          tokenId: token.id,
          from: event.from ?? "",
          amount,
          burnedBy: isAdminBurn
            ? (event.admin ?? event.from ?? "")
            : (event.burner ?? event.from ?? ""),
          isAdminBurn,
          txHash: event.transactionHash,
        },
      }),
      this.prisma.token.update({
        where: { id: token.id },
        data: {
          totalBurned: { increment: amount },
          burnCount: { increment: 1 },
          totalSupply: { decrement: amount },
        },
      }),
    ]);
  }

  private async handleMetadataUpdate(event: RawTokenEvent): Promise<void> {
    await this.prisma.token.updateMany({
      where: { address: event.tokenAddress },
      data: { metadataUri: event.metadataUri ?? null },
    });
  }
}
