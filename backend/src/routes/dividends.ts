/**
 * Dividend Distribution API Routes
 *
 * POST   /api/dividends/pools          - Create a new dividend pool
 * GET    /api/dividends/pools          - List pools (filterable by tokenId, status)
 * GET    /api/dividends/pools/:poolId  - Get a single pool
 * DELETE /api/dividends/pools/:poolId  - Cancel a pool (funder only)
 * POST   /api/dividends/claim          - Claim dividends for a holder
 * GET    /api/dividends/claimable      - Check claimable amount for a holder
 */

import { Router, Request, Response } from "express";
import {
  createDividendPool,
  claimDividend,
  getHolderClaimable,
  listDividendPools,
  getDividendPool,
  cancelDividendPool,
  CreatePoolSchema,
  ClaimSchema,
  ListPoolsSchema,
} from "../services/dividendService";

const router = Router();

// ─── POST /api/dividends/pools ─────────────────────────────────────────────

/**
 * Create a new dividend pool.
 * Body: CreatePoolInput (see dividendService.ts)
 */
router.post("/pools", async (req: Request, res: Response) => {
  const parsed = CreatePoolSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: parsed.error.errors,
    });
  }

  try {
    const pool = await createDividendPool(parsed.data);
    return res.status(201).json({ success: true, data: pool });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

// ─── GET /api/dividends/pools ──────────────────────────────────────────────

/**
 * List dividend pools.
 * Query: tokenId?, status?, page?, limit?
 */
router.get("/pools", async (req: Request, res: Response) => {
  const parsed = ListPoolsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: parsed.error.errors,
    });
  }

  try {
    const result = await listDividendPools(parsed.data);
    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ success: false, error: message });
  }
});

// ─── GET /api/dividends/pools/:poolId ─────────────────────────────────────

router.get("/pools/:poolId", async (req: Request, res: Response) => {
  try {
    const pool = await getDividendPool(req.params.poolId);
    return res.json({ success: true, data: pool });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

// ─── DELETE /api/dividends/pools/:poolId ──────────────────────────────────

/**
 * Cancel a pool. Only the original funder can cancel.
 * Body: { requestedBy: string }
 */
router.delete("/pools/:poolId", async (req: Request, res: Response) => {
  const { requestedBy } = req.body as { requestedBy?: string };
  if (!requestedBy) {
    return res
      .status(400)
      .json({ success: false, error: "requestedBy is required" });
  }

  try {
    const pool = await cancelDividendPool(req.params.poolId, requestedBy);
    return res.json({ success: true, data: pool });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("not found")
      ? 404
      : message.includes("Only")
        ? 403
        : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

// ─── POST /api/dividends/claim ────────────────────────────────────────────

/**
 * Claim dividends for a holder.
 * Body: ClaimInput (poolId, claimant, txHash)
 */
router.post("/claim", async (req: Request, res: Response) => {
  const parsed = ClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: parsed.error.errors,
    });
  }

  try {
    const claim = await claimDividend(parsed.data);
    return res.status(201).json({ success: true, data: claim });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("not found")
      ? 404
      : message.includes("already claimed") || message.includes("not active")
        ? 409
        : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

// ─── GET /api/dividends/claimable ─────────────────────────────────────────

/**
 * Check claimable amount for a holder in a pool.
 * Query: poolId, claimant
 */
router.get("/claimable", async (req: Request, res: Response) => {
  const { poolId, claimant } = req.query as {
    poolId?: string;
    claimant?: string;
  };

  if (!poolId || !claimant) {
    return res
      .status(400)
      .json({ success: false, error: "poolId and claimant are required" });
  }

  try {
    const info = await getHolderClaimable(poolId, claimant);
    return res.json({ success: true, data: info });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("No snapshot") ? 404 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

export default router;
