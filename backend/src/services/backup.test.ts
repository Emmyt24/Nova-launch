/**
 * Tests for BackupService
 *
 * Coverage targets: >90% of backup.ts
 *
 * Strategy:
 *  - All child_process.execFile calls are mocked so tests run without
 *    PostgreSQL, pg_basebackup, or the shell scripts being present.
 *  - fs/promises is mocked to control directory listings.
 *  - Each public method is tested for success, failure, and edge cases.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import path from "path";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("util", () => ({
  promisify: (fn: any) => fn,
}));

const mockReaddir = vi.fn();

vi.mock("fs/promises", () => ({
  default: {
    readdir: (...args: any[]) => mockReaddir(...args),
  },
  readdir: (...args: any[]) => mockReaddir(...args),
}));

import { execFile } from "child_process";
import { BackupService } from "./backup";

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a BackupService with a fixed storage path for deterministic tests. */
function makeService(storagePath = "/test/pitr", scriptsDir = "/test/scripts") {
  return new BackupService(storagePath, scriptsDir);
}

/** Resolves execFile with stdout/stderr. */
function resolveExec(stdout = "", stderr = "") {
  mockExecFile.mockResolvedValueOnce({ stdout, stderr });
}

/** Rejects execFile with an error. */
function rejectExec(message = "exec error") {
  mockExecFile.mockRejectedValueOnce(new Error(message));
}

// ── createBaseBackup ──────────────────────────────────────────────────────────

describe("BackupService.createBaseBackup", () => {
  let service: BackupService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();
  });

  it("returns success with backupLabel when script succeeds", async () => {
    resolveExec(
      "2026-04-28T15:58:16.041+01:00 [OK]    Base backup complete: /test/pitr/base/20260428T145816Z (42M)\n" +
        "nova-pitr-20260428T145816Z"
    );

    const result = await service.createBaseBackup();

    expect(result.success).toBe(true);
    expect(result.message).toBe("Base backup completed successfully");
    expect(result.backupLabel).toBe("nova-pitr-20260428T145816Z");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns success without backupLabel when label not in output", async () => {
    resolveExec("Backup done");

    const result = await service.createBaseBackup();

    expect(result.success).toBe(true);
    expect(result.backupLabel).toBeUndefined();
  });

  it("returns failure when script throws", async () => {
    rejectExec("pg_basebackup: could not connect to server");

    const result = await service.createBaseBackup();

    expect(result.success).toBe(false);
    expect(result.message).toContain("pg_basebackup: could not connect to server");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls bash with the correct script path and 'base' argument", async () => {
    resolveExec();

    await service.createBaseBackup();

    expect(mockExecFile).toHaveBeenCalledWith(
      "bash",
      [path.join("/test/scripts", "backup-db.sh"), "base"],
      expect.objectContaining({ timeout: 30 * 60 * 1000 })
    );
  });

  it("records durationMs > 0 on slow operations", async () => {
    mockExecFile.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ stdout: "", stderr: "" }), 10)
        )
    );

    const result = await service.createBaseBackup();
    expect(result.durationMs).toBeGreaterThan(0);
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe("BackupService.getStatus", () => {
  let service: BackupService;

  beforeEach(() => {
    service = makeService("/test/pitr");
    vi.clearAllMocks();
  });

  it("returns status with latest backup and WAL info", async () => {
    // readdir for base dir
    mockReaddir.mockResolvedValueOnce([
      { name: "20260427T120000Z", isDirectory: () => true },
      { name: "20260428T120000Z", isDirectory: () => true },
    ]);
    // readdir for WAL dir (count)
    mockReaddir.mockResolvedValueOnce(["000000010000000000000001", "000000010000000000000002"]);
    // du for WAL size
    resolveExec("128M\t/test/pitr/wal");

    const status = await service.getStatus();

    expect(status.latestBaseBackup).toBe("20260428T120000Z");
    expect(status.walSegmentCount).toBe(2);
    expect(status.walArchiveSize).toBe("128M");
    expect(status.storagePath).toBe("/test/pitr");
  });

  it("returns null latestBaseBackup when base dir is empty", async () => {
    mockReaddir.mockResolvedValueOnce([]); // base dir empty
    mockReaddir.mockResolvedValueOnce([]); // wal dir empty
    resolveExec("0\t/test/pitr/wal");

    const status = await service.getStatus();

    expect(status.latestBaseBackup).toBeNull();
    expect(status.walSegmentCount).toBe(0);
  });

  it("returns null latestBaseBackup when base dir does not exist", async () => {
    mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
    mockReaddir.mockResolvedValueOnce([]);
    resolveExec("0\t/test/pitr/wal");

    const status = await service.getStatus();

    expect(status.latestBaseBackup).toBeNull();
  });

  it("returns 0 walSegmentCount when WAL dir does not exist", async () => {
    mockReaddir.mockResolvedValueOnce([]);
    mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
    resolveExec("0\t/test/pitr/wal");

    const status = await service.getStatus();

    expect(status.walSegmentCount).toBe(0);
  });

  it("returns '0' walArchiveSize when du fails", async () => {
    mockReaddir.mockResolvedValueOnce([]);
    mockReaddir.mockResolvedValueOnce([]);
    rejectExec("du: command not found");

    const status = await service.getStatus();

    expect(status.walArchiveSize).toBe("0");
  });

  it("ignores non-directory entries in base dir", async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: "20260428T120000Z", isDirectory: () => true },
      { name: "backup_label.json", isDirectory: () => false },
    ]);
    mockReaddir.mockResolvedValueOnce([]);
    resolveExec("0\t/test/pitr/wal");

    const status = await service.getStatus();

    expect(status.latestBaseBackup).toBe("20260428T120000Z");
  });
});

// ── listBaseBackups ───────────────────────────────────────────────────────────

describe("BackupService.listBaseBackups", () => {
  let service: BackupService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();
  });

  it("returns labels sorted newest first", async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: "20260426T000000Z", isDirectory: () => true },
      { name: "20260428T000000Z", isDirectory: () => true },
      { name: "20260427T000000Z", isDirectory: () => true },
    ]);

    const list = await service.listBaseBackups();

    expect(list).toEqual([
      "20260428T000000Z",
      "20260427T000000Z",
      "20260426T000000Z",
    ]);
  });

  it("returns empty array when base dir does not exist", async () => {
    mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));

    const list = await service.listBaseBackups();

    expect(list).toEqual([]);
  });

  it("excludes files (non-directories)", async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: "20260428T000000Z", isDirectory: () => true },
      { name: "pitr-backup.log", isDirectory: () => false },
    ]);

    const list = await service.listBaseBackups();

    expect(list).toEqual(["20260428T000000Z"]);
  });

  it("returns empty array when no backups exist", async () => {
    mockReaddir.mockResolvedValueOnce([]);

    const list = await service.listBaseBackups();

    expect(list).toEqual([]);
  });
});

// ── restore ───────────────────────────────────────────────────────────────────

describe("BackupService.restore", () => {
  let service: BackupService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();
  });

  it("returns validation error for invalid targetTime format", async () => {
    const result = await service.restore({
      targetTime: "not-a-date",
      confirmed: false,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid targetTime format");
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("rejects targetTime missing seconds", async () => {
    const result = await service.restore({
      targetTime: "2026-04-28T12:00Z",
      confirmed: false,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid targetTime format");
  });

  it("performs dry-run when confirmed=false", async () => {
    resolveExec("Dry-run complete");

    const result = await service.restore({
      targetTime: "2026-04-28T12:00:00Z",
      confirmed: false,
    });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.message).toContain("Dry-run");

    const callArgs = mockExecFile.mock.calls[0];
    expect(callArgs[1]).toContain("--dry-run");
  });

  it("executes restore when confirmed=true", async () => {
    resolveExec("Restore initiated");

    const result = await service.restore({
      targetTime: "2026-04-28T12:00:00Z",
      confirmed: true,
    });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.message).toContain("2026-04-28T12:00:00Z");

    const callArgs = mockExecFile.mock.calls[0];
    expect(callArgs[1]).not.toContain("--dry-run");
  });

  it("passes --base when baseLabel is provided", async () => {
    resolveExec();

    await service.restore({
      targetTime: "2026-04-28T12:00:00Z",
      baseLabel: "20260428T100000Z",
      confirmed: false,
    });

    const callArgs = mockExecFile.mock.calls[0];
    expect(callArgs[1]).toContain("--base");
    expect(callArgs[1]).toContain("20260428T100000Z");
  });

  it("does not pass --base when baseLabel is omitted", async () => {
    resolveExec();

    await service.restore({
      targetTime: "2026-04-28T12:00:00Z",
      confirmed: false,
    });

    const callArgs = mockExecFile.mock.calls[0];
    expect(callArgs[1]).not.toContain("--base");
  });

  it("returns failure when script throws", async () => {
    rejectExec("No base backup found");

    const result = await service.restore({
      targetTime: "2026-04-28T12:00:00Z",
      confirmed: true,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("No base backup found");
  });

  it("calls bash with the correct restore script path", async () => {
    resolveExec();

    await service.restore({
      targetTime: "2026-04-28T12:00:00Z",
      confirmed: false,
    });

    expect(mockExecFile).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining([path.join("/test/scripts", "restore-db.sh")]),
      expect.objectContaining({ timeout: 60 * 60 * 1000 })
    );
  });

  it("records durationMs on failure", async () => {
    rejectExec("timeout");

    const result = await service.restore({
      targetTime: "2026-04-28T12:00:00Z",
      confirmed: true,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("accepts valid ISO-8601 UTC timestamps", async () => {
    resolveExec();

    const result = await service.restore({
      targetTime: "2026-01-01T00:00:00Z",
      confirmed: false,
    });

    expect(result.success).toBe(true);
  });
});

// ── Singleton export ──────────────────────────────────────────────────────────

describe("backupService singleton", () => {
  it("exports a BackupService instance", async () => {
    const { backupService } = await import("./backup");
    expect(backupService).toBeInstanceOf(BackupService);
  });
});
