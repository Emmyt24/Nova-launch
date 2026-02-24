import { body, param, validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";
import { WebhookEventType } from "../types/webhook";
import { isValidUrl, isValidStellarAddress } from "../utils/crypto";

/**
 * Validation middleware to check for errors
 */
export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Validation rules for webhook subscription creation
 */
export const validateSubscriptionCreate = [
  body("url")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("URL is required")
    .custom((value) => {
      if (!isValidUrl(value)) {
        throw new Error("Invalid URL format");
      }
      return true;
    }),
  body("tokenAddress")
    .optional({ nullable: true })
    .custom((value) => {
      if (value && !isValidStellarAddress(value)) {
        throw new Error("Invalid Stellar address format");
      }
      return true;
    }),
  body("events")
    .isArray({ min: 1 })
    .withMessage("At least one event type is required")
    .custom((value: string[]) => {
      const validEvents = Object.values(WebhookEventType);
      const invalidEvents = value.filter(
        (e) => !validEvents.includes(e as WebhookEventType)
      );
      if (invalidEvents.length > 0) {
        throw new Error(`Invalid event types: ${invalidEvents.join(", ")}`);
      }
      return true;
    }),
  body("createdBy")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Creator address is required")
    .custom((value) => {
      if (!isValidStellarAddress(value)) {
        throw new Error("Invalid creator Stellar address");
      }
      return true;
    }),
  validate,
];

/**
 * Validation rules for subscription ID parameter
 */
export const validateSubscriptionId = [
  param("id").isUUID().withMessage("Invalid subscription ID format"),
  validate,
];

/**
 * Validation rules for listing subscriptions
 */
export const validateListSubscriptions = [
  body("createdBy")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Creator address is required")
    .custom((value) => {
      if (!isValidStellarAddress(value)) {
        throw new Error("Invalid creator Stellar address");
      }
      return true;
    }),
  validate,
];
