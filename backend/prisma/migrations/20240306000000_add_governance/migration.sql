-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('PARAMETER_CHANGE', 'ADMIN_TRANSFER', 'TREASURY_SPEND', 'CONTRACT_UPGRADE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('ACTIVE', 'PASSED', 'REJECTED', 'EXECUTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "tokenId" TEXT NOT NULL,
    "proposer" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "proposalType" "ProposalType" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'ACTIVE',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "quorum" BIGINT NOT NULL,
    "threshold" BIGINT NOT NULL,
    "metadata" TEXT,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "voter" TEXT NOT NULL,
    "support" BOOLEAN NOT NULL,
    "weight" BIGINT NOT NULL,
    "reason" TEXT,
    "txHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalExecution" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "executor" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "returnData" TEXT,
    "gasUsed" BIGINT,
    "txHash" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_proposalId_key" ON "Proposal"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_txHash_key" ON "Proposal"("txHash");

-- CreateIndex
CREATE INDEX "Proposal_tokenId_idx" ON "Proposal"("tokenId");

-- CreateIndex
CREATE INDEX "Proposal_proposer_idx" ON "Proposal"("proposer");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "Proposal_startTime_idx" ON "Proposal"("startTime");

-- CreateIndex
CREATE INDEX "Proposal_endTime_idx" ON "Proposal"("endTime");

-- CreateIndex
CREATE INDEX "Proposal_createdAt_idx" ON "Proposal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_txHash_key" ON "Vote"("txHash");

-- CreateIndex
CREATE INDEX "Vote_proposalId_idx" ON "Vote"("proposalId");

-- CreateIndex
CREATE INDEX "Vote_voter_idx" ON "Vote"("voter");

-- CreateIndex
CREATE INDEX "Vote_timestamp_idx" ON "Vote"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_proposalId_voter_key" ON "Vote"("proposalId", "voter");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalExecution_txHash_key" ON "ProposalExecution"("txHash");

-- CreateIndex
CREATE INDEX "ProposalExecution_proposalId_idx" ON "ProposalExecution"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalExecution_executor_idx" ON "ProposalExecution"("executor");

-- CreateIndex
CREATE INDEX "ProposalExecution_executedAt_idx" ON "ProposalExecution"("executedAt");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalExecution" ADD CONSTRAINT "ProposalExecution_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
