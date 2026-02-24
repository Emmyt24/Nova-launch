import { IsEnum, IsOptional, IsEthereumAddress } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum TimePeriod {
  H24 = "24h",
  D7 = "7d",
  D30 = "30d",
  D90 = "90d",
  ALL = "all",
}

export class GetAnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: TimePeriod,
    default: TimePeriod.D7,
    description: "Time period for analytics data",
  })
  @IsOptional()
  @IsEnum(TimePeriod)
  period?: TimePeriod = TimePeriod.D7;
}

export class TimeSeriesDataPoint {
  @ApiProperty() timestamp: string;
  @ApiProperty() value: string;
  @ApiProperty() count: number;
}

export class BurnTypeDistribution {
  @ApiProperty() self: string;
  @ApiProperty() admin: string;
  @ApiProperty() selfPercentage: number;
  @ApiProperty() adminPercentage: number;
}

export class PeriodStats {
  @ApiProperty() volume: string;
  @ApiProperty() count: number;
  @ApiProperty() uniqueBurners: number;
}

export class TokenAnalyticsResponseDto {
  @ApiProperty() tokenAddress: string;
  @ApiProperty() period: TimePeriod;
  @ApiProperty() generatedAt: string;

  // All-time stats
  @ApiProperty() totalBurned: string;
  @ApiProperty() totalBurnCount: number;
  @ApiProperty() allTimeUniqueBurners: number;
  @ApiProperty() largestBurn: string;
  @ApiProperty() largestBurnTx: string;

  // Period stats
  @ApiProperty({ type: PeriodStats }) stats24h: PeriodStats;
  @ApiProperty({ type: PeriodStats }) stats7d: PeriodStats;
  @ApiProperty({ type: PeriodStats }) stats30d: PeriodStats;

  // Current period stats
  @ApiProperty() periodVolume: string;
  @ApiProperty() periodBurnCount: number;
  @ApiProperty() periodUniqueBurners: number;
  @ApiProperty() averageBurnAmount: string;
  @ApiProperty() burnFrequencyPerDay: number;

  // Comparison vs previous period
  @ApiProperty() volumeChangePercent: number;
  @ApiProperty() countChangePercent: number;

  // Chart data
  @ApiProperty({ type: [TimeSeriesDataPoint] })
  timeSeries: TimeSeriesDataPoint[];

  // Distribution
  @ApiProperty({ type: BurnTypeDistribution })
  burnTypeDistribution: BurnTypeDistribution;
}
