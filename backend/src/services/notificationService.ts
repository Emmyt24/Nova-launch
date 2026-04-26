import axios, { AxiosError } from "axios";
import webhookDeliveryService from "./webhookDeliveryService";
import {
  NotificationChannelType,
  NotificationPayload,
  NotificationRequest,
  NotificationResult,
  NotificationTarget,
} from "../types/notification";
import { IntegrationMetrics } from "../monitoring/metrics/prometheus-config";

const USER_AGENT = "Nova-Launch-Notification/1.0";

type NotificationHandler = (
  target: NotificationTarget,
  payload: NotificationPayload,
  correlationId?: string
) => Promise<NotificationResult>;

export class NotificationService {
  private readonly handlers = new Map<NotificationChannelType, NotificationHandler>();

  constructor() {
    this.registerChannel("WEBHOOK", this.sendWebhookNotification.bind(this));
    this.registerChannel("EMAIL", this.sendEmailNotification.bind(this));
    this.registerChannel("SMS", this.sendSmsNotification.bind(this));
  }

  /**
   * Register a channel handler. This supports future extension without altering core logic.
   */
  registerChannel(channel: NotificationChannelType, handler: NotificationHandler): void {
    if (this.handlers.has(channel)) {
      throw new Error(`Notification channel handler already registered for ${channel}`);
    }
    this.handlers.set(channel, handler);
  }

  /**
   * Send a notification to one or more targets.
   */
  async send(request: NotificationRequest): Promise<NotificationResult[]> {
    if (!request.targets || request.targets.length === 0) {
      throw new Error("Notification request requires at least one target");
    }

    if (!request.payload || !request.payload.message) {
      throw new Error("Notification payload.message is required");
    }

    const results = await Promise.all(
      request.targets.map((target) =>
        this.sendToTarget(target, request.payload, request.correlationId)
      )
    );

    return results;
  }

  private async sendToTarget(
    target: NotificationTarget,
    payload: NotificationPayload,
    correlationId?: string
  ): Promise<NotificationResult> {
    const handler = this.handlers.get(target.type);

    if (!handler) {
      return {
        channel: target.type,
        target,
        provider: target.provider || "unknown",
        success: false,
        error: `Unsupported notification channel: ${target.type}`,
      };
    }

    try {
      const result = await handler(target, payload, correlationId);
      IntegrationMetrics.recordNotificationDelivery(target.type, result.success ? "success" : "failed");
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      IntegrationMetrics.recordNotificationDelivery(target.type, "failed");
      return {
        channel: target.type,
        target,
        provider: target.provider || "default",
        success: false,
        error: message,
      };
    }
  }

  private async sendWebhookNotification(
    target: NotificationTarget,
    payload: NotificationPayload,
    correlationId?: string
  ): Promise<NotificationResult> {
    if (!payload.event) {
      return {
        channel: "WEBHOOK",
        target,
        provider: "webhook",
        success: false,
        error: "Webhook notifications require payload.event",
      };
    }

    await webhookDeliveryService.triggerEvent(
      payload.event,
      payload as any,
      payload.tokenAddress,
      correlationId
    );

    return {
      channel: "WEBHOOK",
      target,
      provider: "webhook",
      success: true,
    };
  }

  private async sendEmailNotification(
    target: NotificationTarget,
    payload: NotificationPayload
  ): Promise<NotificationResult> {
    if (!target.destination) {
      return {
        channel: "EMAIL",
        target,
        provider: "email",
        success: false,
        error: "Email notifications require a destination email address",
      };
    }

    const emailApiUrl = process.env.NOTIFICATION_EMAIL_API_URL || "";
    const emailApiKey = process.env.NOTIFICATION_EMAIL_API_KEY || "";

    if (!emailApiUrl) {
      return {
        channel: "EMAIL",
        target,
        provider: "email",
        success: false,
        error: "Email channel is not configured",
      };
    }

    try {
      const response = await axios.post(
        emailApiUrl,
        {
          to: target.destination,
          subject: payload.subject || "Nova Launch Notification",
          body: payload.message,
          metadata: payload.metadata || {},
        },
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            ...(emailApiKey ? { Authorization: `Bearer ${emailApiKey}` } : {}),
          },
          validateStatus: (status) => status >= 200 && status < 300,
        }
      );

      return {
        channel: "EMAIL",
        target,
        provider: "email",
        success: response.status >= 200 && response.status < 300,
      };
    } catch (error: unknown) {
      const message =
        error instanceof AxiosError
          ? error.message
          : error instanceof Error
          ? error.message
          : String(error);

      return {
        channel: "EMAIL",
        target,
        provider: "email",
        success: false,
        error: message,
      };
    }
  }

  private async sendSmsNotification(
    target: NotificationTarget,
    payload: NotificationPayload
  ): Promise<NotificationResult> {
    if (!target.destination) {
      return {
        channel: "SMS",
        target,
        provider: "sms",
        success: false,
        error: "SMS notifications require a destination phone number",
      };
    }

    const smsApiUrl = process.env.NOTIFICATION_SMS_API_URL || "";
    const smsApiKey = process.env.NOTIFICATION_SMS_API_KEY || "";

    if (!smsApiUrl) {
      return {
        channel: "SMS",
        target,
        provider: "sms",
        success: false,
        error: "SMS channel is not configured",
      };
    }

    try {
      const response = await axios.post(
        smsApiUrl,
        {
          to: target.destination,
          message: payload.message,
          metadata: payload.metadata || {},
        },
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            ...(smsApiKey ? { Authorization: `Bearer ${smsApiKey}` } : {}),
          },
          validateStatus: (status) => status >= 200 && status < 300,
        }
      );

      return {
        channel: "SMS",
        target,
        provider: "sms",
        success: response.status >= 200 && response.status < 300,
      };
    } catch (error: unknown) {
      const message =
        error instanceof AxiosError
          ? error.message
          : error instanceof Error
          ? error.message
          : String(error);

      return {
        channel: "SMS",
        target,
        provider: "sms",
        success: false,
        error: message,
      };
    }
  }
}

export default new NotificationService();
