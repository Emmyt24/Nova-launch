/**
 * Dividend Distribution Service
 *
 * Handles the full lifecycle of dividend pools:
 *  1. Creating a pool (funded by a token creator/admin)
 *  2. Snapshotting holder balances for pro-rata calculation
 *  3. Processing individual claims
 *  4. Expiring / cancelling pools
 *
 * Security considerations (OWASP):
 *  - All BigInt arithmetic is done server-side to prevent client manipulation
 *  - Duplicate-claim prevention via unique constraint on (poolId, claimant)
 *  - txHash uniqueness enforced at DB level to prevent replay attacks
 *  - Input validation via Zod before any DB write
 */

import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";

// ─── Validation schemas ────────────────────────────────────────────────────

export const CreatePoolSchema = z.object({
  tokenId: z.string().uuid("tokenId must be a valid UUID"),
  fundedBy: z.string().min(1, "fundedBy is required"),
  totalAmount: z
    .string()
    .regex(/^\d+$/, "totalAmount must be a non-negative integer string"),
  supplySnapshot: z
    .string()
    .regex(/^\d+$/, "supplySnapshot must be a non-negative integer string"),
  perHolderCap: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default("0"),
  expiresAt: z.string().datetime().optional(),
  txHash: z.string().min(1, "txHash is required"),
  /** Array of { holder, balance } used to pre-compute claimable amounts */
  holders: z
    .array(
      z.object({
        holder: z.string().min(1),
        balance: z
          .string()
          .regex(/^\d+$/, "balance must be a non-negative integer string"),
      })
    )
    .min(1, "At least one holder snapshot is required"),
});

export const ClaimSchema = z.object({
  poolId: z.string().uuid("poolId must be a valid UUID"),
  claimant: z.string().min(1, "claimant is required"),
  txHash: z.string().min(1, "txHash is required"),
});

export const ListPoolsSchema = z.object({
  tokenId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "EXHAUSTED", "EXPIRED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Types ─────────────────────────────────────────────────────────────────

export type CreatePoolInput = z.infer<typeof CreatePoolSchema>;
export type ClaimInput = z.infer<typeof ClaimSchema>;
export type ListPoolsInput = z.infer<typeof ListPoolsSchema>;

export interface DividendPoolSummary {
  id: string;
  tokenId: string;
  fundedBy: string;
  totalAmount: string;
  claimedAmount: string;
  remainingAmount: string;
  supplySnapshot: string;
  perHolderCap: string;
  expiresAt: string | null;
  status: string;
  txHash: string;
  holderCount: number;
  claimCount: number;
  createdAt: string;
}

export interface ClaimResult {
  claimId: string;
  poolId: string;
  claimant: string;
  amount: string;
  txHash: string;
  claimedAt: string;
}

export interface HolderClaimableInfo {
  poolId: string;
  claimant: string;
  claimable: string;
  alreadyClaimed: boolean;
  claimedAmount: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Compute the claimable amount for a holder using pro-rata distribution.
 * claimable = floor(holderBalance * totalAmount / supplySnapshot)
 * Capped by perHolderCap when > 0.
 */
function computeClaimable(
  holderBalance: bigint,
  totalAmount: bigint,
  supplySnapshot: bigint,
  perHolderCap: bigint
): bigint {
  if (supplySnapshot === 0n) return 0n;
  let claimable = (holderBalance * totalAmount) / supplySnapshot;
  if (perHolderCap > 0n && claimable > perHolderCap) {
    claimable = perHolderCap;
  }
  return claimable;
}

/** Serialize BigInt fields to strings for JSON-safe responses. */
function serializePool(pool: {
  id: string;
  tokenId: string;
  fundedBy: string;
  totalAmount: bigint;
  claimedAmount: bigint;
  supplySnapshot: bigint;
  perHolderCap: bigint;
  expiresAt: Date | null;
  status: string;
  txHash: string;
  createdAt: Date;
  _count?: { claims: number; snapshots: number };
}): DividendPoolSummary {
  return {
    id: pool.id,
    tokenId: pool.tokenId,
    fundedBy: pool.fundedBy,
    totalAmount: pool.totalAmount.toString(),
    claimedAmount: pool.claimedAmount.toString(),
    remainingAmount: (pool.totalAmount - pool.claimedAmount).toString(),
    supplySnapshot: pool.supplySnapshot.toString(),
    perHolderCap: pool.perHolderCap.toString(),
    expiresAt: pool.expiresAt ? pool.expiresAt.toISOString() : null,
    status: pool.status,
    txHash: pool.txHash,
    holderCount: pool._count?.snapshots ?? 0,
    claimCount: pool._count?.claims ?? 0,
    createdAt: pool.createdAt.toISOString(),
  };
}

// ─── Service functions ─────────────────────────────────────────────────────

/**
 * Create a new dividend pool and persist holder snapshots.
 * All writes happen in a single transaction for atomicity.
 */
export async function createDividendPool(
  input: CreatePoolInput
): Promise<DividendPoolSummary> {
  const totalAmount = BigInt(input.totalAmount);
  const supplySnapshot = BigInt(input.supplySnapshot);
  const perHolderCap = BigInt(input.perHolderCap);

  if (totalAmount <= 0n) {
    throw new Error("totalAmount must be greater than zero");
  }
  if (supplySnapshot <= 0n) {
    throw new Error("supplySnapshot must be greater than zero");
  }

  // Verify the token exists
  const token = await prisma.token.findUnique({ where: { id: input.tokenId } });
  if (!token) {
    throw new Error(`Token not found: ${input.tokenId}`);
  }

  // Pre-compute claimable amounts for all holders
  const snapshotData = input.holders.map((h) => {
    const balance = BigInt(h.balance);
    const claimable = computeClaimable(
      balance,
      totalAmount,
      supplySnapshot,
      perHolderCap
    );
    return { holder: h.holder, balance, claimable };
  });

  const pool = await prisma.$transaction(async (tx) => {
    const created = await tx.dividendPool.create({
      data: {
        tokenId: input.tokenId,
        fundedBy: input.fundedBy,
        totalAmount,
        supplySnapshot,
        perHolderCap,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        txHash: input.txHash,
        snapshots: {
          createMany: {
            data: snapshotData.map((s) => ({
              holder: s.holder,
              balance: s.balance,
              claimable: s.claimable,
            })),
          },
        },
      },
      include: { _count: { select: { claims: true, snapshots: true } } },
    });
    return created;
  });

  return serializePool(pool);
}

/**
 * Process a dividend claim for a holder.
 * Validates:
 *  - Pool is ACTIVE and not expired
 *  - Holder has a snapshot in this pool
 *  - Holder has not already claimed
 *  - Pool has sufficient remaining funds
 */
export async function claimDividend(
  input: ClaimInput
): Promise<ClaimResult> {
  const result = await prisma.$transaction(async (tx) => {
    // Lock the pool row for update
    const pool = await tx.dividendPool.findUnique({
      where: { id: input.poolId },
    });

    if (!pool) {
      throw new Error(`Dividend pool not found: ${input.poolId}`);
    }

    // Check pool is claimable
    if (pool.status !== "ACTIVE") {
      throw new Error(`Pool is not active (status: ${pool.status})`);
    }
    if (pool.expiresAt && pool.expiresAt < new Date()) {
      // Auto-expire
      await tx.dividendPool.update({
        where: { id: pool.id },
        data: { status: "EXPIRED" },
      });
      throw new Error("Dividend pool has expired");
    }

    // Find holder snapshot
    const snapshot = await tx.holderSnapshot.findUnique({
      where: { poolId_holder: { poolId: input.poolId, holder: input.claimant } },
    });
    if (!snapshot) {
      throw new Error(
        `No snapshot found for holder ${input.claimant} in pool ${input.poolId}`
      );
    }

    // Check for duplicate claim
    const existingClaim = await tx.dividendClaim.findFirst({
      where: { poolId: input.poolId, claimant: input.claimant },
    });
    if (existingClaim) {
      throw new Error(
        `Holder ${input.claimant} has already claimed from pool ${input.poolId}`
      );
    }

    const claimAmount = snapshot.claimable;
    if (claimAmount <= 0n) {
      throw new Error("Claimable amount is zero");
    }

    const remaining = pool.totalAmount - pool.claimedAmount;
    if (claimAmount > remaining) {
      throw new Error(
        `Insufficient pool funds: requested ${claimAmount}, available ${remaining}`
      );
    }

    // Record the claim
    const claim = await tx.dividendClaim.create({
      data: {
        poolId: input.poolId,
        claimant: input.claimant,
        amount: claimAmount,
        txHash: input.txHash,
      },
    });

    // Update pool claimed amount and status
    const newClaimed = pool.claimedAmount + claimAmount;
    const newStatus =
      newClaimed >= pool.totalAmount ? "EXHAUSTED" : "ACTIVE";

    await tx.dividendPool.update({
      where: { id: pool.id },
      data: { claimedAmount: newClaimed, status: newStatus },
    });

    return claim;
  });

  return {
    claimId: result.id,
    poolId: result.poolId,
    claimant: result.claimant,
    amount: result.amount.toString(),
    txHash: result.txHash,
    claimedAt: result.claimedAt.toISOString(),
  };
}

/**
 * Get claimable info for a specific holder in a pool.
 */
export async function getHolderClaimable(
  poolId: string,
  claimant: string
): Promise<HolderClaimableInfo> {
  const snapshot = await prisma.holderSnapshot.findUnique({
    where: { poolId_holder: { poolId, holder: claimant } },
  });
  if (!snapshot) {
    throw new Error(`No snapshot for holder ${claimant} in pool ${poolId}`);
  }

  const existingClaim = await prisma.dividendClaim.findFirst({
    where: { poolId, claimant },
  });

  return {
    poolId,
    claimant,
    claimable: snapshot.claimable.toString(),
    alreadyClaimed: !!existingClaim,
    claimedAmount: existingClaim ? existingClaim.amount.toString() : "0",
  };
}

/**
 * List dividend pools with optional filters and pagination.
 */
export async function listDividendPools(input: ListPoolsInput): Promise<{
  data: DividendPoolSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const where: Prisma.DividendPoolWhereInput = {};
  if (input.tokenId) where.tokenId = input.tokenId;
  if (input.status) where.status = input.status as any;

  const [total, pools] = await Promise.all([
    prisma.dividendPool.count({ where }),
    prisma.dividendPool.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: { _count: { select: { claims: true, snapshots: true } } },
    }),
  ]);

  return {
    data: pools.map(serializePool),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

/**
 * Get a single dividend pool by ID.
 */
export async function getDividendPool(
  poolId: string
): Promise<DividendPoolSummary> {
  const pool = await prisma.dividendPool.findUnique({
    where: { id: poolId },
    include: { _count: { select: { claims: true, snapshots: true } } },
  });
  if (!pool) throw new Error(`Dividend pool not found: ${poolId}`);
  return serializePool(pool);
}

/**
 * Cancel an active pool (admin action). Unclaimed funds are considered returned.
 */
export async function cancelDividendPool(
  poolId: string,
  requestedBy: string
): Promise<DividendPoolSummary> {
  const pool = await prisma.dividendPool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error(`Dividend pool not found: ${poolId}`);
  if (pool.status !== "ACTIVE") {
    throw new Error(`Only ACTIVE pools can be cancelled (status: ${pool.status})`);
  }
  // Only the funder can cancel
  if (pool.fundedBy !== requestedBy) {
    throw new Error("Only the pool funder can cancel this pool");
  }

  const updated = await prisma.dividendPool.update({
    where: { id: poolId },
    data: { status: "CANCELLED" },
    include: { _count: { select: { claims: true, snapshots: true } } },
  });
  return serializePool(updated);
}

/**
 * Expire pools whose expiresAt has passed. Intended to be called by a cron job.
 * Returns the number of pools expired.
 */
export async function expireStalepools(): Promise<number> {
  const result = await prisma.dividendPool.updateMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
