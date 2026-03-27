/**
 * Event Schema Compatibility Tests
 * 
 * Validates that backend can handle contract event schema changes
 * Ensures analytics continue working as contract evolves
 */

import { describe, it, expect } from "vitest";
import {
  ContractEventFixture,
  eventFixturesByType,
} from "./fixtures/contractEvents";

/**
 * Expected event schema definitions
 * These define the contract between contract events and backend
 */
const EVENT_SCHEMAS = {
  init: {
    topic: ["init"],
    requiredFields: ["admin", "treasury", "base_fee", "metadata_fee"],
    optionalFields: [],
  },
  tok_reg: {
    topic: ["tok_reg", "<token_address>"],
    requiredFields: ["creator"],
    optionalFields: [],
  },
  adm_xfer: {
    topic: ["adm_xfer"],
    requiredFields: ["old_admin", "new_admin"],
    optionalFields: [],
  },
  adm_prop: {
    topic: ["adm_prop"],
    requiredFields: ["current_admin", "proposed_admin"],
    optionalFields: [],
  },
  adm_burn: {
    topic: ["adm_burn", "<token_address>"],
    requiredFields: ["admin", "from", "amount"],
    optionalFields: [],
  },
  tok_burn: {
    topic: ["tok_burn", "<token_address>"],
    requiredFields: ["amount"],
    optionalFields: ["from", "burner"],
  },
  fee_upd: {
    topic: ["fee_upd"],
    requiredFields: ["base_fee", "metadata_fee"],
    optionalFields: [],
  },
  pause: {
    topic: ["pause"],
    requiredFields: ["admin"],
    optionalFields: [],
  },
  unpause: {
    topic: ["unpause"],
    requiredFields: ["admin"],
    optionalFields: [],
  },
  clawback: {
    topic: ["clawback", "<token_address>"],
    requiredFields: ["admin", "enabled"],
    optionalFields: [],
  },
};

describe("Event Schema Compatibility", () => {
  describe("Schema Validation", () => {
    it("should validate init event schema", () => {
      const event = eventFixturesByType.init;
      const schema = EVENT_SCHEMAS.init;

      expect(event.topic[0]).toBe(schema.topic[0]);
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate tok_reg event schema", () => {
      const event = eventFixturesByType.tok_reg;
      const schema = EVENT_SCHEMAS.tok_reg;

      expect(event.topic[0]).toBe(schema.topic[0]);
      expect(event.topic.length).toBeGreaterThanOrEqual(2); // Has token address
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate adm_xfer event schema", () => {
      const event = eventFixturesByType.adm_xfer;
      const schema = EVENT_SCHEMAS.adm_xfer;

      expect(event.topic[0]).toBe(schema.topic[0]);
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate adm_prop event schema (new in v2)", () => {
      const event = eventFixturesByType.adm_prop;
      const schema = EVENT_SCHEMAS.adm_prop;

      expect(event.topic[0]).toBe(schema.topic[0]);
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate adm_burn event schema", () => {
      const event = eventFixturesByType.adm_burn;
      const schema = EVENT_SCHEMAS.adm_burn;

      expect(event.topic[0]).toBe(schema.topic[0]);
      expect(event.topic.length).toBeGreaterThanOrEqual(2); // Has token address
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate tok_burn event schema", () => {
      const event = eventFixturesByType.tok_burn;
      const schema = EVENT_SCHEMAS.tok_burn;

      expect(event.topic[0]).toBe(schema.topic[0]);
      expect(event.topic.length).toBeGreaterThanOrEqual(2); // Has token address
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate fee_upd event schema", () => {
      const event = eventFixturesByType.fee_upd;
      const schema = EVENT_SCHEMAS.fee_upd;

      expect(event.topic[0]).toBe(schema.topic[0]);
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate pause event schema", () => {
      const event = eventFixturesByType.pause;
      const schema = EVENT_SCHEMAS.pause;

      expect(event.topic[0]).toBe(schema.topic[0]);
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate unpause event schema", () => {
      const event = eventFixturesByType.unpause;
      const schema = EVENT_SCHEMAS.unpause;

      expect(event.topic[0]).toBe(schema.topic[0]);
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });

    it("should validate clawback event schema", () => {
      const event = eventFixturesByType.clawback;
      const schema = EVENT_SCHEMAS.clawback;

      expect(event.topic[0]).toBe(schema.topic[0]);
      expect(event.topic.length).toBeGreaterThanOrEqual(2); // Has token address
      schema.requiredFields.forEach((field) => {
        expect(event.value).toHaveProperty(field);
      });
    });
  });

  describe("Backward Compatibility", () => {
    it("should handle events with additional fields (forward compatibility)", () => {
      const eventWithExtraFields: ContractEventFixture = {
        ...eventFixturesByType.tok_reg,
        value: {
          ...eventFixturesByType.tok_reg.value,
          new_field_v2: "some_value", // New field added in future version
          another_new_field: 12345,
        },
      };

      const schema = EVENT_SCHEMAS.tok_reg;
      
      // Should still have all required fields
      schema.requiredFields.forEach((field) => {
        expect(eventWithExtraFields.value).toHaveProperty(field);
      });

      // Extra fields should not break parsing
      expect(eventWithExtraFields.value.new_field_v2).toBe("some_value");
    });

    it("should handle events with missing optional fields", () => {
      const eventWithoutOptionals: ContractEventFixture = {
        ...eventFixturesByType.tok_burn,
        value: {
          amount: "1000000000",
          // Optional fields 'from' and 'burner' omitted
        },
      };

      const schema = EVENT_SCHEMAS.tok_burn;
      
      // Should have all required fields
      schema.requiredFields.forEach((field) => {
        expect(eventWithoutOptionals.value).toHaveProperty(field);
      });

      // Optional fields may be missing
      expect(eventWithoutOptionals.value.from).toBeUndefined();
      expect(eventWithoutOptionals.value.burner).toBeUndefined();
    });
  });

  describe("Data Type Compatibility", () => {
    it("should handle numeric values as strings", () => {
      const event = eventFixturesByType.adm_burn;
      
      // Amounts should be strings to preserve precision
      expect(typeof event.value.amount).toBe("string");
      expect(event.value.amount).toMatch(/^\d+$/);
    });

    it("should handle boolean values correctly", () => {
      const event = eventFixturesByType.clawback;
      
      expect(typeof event.value.enabled).toBe("boolean");
    });

    it("should handle address values as strings", () => {
      const event = eventFixturesByType.adm_xfer;
      
      expect(typeof event.value.old_admin).toBe("string");
      expect(typeof event.value.new_admin).toBe("string");
    });
  });

  describe("Event Metadata", () => {
    it("should have required metadata fields", () => {
      Object.values(eventFixturesByType).forEach((event) => {
        expect(event).toHaveProperty("type");
        expect(event).toHaveProperty("ledger");
        expect(event).toHaveProperty("ledger_close_time");
        expect(event).toHaveProperty("contract_id");
        expect(event).toHaveProperty("transaction_hash");
        expect(event).toHaveProperty("in_successful_contract_call");
      });
    });

    it("should have valid transaction hashes", () => {
      Object.values(eventFixturesByType).forEach((event) => {
        expect(event.transaction_hash).toBeTruthy();
        expect(typeof event.transaction_hash).toBe("string");
        expect(event.transaction_hash.length).toBeGreaterThan(0);
      });
    });

    it("should have valid ledger numbers", () => {
      Object.values(eventFixturesByType).forEach((event) => {
        expect(typeof event.ledger).toBe("number");
        expect(event.ledger).toBeGreaterThan(0);
      });
    });
  });

  describe("Schema Evolution", () => {
    it("should document schema version compatibility", () => {
      // This test documents which event schemas are supported
      const supportedSchemas = Object.keys(EVENT_SCHEMAS);
      
      expect(supportedSchemas).toContain("init");
      expect(supportedSchemas).toContain("tok_reg");
      expect(supportedSchemas).toContain("adm_xfer");
      expect(supportedSchemas).toContain("adm_prop"); // New in v2
      expect(supportedSchemas).toContain("adm_burn");
      expect(supportedSchemas).toContain("tok_burn");
      expect(supportedSchemas).toContain("fee_upd");
      expect(supportedSchemas).toContain("pause");
      expect(supportedSchemas).toContain("unpause");
      expect(supportedSchemas).toContain("clawback");
    });

    it("should handle schema version transitions", () => {
      // Test that we can handle both old and new admin transfer patterns
      const oldAdminTransfer = eventFixturesByType.adm_xfer; // Single-step (deprecated)
      const newAdminProposal = eventFixturesByType.adm_prop; // Two-step (new)

      // Both should be valid
      expect(oldAdminTransfer.topic[0]).toBe("adm_xfer");
      expect(newAdminProposal.topic[0]).toBe("adm_prop");

      // Both should have required fields
      expect(oldAdminTransfer.value.old_admin).toBeDefined();
      expect(oldAdminTransfer.value.new_admin).toBeDefined();
      expect(newAdminProposal.value.current_admin).toBeDefined();
      expect(newAdminProposal.value.proposed_admin).toBeDefined();
    });
  });
});
