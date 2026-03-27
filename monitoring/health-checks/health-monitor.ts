/**
 * Health Check System for Nova Launch
 * Provides comprehensive health monitoring for all system components
 */

import { EventEmitter } from 'events';
import axios, { AxiosResponse } from 'axios';
import { structuredLogger } from '../logging/structured-logger';
import { MetricsCollector } from '../metrics/prometheus-config';

// Health check configuration
interface HealthCheckConfig {
  name: string;
  type: 'http' | 'database' | 'rpc' | 'custom';
  interval: number; // milliseconds
  timeout: number; // milliseconds
  retries: number;
  critical: boolean; // affects overall system health status
  url?: string;
  customCheck?: () => Promise<boolean>;
}

interface HealthCheckResult {
  name: string;
  healthy: boolean;
  responseTime: number;
  error?: string;
  timestamp: Date;
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
    };

    this.results.set(config.name, result);

    // Log the result
    structuredLogger.info(`Health check: ${config.name}`, {
      healthy,
      responseTime,
      error,
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
   * Get all health check results
   */
  getResults(): HealthCheckResult[] {
    return Array.from(this.results.values());
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