import { describe, it, expect, beforeEach } from "vitest";
import { Database } from "../config/database";

describe("Admin API Tests", () => {
  beforeEach(() => {
    Database.initialize();
  });

  describe("Database Operations", () => {
    it("should find user by id", async () => {
      const user = await Database.findUserById("admin_1");
      expect(user).toBeDefined();
      expect(user?.role).toBe("super_admin");
    });

    it("should get all tokens", async () => {
      const tokens = await Database.getAllTokens();
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should update token", async () => {
      const updated = await Database.updateToken("token_1", { flagged: true });
      expect(updated?.flagged).toBe(true);
    });

    it("should soft delete token", async () => {
      const success = await Database.softDeleteToken("token_1");
      expect(success).toBe(true);

      const token = await Database.findTokenById("token_1");
      expect(token?.deleted).toBe(true);
    });

    it("should create audit log", async () => {
      const log = await Database.createAuditLog({
        adminId: "admin_1",
        action: "TEST_ACTION",
        resource: "test",
        resourceId: "test_1",
        beforeState: null,
        afterState: { test: true },
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      });

      expect(log.id).toBeDefined();
      expect(log.action).toBe("TEST_ACTION");
    });

    it("should filter audit logs", async () => {
      await Database.createAuditLog({
        adminId: "admin_1",
        action: "CREATE_TOKEN",
        resource: "token",
        resourceId: "token_1",
        beforeState: null,
        afterState: {},
        ipAddress: "127.0.0.1",
        userAgent: "test",
      });

      const logs = await Database.getAuditLogs({ adminId: "admin_1" });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].adminId).toBe("admin_1");
    });
  });

  describe("User Management", () => {
    it("should ban user", async () => {
      const user = await Database.updateUser("admin_1", { banned: true });
      expect(user?.banned).toBe(true);
    });

    it("should change user role", async () => {
      const user = await Database.updateUser("admin_1", { role: "admin" });
      expect(user?.role).toBe("admin");
    });

    it("should find user by address", async () => {
      const user = await Database.findUserByAddress(
        "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      );
      expect(user).toBeDefined();
      expect(user?.id).toBe("admin_1");
    });
  });

  describe("Token Management", () => {
    it("should flag token", async () => {
      const token = await Database.updateToken("token_1", { flagged: true });
      expect(token?.flagged).toBe(true);
    });

    it("should update token metadata", async () => {
      const metadata = { description: "Updated description", verified: true };
      const token = await Database.updateToken("token_1", { metadata });
      expect(token?.metadata).toEqual(metadata);
    });

    it("should exclude deleted tokens by default", async () => {
      await Database.softDeleteToken("token_1");
      const tokens = await Database.getAllTokens(false);
      expect(tokens.find((t) => t.id === "token_1")).toBeUndefined();
    });

    it("should include deleted tokens when requested", async () => {
      await Database.softDeleteToken("token_1");
      const tokens = await Database.getAllTokens(true);
      expect(tokens.find((t) => t.id === "token_1")).toBeDefined();
    });
  });
});
