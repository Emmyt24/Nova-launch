import { WebhookEventType } from "./webhook";

export type NotificationChannelType = "EMAIL" | "SMS" | "WEBHOOK";

export interface NotificationTarget {
  /** Notification channel identifier */
  type: NotificationChannelType;
  /** Destination address or recipient identifier for the target channel */
  destination?: string;
  /** Optional provider label for observability and telemetry */
  provider?: string;
}

export interface NotificationPayload {
  /** Optional subject or title for channels that support it */
  subject?: string;
  /** Primary notification body text */
  message: string;
  /** Optional event type for webhook-based notification routing */
  event?: WebhookEventType;
  /** Optional token address used for webhook filtering */
  tokenAddress?: string;
  /** Optional metadata to help recipients or transport providers process the message */
  metadata?: Record<string, unknown>;
  /** Optional transaction hash for audit/tracing purposes */
  transactionHash?: string;
}

export interface NotificationRequest {
  /** One or more notification targets to deliver the payload to */
  targets: NotificationTarget[];
  payload: NotificationPayload;
  /** Optional correlation identifier for multi-channel fan-out tracing */
  correlationId?: string;
}

export interface NotificationResult {
  channel: NotificationChannelType;
  target: NotificationTarget;
  provider: string;
  success: boolean;
  error?: string | null;
}
