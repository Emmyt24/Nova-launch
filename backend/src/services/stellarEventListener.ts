import axios from "axios";
import { WebhookEventType } from "../types/webhook";
import webhookDeliveryService from "./webhookDeliveryService";

const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const FACTORY_CONTRACT_ID = process.env.FACTORY_CONTRACT_ID || "";
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds

interface StellarEvent {
  type: string;
  ledger: number;
  ledger_close_time: string;
  contract_id: string;
  id: string;
  paging_token: string;
  topic: string[];
  value: any;
  in_successful_contract_call: boolean;
  transaction_hash: string;
}

export class StellarEventListener {
  private isRunning = false;
  private lastCursor: string | null = null;

  /**
   * Start listening for Stellar events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("Event listener is already running");
      return;
    }

    this.isRunning = true;
    console.log("Starting Stellar event listener...");

    // Start polling loop
    this.pollEvents();
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    this.isRunning = false;
    console.log("Stopping Stellar event listener...");
  }

  /**
   * Poll for new events
   */
  private async pollEvents(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.fetchAndProcessEvents();
      } catch (error) {
        console.error("Error polling events:", error);
      }

      // Wait before next poll
      await this.delay(POLL_INTERVAL_MS);
    }
  }

  /**
   * Fetch and process new events from Horizon
   */
  private async fetchAndProcessEvents(): Promise<void> {
    try {
      const url = `${HORIZON_URL}/contracts/${FACTORY_CONTRACT_ID}/events`;
      const params: any = {
        limit: 100,
        order: "asc",
      };

      if (this.lastCursor) {
        params.cursor = this.lastCursor;
      }

      const response = await axios.get(url, { params });
      const events: StellarEvent[] = response.data._embedded?.records || [];

      if (events.length === 0) {
        return;
      }

      console.log(`Processing ${events.length} new events`);

      for (const event of events) {
        await this.processEvent(event);
        this.lastCursor = event.paging_token;
      }
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: StellarEvent): Promise<void> {
    try {
      // Parse event topic to determine event type
      const eventType = this.parseEventType(event);

      if (!eventType) {
        return; // Unknown event type
      }

      // Extract event data based on type
      const eventData = this.extractEventData(event, eventType);

      if (!eventData) {
        return;
      }

      // Trigger webhooks
      await webhookDeliveryService.triggerEvent(
        eventType,
        eventData,
        eventData.tokenAddress
      );
    } catch (error) {
      console.error("Error processing event:", error);
    }
  }

  /**
   * Parse event type from Stellar event
   */
  private parseEventType(event: StellarEvent): WebhookEventType | null {
    // Event topics are typically structured as [contract_id, event_name, ...]
    if (event.topic.length < 2) {
      return null;
    }

    const eventName = event.topic[1];

    switch (eventName) {
      case "burn":
        // Determine if self-burn or admin-burn based on event data
        return event.value?.admin
          ? WebhookEventType.TOKEN_BURN_ADMIN
          : WebhookEventType.TOKEN_BURN_SELF;

      case "token_created":
        return WebhookEventType.TOKEN_CREATED;

      case "metadata_updated":
        return WebhookEventType.TOKEN_METADATA_UPDATED;

      default:
        return null;
    }
  }

  /**
   * Extract event data from Stellar event
   */
  private extractEventData(
    event: StellarEvent,
    eventType: WebhookEventType
  ): any {
    const baseData = {
      transactionHash: event.transaction_hash,
      ledger: event.ledger,
    };

    switch (eventType) {
      case WebhookEventType.TOKEN_BURN_SELF:
      case WebhookEventType.TOKEN_BURN_ADMIN:
        return {
          ...baseData,
          tokenAddress: event.value?.token_address || "",
          from: event.value?.from || "",
          amount: event.value?.amount?.toString() || "0",
          burner: event.value?.burner || event.value?.from || "",
        };

      case WebhookEventType.TOKEN_CREATED:
        return {
          ...baseData,
          tokenAddress: event.value?.token_address || "",
          creator: event.value?.creator || "",
          name: event.value?.name || "",
          symbol: event.value?.symbol || "",
          decimals: event.value?.decimals || 7,
          initialSupply: event.value?.initial_supply?.toString() || "0",
        };

      case WebhookEventType.TOKEN_METADATA_UPDATED:
        return {
          ...baseData,
          tokenAddress: event.value?.token_address || "",
          metadataUri: event.value?.metadata_uri || "",
          updatedBy: event.value?.updated_by || "",
        };

      default:
        return null;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new StellarEventListener();
