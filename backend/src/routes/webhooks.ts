import { Router, Request, Response } from "express";
import webhookService from "../services/webhookService";
import webhookDeliveryService from "../services/webhookDeliveryService";
import {
  validateSubscriptionCreate,
  validateSubscriptionId,
  validateListSubscriptions,
} from "../middleware/validation";
import { webhookRateLimiter } from "../middleware/rateLimiter";

const router = Router();

/**
 * POST /api/webhooks/subscribe
 * Create a new webhook subscription
 */
router.post(
  "/subscribe",
  webhookRateLimiter,
  validateSubscriptionCreate,
  async (req: Request, res: Response) => {
    try {
      const subscription = await webhookService.createSubscription(req.body);

      // Return subscription without exposing the secret
      const { secret, ...publicData } = subscription;

      res.status(201).json({
        success: true,
        data: {
          ...publicData,
          secret: `${secret.substring(0, 8)}...`, // Show only first 8 chars
        },
        message: "Webhook subscription created successfully",
      });
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create webhook subscription",
      });
    }
  }
);

/**
 * DELETE /api/webhooks/unsubscribe/:id
 * Delete a webhook subscription
 */
router.delete(
  "/unsubscribe/:id",
  webhookRateLimiter,
  validateSubscriptionId,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { createdBy } = req.body;

      if (!createdBy) {
        return res.status(400).json({
          success: false,
          error: "createdBy address is required",
        });
      }

      const deleted = await webhookService.deleteSubscription(id, createdBy);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: "Subscription not found or unauthorized",
        });
      }

      res.json({
        success: true,
        message: "Webhook subscription deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting subscription:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete webhook subscription",
      });
    }
  }
);

/**
 * POST /api/webhooks/list
 * List webhook subscriptions for a user
 */
router.post(
  "/list",
  validateListSubscriptions,
  async (req: Request, res: Response) => {
    try {
      const { createdBy, active } = req.body;

      const subscriptions = await webhookService.listSubscriptions(
        createdBy,
        active
      );

      // Hide secrets in response
      const publicSubscriptions = subscriptions.map((sub) => {
        const { secret, ...publicData } = sub;
        return {
          ...publicData,
          secret: `${secret.substring(0, 8)}...`,
        };
      });

      res.json({
        success: true,
        data: publicSubscriptions,
        count: publicSubscriptions.length,
      });
    } catch (error) {
      console.error("Error listing subscriptions:", error);
      res.status(500).json({
        success: false,
        error: "Failed to list webhook subscriptions",
      });
    }
  }
);

/**
 * GET /api/webhooks/:id
 * Get a specific webhook subscription
 */
router.get(
  "/:id",
  validateSubscriptionId,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const subscription = await webhookService.getSubscription(id);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: "Subscription not found",
        });
      }

      // Hide secret
      const { secret, ...publicData } = subscription;

      res.json({
        success: true,
        data: {
          ...publicData,
          secret: `${secret.substring(0, 8)}...`,
        },
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch webhook subscription",
      });
    }
  }
);

/**
 * PATCH /api/webhooks/:id/toggle
 * Toggle webhook subscription active status
 */
router.patch(
  "/:id/toggle",
  webhookRateLimiter,
  validateSubscriptionId,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { active } = req.body;

      if (typeof active !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "active field must be a boolean",
        });
      }

      const updated = await webhookService.updateSubscriptionStatus(id, active);

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: "Subscription not found",
        });
      }

      res.json({
        success: true,
        message: `Subscription ${active ? "activated" : "deactivated"} successfully`,
      });
    } catch (error) {
      console.error("Error toggling subscription:", error);
      res.status(500).json({
        success: false,
        error: "Failed to toggle webhook subscription",
      });
    }
  }
);

/**
 * GET /api/webhooks/:id/logs
 * Get delivery logs for a subscription
 */
router.get(
  "/:id/logs",
  validateSubscriptionId,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const logs = await webhookService.getDeliveryLogs(id, limit);

      res.json({
        success: true,
        data: logs,
        count: logs.length,
      });
    } catch (error) {
      console.error("Error fetching delivery logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch delivery logs",
      });
    }
  }
);

/**
 * POST /api/webhooks/:id/test
 * Test a webhook subscription
 */
router.post(
  "/:id/test",
  webhookRateLimiter,
  validateSubscriptionId,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const subscription = await webhookService.getSubscription(id);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: "Subscription not found",
        });
      }

      const success = await webhookDeliveryService.testWebhook(subscription);

      res.json({
        success,
        message: success
          ? "Test webhook delivered successfully"
          : "Test webhook delivery failed",
      });
    } catch (error) {
      console.error("Error testing webhook:", error);
      res.status(500).json({
        success: false,
        error: "Failed to test webhook",
      });
    }
  }
);

export default router;
