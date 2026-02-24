import { prisma } from "../prisma";
import NodeCache from "node-cache";
import {
  HealthStatus,
  ServiceStatus,
  ServiceHealth,
  HealthCheckResult,
  DetailedHealthCheckResult,
  HealthCheckOptions,
} from "./health.types";

/**
 * Health check service for monitoring application and dependency status
 */
export class HealthService {
  private static instance: HealthService;
  private readonly startTime: number;
  private readonly cache: NodeCache;
  private readonly version: string;
  private requestCount = 0;
  private errorCount = 0;

  private constructor() {
    this.startTime = Date.now();
    this.cache = new NodeCache({ stdTTL: 30, checkperiod: 10 });
    this.version = process.env.npm_package_version || "0.1.0";
  }

  static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
    }
    return HealthService.instance;
  }

  /**
   * Increment request counter
   */
  incrementRequestCount(): void {
    this.requestCount++;
  }

  /**
   * Increment error counter
   */
  incrementErrorCount(): void {
    this.errorCount++;
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get application version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Perform basic health check
   */
  async checkHealth(
    options: HealthCheckOptions = {}
  ): Promise<HealthCheckResult> {
    const cacheKey = "health-check-basic";
    const cached = this.cache.get<HealthCheckResult>(cacheKey);

    if (cached) {
      return cached;
    }

    const timeout = options.timeout || 5000;
    const services = await this.checkAllServices(timeout);
    const overallStatus = this.determineOverallStatus(services);

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      version: this.getVersion(),
      services,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Perform detailed health check with metrics
   */
  async checkDetailedHealth(
    options: HealthCheckOptions = {}
  ): Promise<DetailedHealthCheckResult> {
    const cacheKey = "health-check-detailed";
    const cached = this.cache.get<DetailedHealthCheckResult>(cacheKey);

    if (cached) {
      return cached;
    }

    const basicHealth = await this.checkHealth(options);
    const metrics = await this.collectMetrics();

    const result: DetailedHealthCheckResult = {
      ...basicHealth,
      metrics,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Check all service dependencies
   */
  private async checkAllServices(
    timeout: number
  ): Promise<HealthCheckResult["services"]> {
    const [database, stellarHorizon, stellarSoroban, ipfs, cache] =
      await Promise.all([
        this.checkDatabase(timeout),
        this.checkStellarHorizon(timeout),
        this.checkStellarSoroban(timeout),
        this.checkIpfs(timeout),
        this.checkCache(timeout),
      ]);

    return {
      database,
      stellarHorizon,
      stellarSoroban,
      ipfs,
      cache,
    };
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(timeout: number): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        this.timeoutPromise(timeout, "Database check timeout"),
      ]);

      return {
        status: "up",
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "down",
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check Stellar Horizon API
   */
  private async checkStellarHorizon(timeout: number): Promise<ServiceHealth> {
    const start = Date.now();
    const horizonUrl =
      process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";

    try {
      const response = await Promise.race([
        fetch(`${horizonUrl}/`),
        this.timeoutPromise(timeout, "Horizon check timeout"),
      ]);

      if (response.ok) {
        return {
          status: "up",
          responseTime: Date.now() - start,
        };
      }

      return {
        status: "degraded",
        responseTime: Date.now() - start,
        message: `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        status: "down",
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check Stellar Soroban RPC
   */
  private async checkStellarSoroban(timeout: number): Promise<ServiceHealth> {
    const start = Date.now();
    const sorobanUrl =
      process.env.STELLAR_SOROBAN_RPC_URL ||
      "https://soroban-testnet.stellar.org";

    try {
      const response = await Promise.race([
        fetch(sorobanUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getHealth",
            params: [],
          }),
        }),
        this.timeoutPromise(timeout, "Soroban check timeout"),
      ]);

      if (response.ok) {
        return {
          status: "up",
          responseTime: Date.now() - start,
        };
      }

      return {
        status: "degraded",
        responseTime: Date.now() - start,
        message: `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        status: "down",
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check IPFS gateway availability
   */
  private async checkIpfs(timeout: number): Promise<ServiceHealth> {
    const start = Date.now();
    const ipfsGateway = process.env.IPFS_GATEWAY_URL || "https://ipfs.io";

    try {
      const response = await Promise.race([
        fetch(ipfsGateway),
        this.timeoutPromise(timeout, "IPFS check timeout"),
      ]);

      if (response.ok || response.status === 404) {
        // 404 is acceptable for gateway root
        return {
          status: "up",
          responseTime: Date.now() - start,
        };
      }

      return {
        status: "degraded",
        responseTime: Date.now() - start,
        message: `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        status: "down",
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check cache functionality
   */
  private async checkCache(timeout: number): Promise<ServiceHealth> {
    const start = Date.now();
    const testKey = "__health_check__";
    const testValue = Date.now().toString();

    try {
      await Promise.race([
        (async () => {
          this.cache.set(testKey, testValue, 1);
          const retrieved = this.cache.get(testKey);
          if (retrieved !== testValue) {
            throw new Error("Cache value mismatch");
          }
          this.cache.del(testKey);
        })(),
        this.timeoutPromise(timeout, "Cache check timeout"),
      ]);

      return {
        status: "up",
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "down",
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Collect system and application metrics
   */
  private async collectMetrics(): Promise<
    DetailedHealthCheckResult["metrics"]
  > {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;

    // Get database pool stats if available
    let dbPoolStats = {};
    try {
      // Prisma doesn't expose pool stats directly, but we can check connection
      const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'
      `;
      dbPoolStats = {
        poolSize: 1,
        activeConnections: result ? 1 : 0,
        idleConnections: 0,
      };
    } catch {
      // Silently fail if we can't get pool stats
    }

    return {
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: Math.round((usedMemory / totalMemory) * 100),
      },
      cpu: {
        usage: this.getCpuUsage(),
      },
      database: dbPoolStats,
      requests: {
        total: this.requestCount,
        errorRate:
          this.requestCount > 0
            ? Math.round((this.errorCount / this.requestCount) * 100)
            : 0,
      },
    };
  }

  /**
   * Get CPU usage percentage
   */
  private getCpuUsage(): number {
    const cpuUsage = process.cpuUsage();
    const totalUsage = cpuUsage.user + cpuUsage.system;
    const uptime = this.getUptime() * 1000000; // Convert to microseconds

    if (uptime === 0) return 0;

    return Math.round((totalUsage / uptime) * 100);
  }

  /**
   * Determine overall health status based on service statuses
   */
  private determineOverallStatus(
    services: HealthCheckResult["services"]
  ): HealthStatus {
    const statuses = Object.values(services).map((s) => s.status);

    // If any critical service is down, overall is unhealthy
    if (services.database.status === "down") {
      return "unhealthy";
    }

    // If any service is down, overall is unhealthy
    if (statuses.includes("down")) {
      return "unhealthy";
    }

    // If any service is degraded, overall is degraded
    if (statuses.includes("degraded")) {
      return "degraded";
    }

    return "healthy";
  }

  /**
   * Create a timeout promise
   */
  private timeoutPromise(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}

export const healthService = HealthService.getInstance();
