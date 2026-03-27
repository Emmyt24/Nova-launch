import { Router } from "express";
import { streamProjectionService } from "../services/streamProjectionService";
import { successResponse, errorResponse } from "../utils/response";

const router = Router();

/**
 * Vaults are aliased to streams in this implementation as they share
 * the same underlying contract logic for recurring payments.
 */

/**
 * GET /api/vaults/creator/:address
 * Returns all vault streams created by the address
 */
router.get("/creator/:address", async (req, res) => {
  try {
    const { address } = req.params;
    // For now, we use the same stream projection service
    const streams = await streamProjectionService.getStreamsByCreator(address);
    res.json(successResponse(streams));
  } catch (error) {
    res.status(500).json(errorResponse({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch creator vaults",
    }));
  }
});

/**
 * GET /api/vaults/:id
 * Returns a specific vault by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse({
        code: "INVALID_INPUT",
        message: "Invalid vault ID",
      }));
    }
    const stream = await streamProjectionService.getStreamById(id);
    if (!stream) {
      return res.status(404).json(errorResponse({
        code: "NOT_FOUND",
        message: "Vault not found",
      }));
    }
    res.json(successResponse(stream));
  } catch (error) {
    res.status(500).json(errorResponse({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch vault",
    }));
  }
});

export default router;
