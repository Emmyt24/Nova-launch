import { Router } from "express";
import { z } from "zod";
import { Database } from "../../config/database";
import { authenticateAdmin, requireSuperAdmin } from "../../middleware/auth";
import { auditLog } from "../../middleware/auditLog";

const router = Router();

// Validation schemas
const tokenFilterSchema = z.object({
  flagged: z.enum(["true", "false"]).optional(),
  deleted: z.enum(["true", "false"]).optional(),
  creator: z.string().optional(),
  search: z.string().optional(),
});

const tokenUpdateSchema = z.object({
  flagged: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

// GET /api/admin/tokens - List all tokens with filters
router.get(
  "/",
  authenticateAdmin,
  auditLog("list_tokens", "token"),
  async (req, res) => {
    try {
      const filters = tokenFilterSchema.parse(req.query);

      let tokens = await Database.getAllTokens(filters.deleted === "true");

      // Apply filters
      if (filters.flagged !== undefined) {
        tokens = tokens.filter(
          (t) => t.flagged === (filters.flagged === "true")
        );
      }
      if (filters.creator) {
        tokens = tokens.filter((t) => t.creatorAddress === filters.creator);
      }
      if (filters.search) {
        const search = filters.search.toLowerCase();
        tokens = tokens.filter(
          (t) =>
            t.name.toLowerCase().includes(search) ||
            t.symbol.toLowerCase().includes(search) ||
            t.contractAddress.toLowerCase().includes(search)
        );
      }

      res.json({
        tokens,
        total: tokens.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid filters", details: error.errors });
      }
      console.error("Error fetching tokens:", error);
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  }
);

// GET /api/admin/tokens/:id - Get detailed token info
router.get(
  "/:id",
  authenticateAdmin,
  auditLog("view_token", "token"),
  async (req, res) => {
    try {
      const token = await Database.findTokenById(req.params.id);

      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }

      // Get creator info
      const creator = await Database.findUserByAddress(token.creatorAddress);

      res.json({
        token,
        creator: creator
          ? {
              id: creator.id,
              address: creator.address,
              role: creator.role,
              banned: creator.banned,
              createdAt: creator.createdAt,
            }
          : null,
      });
    } catch (error) {
      console.error("Error fetching token:", error);
      res.status(500).json({ error: "Failed to fetch token" });
    }
  }
);

// PATCH /api/admin/tokens/:id - Update token (flag/unflag, update metadata)
router.patch(
  "/:id",
  authenticateAdmin,
  auditLog("update_token", "token"),
  async (req, res) => {
    try {
      const updates = tokenUpdateSchema.parse(req.body);

      const token = await Database.updateToken(req.params.id, updates);

      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }

      res.json({ token, message: "Token updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid update data", details: error.errors });
      }
      console.error("Error updating token:", error);
      res.status(500).json({ error: "Failed to update token" });
    }
  }
);

// DELETE /api/admin/tokens/:id - Soft delete token (super admin only)
router.delete(
  "/:id",
  authenticateAdmin,
  requireSuperAdmin,
  auditLog("delete_token", "token"),
  async (req, res) => {
    try {
      const success = await Database.softDeleteToken(req.params.id);

      if (!success) {
        return res.status(404).json({ error: "Token not found" });
      }

      res.json({ message: "Token deleted successfully" });
    } catch (error) {
      console.error("Error deleting token:", error);
      res.status(500).json({ error: "Failed to delete token" });
    }
  }
);

export default router;
