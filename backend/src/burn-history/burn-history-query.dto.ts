import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum BurnType {
  ALL = 'all',
  SELF = 'self',
  ADMIN = 'admin',
}

export enum SortBy {
  TIMESTAMP = 'timestamp',
  AMOUNT = 'amount',
  FROM = 'from',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class BurnHistoryQueryDto {
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  @IsOptional()
  @IsEnum(BurnType)
  type?: BurnType = BurnType.ALL;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.TIMESTAMP;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}
