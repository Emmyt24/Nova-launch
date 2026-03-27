import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "@nestjs/cache-manager";
import { BurnHistoryController } from "./burn-history.controller";
import { BurnHistoryService } from "./burn-history.service";
import { BurnTransaction } from "./entities/burn-transaction.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([BurnTransaction]),
    CacheModule.register({
      ttl: 60_000, // 60 seconds default
      max: 500, // max cached items
    }),
  ],
  controllers: [BurnHistoryController],
  providers: [BurnHistoryService],
  exports: [BurnHistoryService],
})
export class BurnHistoryModule {}
