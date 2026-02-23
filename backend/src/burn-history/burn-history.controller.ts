import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { BurnHistoryService } from './burn-history.service';
import {
  BurnHistoryQueryDto,
  BurnType,
  SortBy,
  SortOrder,
} from './dto/burn-history-query.dto';
import { BurnHistoryResponse } from './interfaces/burn-history.interface';

@ApiTags('Burn')
@Controller('api/burn')
export class BurnHistoryController {
  private readonly logger = new Logger(BurnHistoryController.name);

  constructor(private readonly burnHistoryService: BurnHistoryService) {}

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60_000)
  @ApiOperation({
    summary: 'Get burn transaction history',
    description:
      'Returns paginated burn transaction history with support for filtering by token address, type, and date range, plus sorting options.',
  })
  @ApiQuery({ name: 'tokenAddress', required: false, description: 'Filter by token contract address' })
  @ApiQuery({ name: 'type', required: false, enum: BurnType, description: 'Filter by burn type' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date string for range start' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date string for range end' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Records per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'sortBy', required: false, enum: SortBy, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: SortOrder, description: 'Sort direction' })
  @ApiResponse({
    status: 200,
    description: 'Burn history retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'uuid',
            tokenAddress: '0xabc...',
            amount: '1000000000000000000',
            from: '0xdef...',
            type: 'self',
            transactionHash: '0x123...',
            blockNumber: '12345678',
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 10, total: 100, totalPages: 10 },
        filters: { tokenAddress: '0xabc...', sortBy: 'timestamp', sortOrder: 'desc' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getBurnHistory(
    @Query() query: BurnHistoryQueryDto,
  ): Promise<BurnHistoryResponse> {
    this.logger.log(`Fetching burn history with params: ${JSON.stringify(query)}`);
    return this.burnHistoryService.getHistory(query);
  }
}
