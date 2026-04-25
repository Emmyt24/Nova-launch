/**
 * Health Check System for Nova Launch
 * Provides comprehensive health monitoring for all system components
 * Including projection lag threshold monitoring for backend indexing
 */

import { EventEmitter } from 'events';
import axios, { AxiosResponse } from 'axios';
import { structuredLogger } from '../logging/structured-logger';
import { MetricsCollector } from '../metrics/prometheus-config';

// Health check configuration
interface HealthCheckConfig {
  name: string;
  type: 'http' | 'database' | 'rpc' | 'custom' | 'projection-lag';
  interval: number; // milliseconds
  timeout: number; // milliseconds
  retries: number;
  critical: boolean; // affects overall system health status
  url?: string;
  customCheck?: () => Promise<boolean>;
  lagThresholdConfig?: {
    warningThresholdMs?: number;
    criticalThresholdMs?: number;
    queryFn?: () => Promise<{ average: number; max: number; count: number }>;
  };
}

interface HealthCheckResult {
  name: string;
  healthy: boolean;
  responseTime: number;
  error?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>; // For projection lag metrics
}

interface ProjectionLagHealthDetail {
  averageLag: number;
  maxLag: number;
  measurementCount: number;
  status: 'healthy' | 'warning' | 'critical';
}

/**
 * Health Monitor Class
 */
export class HealthMonitor extends EventEmitter {
  private checks: Map<string, HealthCheckConfig> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private results: Map<string, HealthCheckResult> = new Map();

  /**
   * Register a health check
   */
  registerCheck(config: HealthCheckConfig): void {
    this.checks.set(config.name, config);
    this.startCheck(config);
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
    this.checks.delete(name);
    this.results.delete(name);
  }

  /**
   * Start a health check
   */
  private startCheck(config: HealthCheckConfig): void {
    const interval = setInterval(async () => {
      await this.performCheck(config);
    }, config.interval);

    this.intervals.set(config.name, interval);
  }

  /**
   * Perform a health check
   */
  private async performCheck(config: HealthCheckConfig): Promise<void> {
    const startTime = Date.now();
    let healthy = false;
    let error: string | undefined;
    let metadata: Record<string, unknown> | undefined;

    try {
      switch (config.type) {
        case 'http':
          if (config.url) {
            const response = await axios.get(config.url, {
              timeout: config.timeout,
            });
            healthy = response.status >= 200 && response.status < 300;
          }
          break;

        case 'projection-lag':
          // Projection lag health check
          if (config.lagThresholdConfig?.queryFn) {
            const result = await this.checkProjectionLag(config);
            healthy = result.healthy;
            metadata = result.metadata;
            error = result.error;
          }
          break;

        case 'custom':
          if (config.customCheck) {
            healthy = await config.customCheck();
          }
          break;

        default:
          healthy = true;
      }
    } catch (err) {
      healthy = false;
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    const responseTime = Date.now() - startTime;

    const result: HealthCheckResult = {
      name: config.name,
      healthy,
      responseTime,
      error,
      timestamp: new Date(),
      metadata,
    };

    this.results.set(config.name, result);

    // Log the result
    structuredLogger.info(`Health check: ${config.name}`, {
      healthy,
      responseTime,
      error,
      metadata,
    });

    // Record metrics
    MetricsCollector.recordHealthCheck({
      service: 'nova-launch',
      check: config.name,
      healthy,
      duration: responseTime,
    });

    // Emit event
    this.emit('check-complete', result);

    if (!healthy && config.critical) {
      this.emit('critical-failure', result);
    }
  }

  /**
   * Check projection lag against configured thresholds
   */
  private async checkProjectionLag(config: HealthCheckConfig): Promise<{
    healthy: boolean;
    error?: string;
    metadata?: Record<string, unknown>;
  }> {
    try {
      if (!config.lagThresholdConfig?.queryFn) {
        return {
          healthy: false,
          error: 'Projection lag query function not configured',
        };
      }

      const lagMetrics = await config.lagThresholdConfig.queryFn();
      const warningThreshold = config.lagThresholdConfig.warningThresholdMs ?? 30000;
      const criticalThreshold = config.lagThresholdConfig.criticalThresholdMs ?? 60000;

      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (lagMetrics.average >= criticalThreshold) {
        status = 'critical';
      } else if (lagMetrics.average >= warningThreshold) {
        status = 'warning';
      }

      const healthy = status === 'healthy';

      if (!healthy) {
        structuredLogger.warn('Projection lag threshold exceeded', {
          status,
          averageLag: lagMetrics.average,
          maxLag: lagMetrics.max,
          threshold: status === 'critical' ? criticalThreshold : warningThreshold,
        });
      }

      return {
        healthy,
        metadata: {
          averageLag: lagMetrics.average,
          maxLag: lagMetrics.max,
          measurementCount: lagMetrics.count,
          status,
          warningThreshold,
          criticalThreshold,
        },
      };
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : 'Unknown error checking projection lag',
      };
    }
  }

  /**
   * Get all health check results
   */
  getResults(): HealthCheckResult[] {
    return Array.from(this.results.values());
  }

  /**
   * Get projection lag health details if available
   */
  getProjectionLagHealth(): ProjectionLagHealthDetail | null {
    const result = this.results.get('projection-lag');
    if (!result?.metadata) {
      return null;
    }

    return {
      averageLag: (result.metadata.averageLag as number) ?? 0,
      maxLag: (result.metadata.maxLag as number) ?? 0,
      measurementCount: (result.metadata.measurementCount as number) ?? 0,
      status: (result.metadata.status as 'healthy' | 'warning' | 'critical') ?? 'healthy',
    };
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): { healthy: boolean; checks: HealthCheckResult[] } {
    const results = this.getResults();
    const healthy = results.every((r) => r.healthy);

    return { healthy, checks: results };
  }

  /**
   * Fetch and log expanded dependency health from the backend /health/ready endpoint.
   * Returns null if the endpoint is unreachable.
   */
  async fetchBackendHealth(backendUrl: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await axios.get(`${backendUrl}/health/ready`, { timeout: 5000 });
      const data = response.data?.data ?? response.data;
      structuredLogger.info('Backend dependency health', {
        status: data?.status,
        services: data?.services,
      });
      return data as Record<string, unknown>;
    } catch (err) {
      structuredLogger.warn('Failed to fetch backend health', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Stop all health checks
   */
  stopAll(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

// Export singleton instance
export const healthMonitor = new HealthMonitor();