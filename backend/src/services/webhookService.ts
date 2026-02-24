import { v4 as uuidv4 } from "uuid";
import db from "../database/db";
import {
  WebhookSubscription,
  CreateWebhookInput,
  WebhookEventType,
  WebhookPayload,
  WebhookEventData,
  WebhookDeliveryLog,
} from "../types/webhook";
import { generateWebhookSecret, generateSignature } from "../utils/crypto";

export class WebhookService {
  /**
   * Create a new webhook subscription
   */
  async createSubscription(
    input: CreateWebhookInput
  ): Promise<WebhookSubscription> {
    const id = uuidv4();
    const secret = generateWebhookSecret();

    const query = `
      INSERT INTO webhook_subscriptions 
        (id, url, token_address, events, secret, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      input.url,
      input.tokenAddress || null,
      input.events,
      secret,
      input.createdBy,
    ]);

    return this.mapRowToSubscription(result.rows[0]);
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(id: string): Promise<WebhookSubscription | null> {
    const query = "SELECT * FROM webhook_subscriptions WHERE id = $1";
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToSubscription(result.rows[0]);
  }

  /**
   * List subscriptions for a user
   */
  async listSubscriptions(
    createdBy: string,
    active?: boolean
  ): Promise<WebhookSubscription[]> {
    let query = "SELECT * FROM webhook_subscriptions WHERE created_by = $1";
    const params: any[] = [createdBy];

    if (active !== undefined) {
      query += " AND active = $2";
      params.push(active);
    }

    query += " ORDER BY created_at DESC";

    const result = await db.query(query, params);
    return result.rows.map(this.mapRowToSubscription);
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(id: string, createdBy: string): Promise<boolean> {
    const query = `
      DELETE FROM webhook_subscriptions 
      WHERE id = $1 AND created_by = $2
      RETURNING id
    `;

    const result = await db.query(query, [id, createdBy]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Update subscription active status
   */
  async updateSubscriptionStatus(
    id: string,
    active: boolean
  ): Promise<boolean> {
    const query = `
      UPDATE webhook_subscriptions 
      SET active = $1 
      WHERE id = $2
      RETURNING id
    `;

    const result = await db.query(query, [active, id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Find subscriptions matching an event
   */
  async findMatchingSubscriptions(
    event: WebhookEventType,
    tokenAddress?: string
  ): Promise<WebhookSubscription[]> {
    const query = `
      SELECT * FROM webhook_subscriptions 
      WHERE active = true 
        AND $1 = ANY(events)
        AND (token_address IS NULL OR token_address = $2)
    `;

    const result = await db.query(query, [event, tokenAddress || null]);
    return result.rows.map(this.mapRowToSubscription);
  }

  /**
   * Update last triggered timestamp
   */
  async updateLastTriggered(id: string): Promise<void> {
    const query = `
      UPDATE webhook_subscriptions 
      SET last_triggered = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;

    await db.query(query, [id]);
  }

  /**
   * Log webhook delivery
   */
  async logDelivery(
    subscriptionId: string,
    event: WebhookEventType,
    payload: WebhookPayload,
    statusCode: number | null,
    success: boolean,
    attempts: number,
    errorMessage: string | null = null
  ): Promise<void> {
    const query = `
      INSERT INTO webhook_delivery_logs 
        (subscription_id, event, payload, status_code, success, attempts, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await db.query(query, [
      subscriptionId,
      event,
      JSON.stringify(payload),
      statusCode,
      success,
      attempts,
      errorMessage,
    ]);
  }

  /**
   * Get delivery logs for a subscription
   */
  async getDeliveryLogs(
    subscriptionId: string,
    limit: number = 50
  ): Promise<WebhookDeliveryLog[]> {
    const query = `
      SELECT * FROM webhook_delivery_logs 
      WHERE subscription_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;

    const result = await db.query(query, [subscriptionId, limit]);
    return result.rows.map(this.mapRowToDeliveryLog);
  }

  /**
   * Create webhook payload with signature
   */
  createPayload(
    event: WebhookEventType,
    data: WebhookEventData,
    secret: string
  ): WebhookPayload {
    const payload: Omit<WebhookPayload, "signature"> = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateSignature(payloadString, secret);

    return {
      ...payload,
      signature,
    };
  }

  /**
   * Map database row to WebhookSubscription
   */
  private mapRowToSubscription(row: any): WebhookSubscription {
    return {
      id: row.id,
      url: row.url,
      tokenAddress: row.token_address,
      events: row.events,
      secret: row.secret,
      active: row.active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      lastTriggered: row.last_triggered,
    };
  }

  /**
   * Map database row to WebhookDeliveryLog
   */
  private mapRowToDeliveryLog(row: any): WebhookDeliveryLog {
    return {
      id: row.id,
      subscriptionId: row.subscription_id,
      event: row.event,
      payload: row.payload,
      statusCode: row.status_code,
      success: row.success,
      attempts: row.attempts,
      lastAttemptAt: row.last_attempt_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }
}

export default new WebhookService();
