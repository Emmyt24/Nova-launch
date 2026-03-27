/**
 * Webhook API Client
 * 
 * Handles webhook subscription management, listing, and delivery log inspection.
 */

export enum WebhookEventType {
  TOKEN_BURN_SELF = "token.burn.self",
  TOKEN_BURN_ADMIN = "token.burn.admin",
  TOKEN_CREATED = "token.created",
  TOKEN_METADATA_UPDATED = "token.metadata.updated",
}

export interface WebhookSubscription {
  id: string;
  url: string;
  tokenAddress: string | null;
  events: WebhookEventType[];
  secret: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  lastTriggered: string | null;
}

export interface WebhookDeliveryLog {
  id: string;
  subscriptionId: string;
  event: WebhookEventType;
  payload: any;
  statusCode: number | null;
  success: boolean;
  attempts: number;
  lastAttemptAt: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface CreateWebhookInput {
  url: string;
  tokenAddress?: string | null;
  events: WebhookEventType[];
  createdBy: string;
}

const BASE = "/api/webhooks";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Webhook API error: ${res.status}`);
  }
  return data.data || data;
}

export const webhookApi = {
  /**
   * Create a new webhook subscription
   */
  subscribe: (input: CreateWebhookInput) =>
    request<WebhookSubscription>("/subscribe", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * Delete a webhook subscription
   */
  unsubscribe: (id: string, createdBy: string) =>
    request<{ success: boolean }>(`/unsubscribe/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ createdBy }),
    }),

  /**
   * List subscriptions for a user
   */
  listSubscriptions: (createdBy: string, active?: boolean) =>
    request<WebhookSubscription[]>("/list", {
      method: "POST",
      body: JSON.stringify({ createdBy, active }),
    }),

  /**
   * Get a specific webhook subscription
   */
  getById: (id: string) =>
    request<WebhookSubscription>(`/${id}`),

  /**
   * Toggle webhook subscription active status
   */
  toggleStatus: (id: string, active: boolean) =>
    request<{ success: boolean }>(`/${id}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),

  /**
   * Get delivery logs for a subscription
   */
  getLogs: (id: string, limit = 50) =>
    request<WebhookDeliveryLog[]>(`/${id}/logs?limit=${limit}`),

  /**
   * Test a webhook subscription
   */
  testWebhook: (id: string) =>
    request<{ success: boolean; message: string }>(`/${id}/test`, {
      method: "POST",
    }),
};
