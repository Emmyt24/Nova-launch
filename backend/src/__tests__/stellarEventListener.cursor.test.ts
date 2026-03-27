import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { EventCursorStore } from "../services/eventCursorStore";

describe("EventCursorStore", () => {
  let prisma: PrismaClient;
  let store: EventCursorStore;

  beforeEach(async () => {
    prisma = new PrismaClient();
    store = new EventCursorStore(prisma);
    await prisma.integrationState.deleteMany({ where: { key: "stellar_event_cursor" } });
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it("returns null on first boot when no env origin is set", async () => {
    delete process.env.STELLAR_CURSOR_ORIGIN;
    const cursor = await store.load();
    expect(cursor).toBeNull();
  });

  it("returns STELLAR_CURSOR_ORIGIN on first boot when env is set", async () => {
    process.env.STELLAR_CURSOR_ORIGIN = "0000000000000000";
    const cursor = await store.load();
    expect(cursor).toBe("0000000000000000");
    delete process.env.STELLAR_CURSOR_ORIGIN;
  });

  it("persists and reloads a cursor", async () => {
    await store.save("cursor-abc-123");
    const cursor = await store.load();
    expect(cursor).toBe("cursor-abc-123");
  });

  it("overwrites cursor on subsequent saves (upsert)", async () => {
    await store.save("cursor-first");
    await store.save("cursor-second");
    const cursor = await store.load();
    expect(cursor).toBe("cursor-second");
  });
});

describe("StellarEventListener cursor resume", () => {
  let prisma: PrismaClient;
  let store: EventCursorStore;

  beforeEach(async () => {
    prisma = new PrismaClient();
    store = new EventCursorStore(prisma);
    await prisma.integrationState.deleteMany({ where: { key: "stellar_event_cursor" } });
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it("resumes from last saved cursor after simulated restart", async () => {
    // Simulate first run: process events and save cursor
    await store.save("paging-token-42");

    // Simulate restart: new store instance loads the cursor
    const storeAfterRestart = new EventCursorStore(prisma);
    const resumedCursor = await storeAfterRestart.load();

    expect(resumedCursor).toBe("paging-token-42");
  });

  it("does not corrupt state when same cursor is saved twice", async () => {
    await store.save("paging-token-99");
    await store.save("paging-token-99"); // replay same cursor

    const cursor = await store.load();
    expect(cursor).toBe("paging-token-99");

    const rows = await prisma.integrationState.count({
      where: { key: "stellar_event_cursor" },
    });
    expect(rows).toBe(1);
  });
});
