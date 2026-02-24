/**
 * Health check types and interfaces
 */

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type ServiceStatus = "up" | "down" | "degraded";

export interface ServiceHealth {
  status: ServiceStatus;
  responseTime?: number;
  message?: string;
  error?: string;
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceHealth;
    stellarHorizon: ServiceHealth;
    stellarSoroban: ServiceHealth;
    ipfs: ServiceHealth;
    cache: ServiceHealth;
  };
}

export interface DetailedHealthCheckResult extends HealthCheckResult {
  metrics: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
    database: {
      poolSize?: number;
      activeConnections?: number;
      idleConnections?: number;
    };
    requests: {
      total: number;
      errorRate: number;
    };
  };
}

export interface HealthCheckOptions {
  timeout?: number;
  includeMetrics?: boolean;
}
