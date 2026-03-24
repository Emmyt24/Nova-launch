import { PrismaClient } from "@prisma/client";

const CURSOR_KEY = "stellar_event_cursor";

/**
 * Durable cursor store backed by Prisma IntegrationState.
 *
 * Replay strategy:
 *  - On first boot (no row) the listener starts from STELLAR_CURSOR_ORIGIN
 *    (env var) or "now" (Horizon default), so only new events are ingested.
 *  - On restart the stored cursor is loaded and passed to Horizon as `cursor`,
 *    resuming exactly where processing stopped.
 *  - Because all downstream handlers are idempotent, replaying the last event
 *    (cursor points to the event just before the last one processed) is safe.
 */
export class EventCursorStore {
  constructor(private readonly prisma: PrismaClient) {}

  async load(): Promise<string | null> {
    const row = await this.prisma.integrationState.findUnique({
      where: { key: CURSOR_KEY },
    });
    return row?.value ?? process.env.STELLAR_CURSOR_ORIGIN ?? null;
  }

  async save(cursor: string): Promise<void> {
    await this.prisma.integrationState.upsert({
      where: { key: CURSOR_KEY },
      create: { key: CURSOR_KEY, value: cursor },
      update: { value: cursor },
    });
  }
}
