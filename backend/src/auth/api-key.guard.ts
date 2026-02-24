import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly validApiKeys: Set<string>;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>("API_KEYS", "");
    this.validApiKeys = new Set(
      raw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers["x-api-key"] || request.query["api_key"];

    if (!apiKey) {
      throw new UnauthorizedException("API key is required");
    }

    // Constant-time comparison to prevent timing attacks
    const isValid = [...this.validApiKeys].some((key) =>
      this.safeCompare(apiKey as string, key)
    );

    if (!isValid) {
      this.logger.warn(`Invalid API key attempt from ${request.ip}`);
      throw new UnauthorizedException("Invalid API key");
    }

    request.apiKey = apiKey;
    return true;
  }

  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
