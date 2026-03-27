/**
 * Performance monitoring utilities for token search
 */

export interface PerformanceMetrics {
  queryTime: number;
  cacheHit: boolean;
  resultCount: number;
  timestamp: Date;
}

const metrics: PerformanceMetrics[] = [];
const MAX_METRICS = 1000;

export function recordMetric(metric: PerformanceMetrics): void {
  metrics.push(metric);

  // Keep only the last MAX_METRICS entries
  if (metrics.length > MAX_METRICS) {
    metrics.shift();
  }
}

export function getAverageQueryTime(): number {
  if (metrics.length === 0) return 0;

  const total = metrics.reduce((sum, m) => sum + m.queryTime, 0);
  return total / metrics.length;
}

export function getCacheHitRate(): number {
  if (metrics.length === 0) return 0;

  const cacheHits = metrics.filter((m) => m.cacheHit).length;
  return (cacheHits / metrics.length) * 100;
}

export function getMetricsSummary() {
  return {
    totalQueries: metrics.length,
    averageQueryTime: getAverageQueryTime(),
    cacheHitRate: getCacheHitRate(),
    recentQueries: metrics.slice(-10),
  };
}

export function clearMetrics(): void {
  metrics.length = 0;
}

/**
 * Measure execution time of an async function
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  return { result, duration };
}
