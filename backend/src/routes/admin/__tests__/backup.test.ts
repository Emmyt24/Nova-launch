/**
 * Integration tests for Backup API Routes
 *
 * Coverage targets: >90% of backup.ts routes
 *
 * Strategy:
 *  - Mock BackupService methods to control outcomes
 *  - Test all four endpoints: status, list, trigger, restore
 *  - Verify authentication requirements
 *  - Test success, error, and validation scenarios
 *  - Check HTTP status codes and response formats
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import backupRouter from "../backup";
import { backupService } from "../../../services/backup";

// Mock the BackupService
vi.mock("../../../services/backup", () => ({
  backupService: {
    getStatus: vi.fn(),
    listBaseBackups: vi.fn(),
    createBaseBackup: vi.fn(),
    restore: vi.fn(),
  },
}));

// Mock the auth middleware
vi.mock("../../../middleware/auth", () => ({
  authenticateAdmin: (_req: any, res: any, next: any) => {
    const token = _req.headers.authorization?.replace("Bearer ", "");
    if (token === "valid-token") {
      next();
    } else {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED" } });
    }
  },
}));

let app: Express;

beforeEach(() => {
  vi.clearAllMocks();
  app = express();
  app.use(express.json());
  app.use("/api/admin/backup", backupRouter);
});

// ── GET /status ───────────────────────────────────────────────────────────────

describe("GET /api/admin/backup/status", () => {
  it("returns backup status when authenticated", async () => {
    const mockStatus = {
      latestBaseBackup: "20260428T145816Z",
      walSegmentCount: 42,
      walArchiveSize: "512M",
      storagePath: "/var/backups/nova/pitr",
    };

    vi.mocked(backupService.getStatus).mockResolvedValueOnce(mockStatus);

    const res = await request(app)
      .get("/api/admin/backup/status")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: mockStatus });
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .get("/api/admin/backup/status")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when no auth header provided", async () => {
    const res = await request(app).get("/api/admin/backup/status");

    expect(res.status).toBe(401);
  });

  it("returns error when service throws", async () => {
    vi.mocked(backupService.getStatus).mockRejectedValueOnce(
      new Error("Database connection failed")
    );

    const res = await request(app)
      .get("/api/admin/backup/status")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: "BACKUP_STATUS_ERROR",
        message: "Failed to fetch backup status",
      },
    });
  });
});

// ── GET /list ──────────────────────────────────────────────────────────────────

describe("GET /api/admin/backup/list", () => {
  it("returns list of backups when authenticated", async () => {
    const mockBackups = [
      "20260428T145816Z",
      "20260428T085816Z",
      "20260427T145816Z",
    ];

    vi.mocked(backupService.listBaseBackups).mockResolvedValueOnce(mockBackups);

    const res = await request(app)
      .get("/api/admin/backup/list")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { backups: mockBackups, count: 3 },
    });
  });

  it("returns empty list when no backups exist", async () => {
    vi.mocked(backupService.listBaseBackups).mockResolvedValueOnce([]);

    const res = await request(app)
      .get("/api/admin/backup/list")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ backups: [], count: 0 });
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/admin/backup/list");

    expect(res.status).toBe(401);
  });

  it("returns error when service throws", async () => {
    vi.mocked(backupService.listBaseBackups).mockRejectedValueOnce(
      new Error("File system error")
    );

    const res = await request(app)
      .get("/api/admin/backup/list")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("BACKUP_LIST_ERROR");
  });
});

// ── POST /trigger ──────────────────────────────────────────────────────────────

describe("POST /api/admin/backup/trigger", () => {
  it("triggers a backup and returns success", async () => {
    const mockResult = {
      success: true,
      message: "Base backup completed successfully",
      backupLabel: "nova-pitr-20260428T145816Z",
      durationMs: 1234,
    };

    vi.mocked(backupService.createBaseBackup).mockResolvedValueOnce(mockResult);

    const res = await request(app)
      .post("/api/admin/backup/trigger")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: mockResult });
  });

  it("returns 500 when backup fails", async () => {
    const mockResult = {
      success: false,
      message: "pg_basebackup: could not connect to server",
      durationMs: 500,
    };

    vi.mocked(backupService.createBaseBackup).mockResolvedValueOnce(mockResult);

    const res = await request(app)
      .post("/api/admin/backup/trigger")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("BACKUP_FAILED");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/admin/backup/trigger")
      .send({});

    expect(res.status).toBe(401);
  });

  it("returns error when service throws", async () => {
    vi.mocked(backupService.createBaseBackup).mockRejectedValueOnce(
      new Error("Service unavailable")
    );

    const res = await request(app)
      .post("/api/admin/backup/trigger")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("BACKUP_TRIGGER_ERROR");
  });
});

// ── POST /restore ──────────────────────────────────────────────────────────────

describe("POST /api/admin/backup/restore", () => {
  it("performs dry-run when confirmed=false", async () => {
    const mockResult = {
      success: true,
      message: "Dry-run complete. No changes made. Would restore to 2026-04-28T12:00:00Z.",
      dryRun: true,
      durationMs: 456,
    };

    vi.mocked(backupService.restore).mockResolvedValueOnce(mockResult);

    const res = await request(app)
      .post("/api/admin/backup/restore")
      .set("Authorization", "Bearer valid-token")
      .send({
        targetTime: "2026-04-28T12:00:00Z",
        confirmed: false,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: mockResult });
    expect(vi.mocked(backupService.restore)).toHaveBeenCalledWith({
      targetTime: "2026-04-28T12:00:00Z",
      baseLabel: undefined,
      confirmed: false,
    });
  });

  it("executes restore when confirmed=true", async () => {
    const mockResult = {
      success: true,
      message:
        "Restore to 2026-04-28T12:00:00Z initiated. Start PostgreSQL to begin WAL replay.",
      dryRun: false,
      durationMs: 2000,
    };

    vi.mocked(backupService.restore).mockResolvedValueOnce(mockResult);

    const res = await request(app)
      .post("/api/admin/backup/restore")
      .set("Authorization", "Bearer valid-token")
      .send({
        targetTime: "2026-04-28T12:00:00Z",
        confirmed: true,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: mockResult });
  });

  it("passes baseLabel to service when provided", async () => {
    vi.mocked(backupService.restore).mockResolvedValueOnce({
      success: true,
      message: "Dry-run complete",
      dryRun: true,
      durationMs: 100,
    });

    await request(app)
      .post("/api/admin/backup/restore")
      .set("Authorization", "Bearer valid-token")
      .send({
        targetTime: "2026-04-28T12:00:00Z",
        baseLabel: "20260428T100000Z",
        confirmed: false,
      });

    expect(vi.mocked(backupService.restore)).toHaveBeenCalledWith({
      targetTime: "2026-04-28T12:00:00Z",
      baseLabel: "20260428T100000Z",
      confirmed: false,
    });
  });

  it("returns 400 when targetTime is missing", async () => {
    const res = await request(app)
      .post("/api/admin/backup/restore")
      .set("Authorization", "Bearer valid-token")
      .send({
        confirmed: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MISSING_TARGET_TIME");
  });

  it("returns 400 when confirmed is missing", async () => {
    const res = await request(app)
      .post("/api/admin/backup/restore")
      .set("Authorization", "Bearer valid-token")
      .send({
        targetTime: "2026-04-28T12:00:00Z",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MISSING_CONFIRMED");
  });

  it("returns 400 when confirmed is not a boolean", async () => {
    const res = await request(app)
      .post("/api/admin/backup/restore")
      .set("Authorization", "Bearer valid-token")
      .send({
        targetTime: "2026-04-28T12:00:00Z",
        confirmed: "yes",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MISSING_CONFIRMED");
  });

  it("returns 500 when restore fails", async () => {
    const mockResult = {
      success: false,
      message: "No base backup found",
      dryRun: false,
      durationMs: 300,
    };

    vi.mocked(backupService.restore).mockResolvedValueOnce(mockResult);

    const res = await request(app)
      .post("/api/admin/backup/restore")
      .set("Authorization", "Bearer valid-token")
      .send({
        targetTime: "2026-04-28T12:00:00Z",
        confirmed: true,
      });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("RESTORE_FAILED");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/admin/backup/restore")
      .send({
        targetTime: "2026-04-28T12:00:00Z",
        confirmed: false,
      });

    expect(res.status).toBe(401);
  });

  it("returns error when service throws", async () => {
    vi.mocked(backupService.restore).mockRejectedValueOnce(
      new Error("Unexpected error")
    );

    const res = await request(app)
      .post("/api/admin/backup/restore")
      .set("Authorization", "Bearer valid-token")
      .send({
        targetTime: "2026-04-28T12:00:00Z",
        confirmed: false,
      });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("RESTORE_ERROR");
  });
});
