import { Router } from "express";
import { streamProjectionService } from "../services/streamProjectionService";
import { successResponse, errorResponse } from "../utils/response";

const router = Router();

/**
 * GET /api/streams/stats/:address?
 * Returns stream statistics for an address (creator or recipient)
 */
router.get("/stats/:address?", async (req, res) => {
  try {
    const { address } = req.params;
    const stats = await streamProjectionService.getStreamStats(address);
    res.json(successResponse(stats));
  } catch (error) {
    res.status(500).json(errorResponse({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch stream stats",
    }));
  }
});

/**
 * GET /api/streams/creator/:address
 * Returns all streams created by the address
 */
router.get("/creator/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const streams = await streamProjectionService.getStreamsByCreator(address);
    res.json(successResponse(streams));
  } catch (error) {
    res.status(500).json(errorResponse({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch creator streams",
    }));
  }
});

/**
 * GET /api/streams/recipient/:address
 * Returns all streams where the address is the recipient
 */
router.get("/recipient/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const streams = await streamProjectionService.getStreamsByRecipient(address);
    res.json(successResponse(streams));
  } catch (error) {
    res.status(500).json(errorResponse({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch recipient streams",
    }));
  }
});

/**
 * GET /api/streams/:id
 * Returns a specific stream by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse({
        code: "INVALID_INPUT",
        message: "Invalid stream ID",
      }));
    }
    const stream = await streamProjectionService.getStreamById(id);
    if (!stream) {
      return res.status(404).json(errorResponse({
        code: "NOT_FOUND",
        message: "Stream not found",
      }));
    }
    res.json(successResponse(stream));
  } catch (error) {
    res.status(500).json(errorResponse({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch stream",
    }));
  }
});

export default router;
