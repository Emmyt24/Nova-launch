import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { CacheModule } from "@nestjs/cache-manager";
import { ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TokensController } from "./tokens.controller";
import { TokensService } from "./tokens.service";
import { StellarService } from "./stellar.service";
import { IpfsService } from "./ipfs.service";
import { TokenCacheService } from "./token-cache.service";

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>("HTTP_TIMEOUT_MS") || 10000,
        maxRedirects: 3,
      }),
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ttl: configService.get<number>("CACHE_TTL_SECONDS") || 60,
        max: configService.get<number>("CACHE_MAX_ITEMS") || 500,
      }),
    }),
  ],
  controllers: [TokensController],
  providers: [TokensService, StellarService, IpfsService, TokenCacheService],
  exports: [TokensService],
})
export class TokensModule {}
