import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { BurnEvent } from './entities/burn-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BurnEvent]),
    CacheModule.register({
      ttl: 300, // 5 minutes default
      max: 100,
    }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
