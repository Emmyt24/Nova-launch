import { Injectable, Logger } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject } from "@nestjs/common";
import { Cache } from "cache-manager";
import { Token } from "./interfaces/token.interface";

export const TOKEN_CACHE_TTL = 60; // seconds
export const TOKEN_CACHE_PREFIX = "token:";

@Injectable()
export class TokenCacheService {
  private readonly logger = new Logger(TokenCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  buildKey(address: string, include: string[]): string {
    const includeStr = [...include].sort().join(",");
    return `${TOKEN_CACHE_PREFIX}${address}:${includeStr}`;
  }

  async get(key: string): Promise<Token | null> {
    try {
      const cached = await this.cacheManager.get<Token>(key);
      return cached ?? null;
    } catch (error) {
      this.logger.warn(`Cache get failed for key ${key}`, error?.message);
      return null;
    }
  }

  async set(key: string, value: Token, ttl = TOKEN_CACHE_TTL): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl * 1000);
    } catch (error) {
      this.logger.warn(`Cache set failed for key ${key}`, error?.message);
    }
  }

  async invalidate(address: string): Promise<void> {
    try {
      // Best-effort cache invalidation
      const keysToDelete = [
        this.buildKey(address, []),
        this.buildKey(address, ["metadata"]),
        this.buildKey(address, ["burns"]),
        this.buildKey(address, ["analytics"]),
        this.buildKey(address, ["metadata", "burns", "analytics"]),
      ];
      await Promise.allSettled(
        keysToDelete.map((k) => this.cacheManager.del(k))
      );
    } catch (error) {
      this.logger.warn(
        `Cache invalidation failed for ${address}`,
        error?.message
      );
    }
  }
}
