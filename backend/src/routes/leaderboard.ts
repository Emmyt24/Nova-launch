import { Router, Request, Response } from "express";
import {
  getMostBurnedLeaderboard,
  getMostActiveLeaderboard,
  getNewestTokensLeaderboard,
  getLargestSupplyLeaderboard,
  getMostBurnersLeaderboard,
  TimePeriod,
} from "../services/leaderboardService";
import { successResponse, errorResponse } from "../utils/response";

const router = Router();

// Validation helper
function validatePeriod(period: string | undefined): TimePeriod {
  if (!period) return TimePeriod.D7;

  const validPeriods = Object.values(TimePeriod);
  if (validPeriods.includes(period as TimePeriod)) {
    return period as TimePeriod;
  }

  return TimePeriod.D7;
}

function validatePagination(page?: string, limit?: string) {
  const parsedPage = parseInt(page || "1", 10);
  const parsedLimit = parseInt(limit || "10", 10);

  return {
    page: isNaN(parsedPage) || parsedPage < 1 ? 1 : Math.min(parsedPage, 100),
    limit:
      isNaN(parsedLimit) || parsedLimit < 1 ? 10 : Math.min(parsedLimit, 100),
  };
}

/**
 * GET /api/leaderboard/most-burned
 * Returns tokens with highest burn volume
 */
router.get("/most-burned", async (req: Request, res: Response) => {
  try {
    const period = validatePeriod(req.query.period as string);
    const { page, limit } = validatePagination(
      req.query.page as string,
      req.query.limit as string
    );

    const result = await getMostBurnedLeaderboard(period, page, limit);
    res.json(successResponse(result));
  } catch (error) {
    console.error("Error fetching most-burned leaderboard:", error);
    res.status(500).json(
      errorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch leaderboard",
      })
    );
  }
});

/**
 * GET /api/leaderboard/most-active
 * Returns tokens with most burn transactions
 */
router.get("/most-active", async (req: Request, res: Response) => {
  try {
    const period = validatePeriod(req.query.period as string);
    const { page, limit } = validatePagination(
      req.query.page as string,
      req.query.limit as string
    );

    const result = await getMostActiveLeaderboard(period, page, limit);
    res.json(successResponse(result));
  } catch (error) {
    console.error("Error fetching most-active leaderboard:", error);
    res.status(500).json(
      errorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch leaderboard",
      })
    );
  }
});

/**
 * GET /api/leaderboard/newest
 * Returns recently created tokens
 */
router.get("/newest", async (req: Request, res: Response) => {
  try {
    const { page, limit } = validatePagination(
      req.query.page as string,
      req.query.limit as string
    );

    const result = await getNewestTokensLeaderboard(page, limit);
    res.json(successResponse(result));
  } catch (error) {
    console.error("Error fetching newest leaderboard:", error);
    res.status(500).json(
      errorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch leaderboard",
      })
    );
  }
});

/**
 * GET /api/leaderboard/largest-supply
 * Returns tokens with highest total supply
 */
router.get("/largest-supply", async (req: Request, res: Response) => {
  try {
    const { page, limit } = validatePagination(
      req.query.page as string,
      req.query.limit as string
    );

    const result = await getLargestSupplyLeaderboard(page, limit);
    res.json(successResponse(result));
  } catch (error) {
    console.error("Error fetching largest-supply leaderboard:", error);
    res.status(500).json(
      errorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch leaderboard",
      })
    );
  }
});

/**
 * GET /api/leaderboard/most-burners
 * Returns tokens with most unique burners
 */
router.get("/most-burners", async (req: Request, res: Response) => {
  try {
    const period = validatePeriod(req.query.period as string);
    const { page, limit } = validatePagination(
      req.query.page as string,
      req.query.limit as string
    );

    const result = await getMostBurnersLeaderboard(period, page, limit);
    res.json(successResponse(result));
  } catch (error) {
    console.error("Error fetching most-burners leaderboard:", error);
    res.status(500).json(
      errorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch leaderboard",
      })
    );
  }
});

export default router;
