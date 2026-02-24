import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { StellarSignatureService } from "./stellar-signature.service";
import { NonceService } from "./nonce.service";
import { TokenService } from "./token.service";

import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { ApiKeyGuard } from "./guards/api-key.guard";

import { RateLimitMiddleware } from "./middleware/rate-limit.middleware";
import { RequestLoggingMiddleware } from "./middleware/request-logging.middleware";

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Default secret; individual sign/verify calls override this
        secret: config.get<string>(
          "JWT_ACCESS_SECRET",
          "fallback-secret-change-in-prod"
        ),
        signOptions: {
          issuer: config.get<string>("JWT_ISSUER", "cheese-platform"),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    StellarSignatureService,
    NonceService,
    TokenService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    ApiKeyGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
    ApiKeyGuard,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestLoggingMiddleware, RateLimitMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
