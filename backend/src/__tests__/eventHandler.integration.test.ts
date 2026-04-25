/**
 * Event Handler Integration Tests
 * 
 * Tests backend event parsing and persistence against contract event schemas
 * Ensures backward compatibility as contract events evolve
 */

import { describe, it, expect, beforeEach } from "vitest";
import { StellarEventListener } from "../services/stellarEventListener";
import {
  tokenCreatedEvent,
  adminTransferEvent,
  adminProposedEvent,
  adminBurnEvent,
  tokenBurnedEvent,
  initializedEvent,
  feesUpdatedEvent,
  pauseEvent,
  unpauseEvent,
  clawbackToggledEvent,
  allEventFixtures,
  ContractEventFixture,
} from "./fixtures/contractEvents";

describe("Event Handler Integration Tests", () => {
  let eventListener: StellarEventListener;

  beforeEach(() => {
    eventListener = new StellarEventListener();
  });

  describe("Event Type Parsing", () => {
    it("should parse token created event (tok_reg)", () => {
      const eventType = (eventListener as any).parseEventType(
        tokenCreatedEvent
      );
      expect(eventType).toBeDefined();
    });

    it("should parse admin transfer event (adm_xfer)", () => {
      const eventType = (eventListener as any).parseEventType(
        adminTransferEvent
      );
      expect(eventType).toBeDefined();
    });

    it("should parse admin proposed event (adm_prop)", () => {
      const eventType = (eventListener as any).parseEventType(
        adminProposedEvent
      );
      expect(eventType).toBeDefined();
    });

    it("should parse admin burn event (adm_burn)", () => {
      const eventType = (eventListener as any).parseEventType(adminBurnEvent);
      expect(eventType).toBeDefined();
    });

    it("should parse token burned event (tok_burn)", () => {
      const eventType = (eventListener as any).parseEventType(
        tokenBurnedEvent
      );
      expect(eventType).toBeDefined();
    });

    it("should handle unknown event types gracefully", () => {
      const unknownEvent: ContractEventFixture = {
        ...tokenCreatedEvent,
        topic: ["unknown_event"],
      };
      const eventType = (eventListener as any).parseEventType(unknownEvent);
      expect(eventType).toBeNull();
    });
  });

  describe("Event Data Extraction", () => {
    it("should extract token created data correctly", () => {
      const eventType = (eventListener as any).parseEventType(
        tokenCreatedEvent
      );
      const data = (eventListener as any).extractEventData(
        tokenCreatedEvent,
        eventType
      );

      expect(data).toBeDefined();
      expect(data.transactionHash).toBe(tokenCreatedEvent.transaction_hash);
      expect(data.ledger).toBe(tokenCreatedEvent.ledger);
    });

    it("should extract admin transfer data correctly", () => {
      const eventType = (eventListener as any).parseEventType(
        adminTransferEvent
      );
      const data = (eventListener as any).extractEventData(
        adminTransferEvent,
        eventType
      );

      expect(data).toBeDefined();
      expect(data.transactionHash).toBe(adminTransferEvent.transaction_hash);
      expect(data.ledger).toBe(adminTransferEvent.ledger);
    });

    it("should extract admin burn data with all required fields", () => {
      const eventType = (eventListener as any).parseEventType(adminBurnEvent);
      const data = (eventListener as any).extractEventData(
        adminBurnEvent,
        eventType
      );

      expect(data).toBeDefined();
      expect(data.transactionHash).toBe(adminBurnEvent.transaction_hash);
      expect(data.ledger).toBe(adminBurnEvent.ledger);
      expect(data.amount).toBeDefined();
    });

    it("should extract token burned data correctly", () => {
      const eventType = (eventListener as any).parseEventType(
        tokenBurnedEvent
      );
      const data = (eventListener as any).extractEventData(
        tokenBurnedEvent,
        eventType
      );

      expect(data).toBeDefined();
      expect(data.transactionHash).toBe(tokenBurnedEvent.transaction_hash);
      expect(data.amount).toBeDefined();
    });
  });

  describe("Schema Compatibility", () => {
    it("should handle all current event schemas", () => {
      for (const event of allEventFixtures) {
        const eventType = (eventListener as any).parseEventType(event);
        
        // Some events may not have handlers yet (like init, fee_upd, etc.)
        // This is expected - we're testing that parsing doesn't crash
        if (eventType) {
          const data = (eventListener as any).extractEventData(
            event,
            eventType
          );
          expect(data).toBeDefined();
          expect(data.transactionHash).toBe(event.transaction_hash);
          expect(data.ledger).toBe(event.ledger);
        }
      }
    });

    it("should handle missing optional fields gracefully", () => {
      const eventWithMissingFields: ContractEventFixture = {
        ...tokenCreatedEvent,
        value: {}, // Empty value
      };

      const eventType = (eventListener as any).parseEventType(
        eventWithMissingFields
      );
      const data = (eventListener as any).extractEventData(
        eventWithMissingFields,
        eventType
      );

      // Should not crash, should provide defaults
      expect(data).toBeDefined();
    });

    it("should handle malformed event topics", () => {
      const malformedEvent: ContractEventFixture = {
        ...tokenCreatedEvent,
        topic: [], // Empty topic array
      };

      const eventType = (eventListener as any).parseEventType(malformedEvent);
      expect(eventType).toBeNull();
    });
  });

  describe("Event Processing", () => {
    it("should process token created event without errors", async () => {
      await expect(
        (eventListener as any).processEvent(tokenCreatedEvent)
      ).resolves.not.toThrow();
    });

    it("should process admin transfer event without errors", async () => {
      await expect(
        (eventListener as any).processEvent(adminTransferEvent)
      ).resolves.not.toThrow();
    });

    it("should process admin burn event without errors", async () => {
      await expect(
        (eventListener as any).processEvent(adminBurnEvent)
      ).resolves.not.toThrow();
    });

    it("should process token burned event without errors", async () => {
      await expect(
        (eventListener as any).processEvent(tokenBurnedEvent)
      ).resolves.not.toThrow();
    });

    it("should handle processing errors gracefully", async () => {
      const invalidEvent: ContractEventFixture = {
        ...tokenCreatedEvent,
        value: null, // Invalid value
      };

      // Should not throw, should log error internally
      await expect(
        (eventListener as any).processEvent(invalidEvent)
      ).resolves.not.toThrow();
    });
  });

  describe("Versioned Event Compatibility", () => {
    it("should handle v1 token created events", () => {
      const v1Event = tokenCreatedEvent;
      const eventType = (eventListener as any).parseEventType(v1Event);
      const data = (eventListener as any).extractEventData(v1Event, eventType);

      expect(data).toBeDefined();
      expect(data.transactionHash).toBeDefined();
    });

    it("should handle new admin proposed event (v2 feature)", () => {
      const v2Event = adminProposedEvent;
      const eventType = (eventListener as any).parseEventType(v2Event);
      
      // New event type - may not have handler yet
      // Test that parsing doesn't crash
      expect(() => {
        (eventListener as any).extractEventData(v2Event, eventType);
      }).not.toThrow();
    });

    it("should maintain backward compatibility with old event formats", () => {
      // Simulate old event format without new fields
      const oldFormatEvent: ContractEventFixture = {
        ...adminBurnEvent,
        value: {
          // Old format might have different field names
          token_address: adminBurnEvent.value.token_address,
          from: adminBurnEvent.value.from,
          amount: adminBurnEvent.value.amount,
          // Missing new fields that might be added later
        },
      };

      const eventType = (eventListener as any).parseEventType(oldFormatEvent);
      const data = (eventListener as any).extractEventData(
        oldFormatEvent,
        eventType
      );

      expect(data).toBeDefined();
      expect(data.transactionHash).toBeDefined();
    });
  });

  describe("Event Persistence", () => {
    it("should extract all required fields for database persistence", () => {
      const eventType = (eventListener as any).parseEventType(adminBurnEvent);
      const data = (eventListener as any).extractEventData(
        adminBurnEvent,
        eventType
      );

      // Verify all fields needed for DB persistence are present
      expect(data.transactionHash).toBeDefined();
      expect(data.ledger).toBeDefined();
      expect(typeof data.transactionHash).toBe("string");
      expect(typeof data.ledger).toBe("number");
    });

    it("should handle large numeric values correctly", () => {
      const largeAmountEvent: ContractEventFixture = {
        ...tokenBurnedEvent,
        value: {
          amount: "999999999999999999", // Very large amount
        },
      };

      const eventType = (eventListener as any).parseEventType(
        largeAmountEvent
      );
      const data = (eventListener as any).extractEventData(
        largeAmountEvent,
        eventType
      );

      expect(data).toBeDefined();
      expect(data.amount).toBeDefined();
      expect(typeof data.amount).toBe("string"); // Should preserve as string
    });
  });
});
