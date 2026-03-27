import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { TokenEventParser, RawTokenEvent } from "../services/tokenEventParser";

const TOKEN_ADDRESS = "CTOKEN_TEST_PROJECTION_001";
const CREATOR = "GCREATOR_TEST_001";
const TX_CREATE = "tx-token-create-001";
const TX_BURN_1 = "tx-burn-self-001";
const TX_BURN_ADMIN = "tx-burn-admin-001";

const tokenCreatedEvent: RawTokenEvent = {
  type: "tok_reg",
  tokenAddress: TOKEN_ADDRESS,
  transactionHash: TX_CREATE,
  ledger: 1000,
  creator: CREATOR,
  name: "Test Token",
  symbol: "TTK",
  decimals: 7,
  initialSupply: "1000000000000",
};

const selfBurnEvent: RawTokenEvent = {
  type: "tok_burn",
  tokenAddress: TOKEN_ADDRESS,
  transactionHash: TX_BURN_1,
  ledger: 1001,
  from: "GUSER_001",
  amount: "100000000",
  burner: "GUSER_001",
};

const adminBurnEvent: RawTokenEvent = {
  type: "adm_burn",
  tokenAddress: TOKEN_ADDRESS,
  transactionHash: TX_BURN_ADMIN,
  ledger: 1002,
  from: "GUSER_002",
  amount: "200000000",
  admin: CREATOR,
};

const metadataEvent: RawTokenEvent = {
  type: "tok_meta",
  tokenAddress: TOKEN_ADDRESS,
  transactionHash: "tx-meta-001",
  ledger: 1003,
  metadataUri: "ipfs://QmTest123",
  updatedBy: CREATOR,
};

describe("TokenEventParser integration", () => {
  let prisma: PrismaClient;
  let parser: TokenEventParser;

  beforeEach(async () => {
    prisma = new PrismaClient();
    parser = new TokenEventParser(prisma);

    // Clean up in dependency order
    await prisma.burnRecord.deleteMany({ where: { token: { address: TOKEN_ADDRESS } } });
    await prisma.token.deleteMany({ where: { address: TOKEN_ADDRESS } });
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it("inserts a token row on tok_reg event", async () => {
    await parser.parseEvent(tokenCreatedEvent);

    const token = await prisma.token.findUnique({ where: { address: TOKEN_ADDRESS } });
    expect(token).not.toBeNull();
    expect(token?.creator).toBe(CREATOR);
    expect(token?.name).toBe("Test Token");
    expect(token?.symbol).toBe("TTK");
    expect(token?.decimals).toBe(7);
    expect(token?.initialSupply).toBe(BigInt("1000000000000"));
    expect(token?.totalSupply).toBe(BigInt("1000000000000"));
    expect(token?.totalBurned).toBe(BigInt(0));
    expect(token?.burnCount).toBe(0);
  });

  it("increments totalBurned and burnCount on self-burn", async () => {
    await parser.parseEvent(tokenCreatedEvent);
    await parser.parseEvent(selfBurnEvent);

    const token = await prisma.token.findUnique({ where: { address: TOKEN_ADDRESS } });
    expect(token?.totalBurned).toBe(BigInt("100000000"));
    expect(token?.burnCount).toBe(1);
    expect(token?.totalSupply).toBe(BigInt("1000000000000") - BigInt("100000000"));

    const record = await prisma.burnRecord.findUnique({ where: { txHash: TX_BURN_1 } });
    expect(record).not.toBeNull();
    expect(record?.isAdminBurn).toBe(false);
    expect(record?.from).toBe("GUSER_001");
  });

  it("increments totalBurned and burnCount on admin-burn", async () => {
    await parser.parseEvent(tokenCreatedEvent);
    await parser.parseEvent(adminBurnEvent);

    const token = await prisma.token.findUnique({ where: { address: TOKEN_ADDRESS } });
    expect(token?.totalBurned).toBe(BigInt("200000000"));
    expect(token?.burnCount).toBe(1);

    const record = await prisma.burnRecord.findUnique({ where: { txHash: TX_BURN_ADMIN } });
    expect(record?.isAdminBurn).toBe(true);
    expect(record?.burnedBy).toBe(CREATOR);
  });

  it("updates metadataUri on tok_meta event", async () => {
    await parser.parseEvent(tokenCreatedEvent);
    await parser.parseEvent(metadataEvent);

    const token = await prisma.token.findUnique({ where: { address: TOKEN_ADDRESS } });
    expect(token?.metadataUri).toBe("ipfs://QmTest123");
  });

  it("replaying tok_reg does not double-apply (idempotent)", async () => {
    await parser.parseEvent(tokenCreatedEvent);
    await parser.parseEvent(tokenCreatedEvent); // replay

    const count = await prisma.token.count({ where: { address: TOKEN_ADDRESS } });
    expect(count).toBe(1);
  });

  it("replaying a burn event does not double-apply (idempotent)", async () => {
    await parser.parseEvent(tokenCreatedEvent);
    await parser.parseEvent(selfBurnEvent);
    await parser.parseEvent(selfBurnEvent); // replay

    const token = await prisma.token.findUnique({ where: { address: TOKEN_ADDRESS } });
    expect(token?.burnCount).toBe(1);
    expect(token?.totalBurned).toBe(BigInt("100000000"));

    const records = await prisma.burnRecord.findMany({
      where: { token: { address: TOKEN_ADDRESS } },
    });
    expect(records).toHaveLength(1);
  });

  it("accumulates multiple distinct burns correctly", async () => {
    await parser.parseEvent(tokenCreatedEvent);
    await parser.parseEvent(selfBurnEvent);
    await parser.parseEvent(adminBurnEvent);

    const token = await prisma.token.findUnique({ where: { address: TOKEN_ADDRESS } });
    expect(token?.burnCount).toBe(2);
    expect(token?.totalBurned).toBe(BigInt("300000000"));
  });
});
