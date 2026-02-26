import { useEffect, useRef } from 'react';

/**
 * Performance Monitoring Hook
 * 
 * Monitors component render performance and logs warnings
 * when renders exceed the 16ms budget (60fps).
 */

interface PerformanceMonitorOptions {
  componentName: string;
  warnThreshold?: number; // ms
  enabled?: boolean;
}

export function usePerformanceMonitor({
  componentName,
  warnThreshold = 16,
  enabled = import.meta.env.DEV,
}: PerformanceMonitorOptions) {
  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);
  const lastRenderTime = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;

      renderCount.current += 1;
      renderTimes.current.push(renderTime);

      // Keep only last 10 render times
      if (renderTimes.current.length > 10) {
        renderTimes.current.shift();
      }

      // Warn if render time exceeds threshold
      if (renderTime > warnThreshold) {
        console.warn(
          `[Performance] ${componentName} render took ${renderTime.toFixed(2)}ms (threshold: ${warnThreshold}ms)`
        );
      }

      // Log stats every 10 renders
      if (renderCount.current % 10 === 0) {
        const avgRenderTime =
          renderTimes.current.reduce((sum, time) => sum + time, 0) /
          renderTimes.current.length;

        console.log(
          `[Performance] ${componentName} stats:`,
          {
            renders: renderCount.current,
            avgRenderTime: avgRenderTime.toFixed(2) + 'ms',
            lastRenderTime: renderTime.toFixed(2) + 'ms',
          }
        );
      }

      lastRenderTime.current = renderTime;
    };
  });

  return {
    renderCount: renderCount.current,
    lastRenderTime: lastRenderTime.current,
    avgRenderTime:
      renderTimes.current.length > 0
        ? renderTimes.current.reduce((sum, time) => sum + time, 0) /
          renderTimes.current.length
        : 0,
  };
}

/**
 * Measure function execution time
 */
export function measurePerformance<T>(
  fn: () => T,
  label: string
): T {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  
  console.log(`[Performance] ${label}: ${(end - start).toFixed(2)}ms`);
  
  return result;
}

/**
 * Measure async function execution time
 */
export async function measurePerformanceAsync<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  
  console.log(`[Performance] ${label}: ${(end - start).toFixed(2)}ms`);
  
  return result;
}
