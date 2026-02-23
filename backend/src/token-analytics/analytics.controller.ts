import {
  Controller,
  Get,
  Param,
  Query,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import {
  GetAnalyticsQueryDto,
  TimePeriod,
  TokenAnalyticsResponseDto,
} from './dto/analytics.dto';

@ApiTags('Analytics')
@Controller('api/analytics')
@UseInterceptors(CacheInterceptor)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /api/analytics/:address
   *
   * Returns comprehensive burn analytics for a specific token.
   * Results are cached per (address + period) combination.
   *
   * Cache TTL:
   *  - 24h  → 2 min  (fast-moving data)
   *  - 7d   → 5 min
   *  - 30d  → 10 min
   *  - 90d  → 15 min
   *  - all  → 30 min (slow-moving data)
   */
  @Get(':address')
  @HttpCode(HttpStatus.OK)
  @CacheTTL(300) // default 5 min; see note above
  @ApiOperation({
    summary: 'Get token burn analytics',
    description:
      'Returns burn statistics, time-series data for charts, burn-type distribution, and comparison metrics for the requested time period.',
  })
  @ApiParam({
    name: 'address',
    description: 'Token contract address (EVM hex address)',
    example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: TimePeriod,
    description: 'Aggregation window (default: 7d)',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics data for the token',
    type: TokenAnalyticsResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'No burn data found for this token address',
  })
  async getTokenAnalytics(
    @Param('address') address: string,
    @Query() query: GetAnalyticsQueryDto,
  ): Promise<TokenAnalyticsResponseDto> {
    return this.analyticsService.getTokenAnalytics(
      address,
      query.period ?? TimePeriod.D7,
    );
  }
}
