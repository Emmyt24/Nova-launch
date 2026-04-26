-- CreateEnum
CREATE TYPE "DividendPoolStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');

-- CreateTable: DividendPool
CREATE TABLE "DividendPool" (
    "id"             TEXT NOT NULL,
    "tokenId"        TEXT NOT NULL,
    "fundedBy"       TEXT NOT NULL,
    "totalAmount"    BIGINT NOT NULL,
    "claimedAmount"  BIGINT NOT NULL DEFAULT 0,
    "supplySnapshot" BIGINT NOT NULL,
    "perHolderCap"   BIGINT NOT NULL DEFAULT 0,
    "expiresAt"      TIMESTAMP(3),
    "status"         "DividendPoolStatus" NOT NULL DEFAULT 'ACTIVE',
    "txHash"         TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DividendPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable: HolderSnapshot
CREATE TABLE "HolderSnapshot" (
    "id"        TEXT NOT NULL,
    "poolId"    TEXT NOT NULL,
    "holder"    TEXT NOT NULL,
    "balance"   BIGINT NOT NULL,
    "claimable" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolderSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DividendClaim
CREATE TABLE "DividendClaim" (
    "id"        TEXT NOT NULL,
    "poolId"    TEXT NOT NULL,
    "claimant"  TEXT NOT NULL,
    "amount"    BIGINT NOT NULL,
    "txHash"    TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DividendClaim_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "DividendPool"    ADD CONSTRAINT "DividendPool_txHash_key"    UNIQUE ("txHash");
ALTER TABLE "HolderSnapshot"  ADD CONSTRAINT "HolderSnapshot_poolId_holder_key" UNIQUE ("poolId", "holder");
ALTER TABLE "DividendClaim"   ADD CONSTRAINT "DividendClaim_txHash_key"   UNIQUE ("txHash");

-- Indexes
CREATE INDEX "DividendPool_tokenId_idx"  ON "DividendPool"("tokenId");
CREATE INDEX "DividendPool_fundedBy_idx" ON "DividendPool"("fundedBy");
CREATE INDEX "DividendPool_status_idx"   ON "DividendPool"("status");
CREATE INDEX "DividendPool_createdAt_idx" ON "DividendPool"("createdAt");

CREATE INDEX "HolderSnapshot_poolId_idx"  ON "HolderSnapshot"("poolId");
CREATE INDEX "HolderSnapshot_holder_idx"  ON "HolderSnapshot"("holder");

CREATE INDEX "DividendClaim_poolId_idx"   ON "DividendClaim"("poolId");
CREATE INDEX "DividendClaim_claimant_idx" ON "DividendClaim"("claimant");
CREATE INDEX "DividendClaim_claimedAt_idx" ON "DividendClaim"("claimedAt");

-- Foreign keys
ALTER TABLE "DividendPool"   ADD CONSTRAINT "DividendPool_tokenId_fkey"   FOREIGN KEY ("tokenId")  REFERENCES "Token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HolderSnapshot" ADD CONSTRAINT "HolderSnapshot_poolId_fkey"  FOREIGN KEY ("poolId")   REFERENCES "DividendPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DividendClaim"  ADD CONSTRAINT "DividendClaim_poolId_fkey"   FOREIGN KEY ("poolId")   REFERENCES "DividendPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
