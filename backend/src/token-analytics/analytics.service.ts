import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { BurnEvent, BurnType } from "./entities/burn-event.entity";
import {
  TimePeriod,
  TokenAnalyticsResponseDto,
  TimeSeriesDataPoint,
  PeriodStats,
} from "./dto/analytics.dto";

interface PeriodWindow {
  start: Date;
  end: Date;
  granularity: "hour" | "day" | "week" | "month";
  intervalCount: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(BurnEvent)
    private readonly burnRepo: Repository<BurnEvent>,
    private readonly dataSource: DataSource
  ) {}

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  async getTokenAnalytics(
    tokenAddress: string,
    period: TimePeriod
  ): Promise<TokenAnalyticsResponseDto> {
    const normalizedAddress = tokenAddress.toLowerCase();

    // Verify token has any burns at all
    const exists = await this.burnRepo.count({
      where: { tokenAddress: normalizedAddress },
    });
    if (exists === 0) {
      throw new NotFoundException(
        `No burn data found for token ${tokenAddress}`
      );
    }

    const window = this.getPeriodWindow(period);
    const prevWindow = this.getPreviousWindow(window);

    const [
      allTimeStats,
      periodBurns,
      prevPeriodBurns,
      stats24h,
      stats7d,
      stats30d,
      timeSeries,
      burnTypeDistribution,
      largestBurnRow,
    ] = await Promise.all([
      this.getAllTimeStats(normalizedAddress),
      this.getPeriodStats(normalizedAddress, window.start, window.end),
      this.getPeriodStats(normalizedAddress, prevWindow.start, prevWindow.end),
      this.getPeriodStats(normalizedAddress, this.hoursAgo(24), new Date()),
      this.getPeriodStats(normalizedAddress, this.daysAgo(7), new Date()),
      this.getPeriodStats(normalizedAddress, this.daysAgo(30), new Date()),
      this.buildTimeSeries(normalizedAddress, window),
      this.getBurnTypeDistribution(normalizedAddress, window.start, window.end),
      this.getLargestBurn(normalizedAddress),
    ]);

    const volumeChangePercent = this.calcChangePercent(
      BigInt(prevPeriodBurns.volume),
      BigInt(periodBurns.volume)
    );
    const countChangePercent = this.calcChangePercent(
      BigInt(prevPeriodBurns.count),
      BigInt(periodBurns.count)
    );

    const durationDays = this.windowDurationDays(window);
    const burnFrequencyPerDay =
      durationDays > 0
        ? Math.round((periodBurns.count / durationDays) * 100) / 100
        : 0;

    const averageBurnAmount =
      periodBurns.count > 0
        ? (BigInt(periodBurns.volume) / BigInt(periodBurns.count)).toString()
        : "0";

    return {
      tokenAddress,
      period,
      generatedAt: new Date().toISOString(),

      // All-time
      totalBurned: allTimeStats.totalVolume,
      totalBurnCount: allTimeStats.totalCount,
      allTimeUniqueBurners: allTimeStats.uniqueBurners,
      largestBurn: largestBurnRow?.amount ?? "0",
      largestBurnTx: largestBurnRow?.txHash ?? "",

      // Fixed-window stats
      stats24h,
      stats7d,
      stats30d,

      // Current period
      periodVolume: periodBurns.volume,
      periodBurnCount: periodBurns.count,
      periodUniqueBurners: periodBurns.uniqueBurners,
      averageBurnAmount,
      burnFrequencyPerDay,

      // Comparison
      volumeChangePercent,
      countChangePercent,

      // Chart
      timeSeries,
      burnTypeDistribution,
    };
  }

  // ──────────────────────────────────────────────
  // Query helpers
  // ──────────────────────────────────────────────

  private async getAllTimeStats(tokenAddress: string) {
    const row = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(amount::numeric), 0)::text AS "totalVolume",
         COUNT(*)::int                           AS "totalCount",
         COUNT(DISTINCT burner_address)::int     AS "uniqueBurners"
       FROM burn_events
       WHERE token_address = $1`,
      [tokenAddress]
    );
    return row[0] as {
      totalVolume: string;
      totalCount: number;
      uniqueBurners: number;
    };
  }

  private async getPeriodStats(
    tokenAddress: string,
    start: Date,
    end: Date
  ): Promise<PeriodStats> {
    const row = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(amount::numeric), 0)::text AS volume,
         COUNT(*)::int                           AS count,
         COUNT(DISTINCT burner_address)::int     AS "uniqueBurners"
       FROM burn_events
       WHERE token_address = $1
         AND burned_at >= $2
         AND burned_at < $3`,
      [tokenAddress, start, end]
    );
    return row[0] as PeriodStats;
  }

  private async getLargestBurn(
    tokenAddress: string
  ): Promise<BurnEvent | null> {
    return this.burnRepo.findOne({
      where: { tokenAddress },
      order: { amount: "DESC" } as any,
    });
  }

  private async getBurnTypeDistribution(
    tokenAddress: string,
    start: Date,
    end: Date
  ) {
    const rows: { burn_type: BurnType; volume: string; cnt: number }[] =
      await this.dataSource.query(
        `SELECT
           burn_type,
           COALESCE(SUM(amount::numeric), 0)::text AS volume,
           COUNT(*)::int AS cnt
         FROM burn_events
         WHERE token_address = $1
           AND burned_at >= $2
           AND burned_at < $3
         GROUP BY burn_type`,
        [tokenAddress, start, end]
      );

    const byType = (type: BurnType) =>
      rows.find((r) => r.burn_type === type) ?? { volume: "0", cnt: 0 };

    const selfRow = byType(BurnType.SELF);
    const adminRow = byType(BurnType.ADMIN);

    const totalVolume = BigInt(selfRow.volume) + BigInt(adminRow.volume);

    const pct = (v: bigint) =>
      totalVolume === 0n
        ? 0
        : Math.round(Number((v * 10000n) / totalVolume) / 100);

    return {
      self: selfRow.volume,
      admin: adminRow.volume,
      selfPercentage: pct(BigInt(selfRow.volume)),
      adminPercentage: pct(BigInt(adminRow.volume)),
    };
  }

  private async buildTimeSeries(
    tokenAddress: string,
    window: PeriodWindow
  ): Promise<TimeSeriesDataPoint[]> {
    const pgTrunc = {
      hour: "hour",
      day: "day",
      week: "week",
      month: "month",
    }[window.granularity];

    const rows: { ts: string; value: string; count: number }[] =
      await this.dataSource.query(
        `SELECT
           DATE_TRUNC('${pgTrunc}', burned_at)::text AS ts,
           COALESCE(SUM(amount::numeric), 0)::text   AS value,
           COUNT(*)::int                             AS count
         FROM burn_events
         WHERE token_address = $1
           AND burned_at >= $2
           AND burned_at < $3
         GROUP BY DATE_TRUNC('${pgTrunc}', burned_at)
         ORDER BY ts ASC`,
        [tokenAddress, window.start, window.end]
      );

    // Fill gaps so the chart has a complete series
    return this.fillTimeSeriesGaps(rows, window);
  }

  private fillTimeSeriesGaps(
    rows: { ts: string; value: string; count: number }[],
    window: PeriodWindow
  ): TimeSeriesDataPoint[] {
    const map = new Map(rows.map((r) => [r.ts.slice(0, 16), r]));
    const result: TimeSeriesDataPoint[] = [];

    const cursor = new Date(window.start);
    while (cursor < window.end) {
      const key = cursor.toISOString().slice(0, 16);
      const row = map.get(key);
      result.push({
        timestamp: cursor.toISOString(),
        value: row?.value ?? "0",
        count: row?.count ?? 0,
      });
      this.advanceCursor(cursor, window.granularity);
    }

    return result;
  }

  // ──────────────────────────────────────────────
  // Time-window utilities
  // ──────────────────────────────────────────────

  private getPeriodWindow(period: TimePeriod): PeriodWindow {
    const now = new Date();
    switch (period) {
      case TimePeriod.H24:
        return {
          start: this.hoursAgo(24),
          end: now,
          granularity: "hour",
          intervalCount: 24,
        };
      case TimePeriod.D7:
        return {
          start: this.daysAgo(7),
          end: now,
          granularity: "day",
          intervalCount: 7,
        };
      case TimePeriod.D30:
        return {
          start: this.daysAgo(30),
          end: now,
          granularity: "day",
          intervalCount: 30,
        };
      case TimePeriod.D90:
        return {
          start: this.daysAgo(90),
          end: now,
          granularity: "week",
          intervalCount: 13,
        };
      case TimePeriod.ALL:
      default:
        return {
          start: new Date("2020-01-01"),
          end: now,
          granularity: "month",
          intervalCount: 0,
        };
    }
  }

  private getPreviousWindow(window: PeriodWindow): PeriodWindow {
    const duration = window.end.getTime() - window.start.getTime();
    return {
      start: new Date(window.start.getTime() - duration),
      end: window.start,
      granularity: window.granularity,
      intervalCount: window.intervalCount,
    };
  }

  private windowDurationDays(window: PeriodWindow): number {
    return (window.end.getTime() - window.start.getTime()) / 86_400_000;
  }

  private hoursAgo(h: number): Date {
    return new Date(Date.now() - h * 3_600_000);
  }

  private daysAgo(d: number): Date {
    return new Date(Date.now() - d * 86_400_000);
  }

  private advanceCursor(d: Date, granularity: PeriodWindow["granularity"]) {
    switch (granularity) {
      case "hour":
        d.setHours(d.getHours() + 1);
        break;
      case "day":
        d.setDate(d.getDate() + 1);
        break;
      case "week":
        d.setDate(d.getDate() + 7);
        break;
      case "month":
        d.setMonth(d.getMonth() + 1);
        break;
    }
  }

  private calcChangePercent(prev: bigint, curr: bigint): number {
    if (prev === 0n) return curr > 0n ? 100 : 0;
    const change = Number(((curr - prev) * 10000n) / prev) / 100;
    return Math.round(change * 100) / 100;
  }
}
