/**
 * Performance Monitoring Utilities
 * Real User Monitoring (RUM) for tracking actual user metrics
 */

export interface PerformanceMetrics {
  FCP?: number;
  LCP?: number;
  FID?: number;
  CLS?: number;
  TTFB?: number;
  TTI?: number;
  TBT?: number;
}

export interface PerformanceReport {
  metrics: PerformanceMetrics;
  timestamp: number;
  url: string;
  userAgent: string;
  connection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  };
}

/**
 * Initialize performance monitoring
 */
export function initPerformanceMonitoring(): void {
  if (typeof window === 'undefined') return;

  // Monitor First Contentful Paint (FCP)
  observeFCP();

  // Monitor Largest Contentful Paint (LCP)
  observeLCP();

  // Monitor First Input Delay (FID)
  observeFID();

  // Monitor Cumulative Layout Shift (CLS)
  observeCLS();

  // Monitor Time to First Byte (TTFB)
  observeTTFB();

  // Log navigation timing
  logNavigationTiming();
}

/**
 * Observe First Contentful Paint
 */
function observeFCP(): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          const fcp = entry.startTime;
          console.log(`📊 FCP: ${fcp.toFixed(2)}ms`);
          reportMetric('FCP', fcp);
        }
      }
    });

    observer.observe({ entryTypes: ['paint'] });
  } catch (error) {
    console.error('Error observing FCP:', error);
  }
}

/**
 * Observe Largest Contentful Paint
 */
function observeLCP(): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      const lcp = lastEntry.startTime;
      console.log(`📊 LCP: ${lcp.toFixed(2)}ms`);
      reportMetric('LCP', lcp);
    });

    observer.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch (error) {
    console.error('Error observing LCP:', error);
  }
}

/**
 * Observe First Input Delay
 */
function observeFID(): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const fid = (entry as any).processingStart - entry.startTime;
        console.log(`📊 FID: ${fid.toFixed(2)}ms`);
        reportMetric('FID', fid);
      }
    });

    observer.observe({ entryTypes: ['first-input'] });
  } catch (error) {
    console.error('Error observing FID:', error);
  }
}

/**
 * Observe Cumulative Layout Shift
 */
function observeCLS(): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    let clsValue = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      console.log(`📊 CLS: ${clsValue.toFixed(4)}`);
      reportMetric('CLS', clsValue);
    });

    observer.observe({ entryTypes: ['layout-shift'] });
  } catch (error) {
    console.error('Error observing CLS:', error);
  }
}

/**
 * Observe Time to First Byte
 */
function observeTTFB(): void {
  if (typeof window === 'undefined' || !window.performance) return;

  try {
    const navigationTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigationTiming) {
      const ttfb = navigationTiming.responseStart - navigationTiming.requestStart;
      console.log(`📊 TTFB: ${ttfb.toFixed(2)}ms`);
      reportMetric('TTFB', ttfb);
    }
  } catch (error) {
    console.error('Error observing TTFB:', error);
  }
}

/**
 * Log navigation timing information
 */
function logNavigationTiming(): void {
  if (typeof window === 'undefined' || !window.performance) return;

  window.addEventListener('load', () => {
    setTimeout(() => {
      const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (!timing) return;

      const metrics = {
        'DNS Lookup': timing.domainLookupEnd - timing.domainLookupStart,
        'TCP Connection': timing.connectEnd - timing.connectStart,
        'Request Time': timing.responseStart - timing.requestStart,
        'Response Time': timing.responseEnd - timing.responseStart,
        'DOM Processing': timing.domComplete - timing.domInteractive,
        'Load Complete': timing.loadEventEnd - timing.loadEventStart,
        'Total Time': timing.loadEventEnd - timing.fetchStart,
      };

      console.log('📊 Navigation Timing:');
      Object.entries(metrics).forEach(([key, value]) => {
        console.log(`  ${key}: ${value.toFixed(2)}ms`);
      });
    }, 0);
  });
}

/**
 * Report metric to analytics
 */
function reportMetric(name: string, value: number): void {
  // Send to analytics service (e.g., Google Analytics, Sentry)
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', name, {
      event_category: 'Web Vitals',
      value: Math.round(value),
      non_interaction: true,
    });
  }

  // Store in localStorage for debugging
  try {
    const metrics = JSON.parse(localStorage.getItem('performance_metrics') || '{}');
    metrics[name] = value;
    metrics.timestamp = Date.now();
    localStorage.setItem('performance_metrics', JSON.stringify(metrics));
  } catch (error) {
    // Ignore localStorage errors
  }
}

/**
 * Get current performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem('performance_metrics');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Generate performance report
 */
export function generatePerformanceReport(): PerformanceReport {
  const metrics = getPerformanceMetrics();
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  return {
    metrics,
    timestamp: Date.now(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    connection: connection ? {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
    } : undefined,
  };
}

/**
 * Mark custom performance timing
 */
export function markPerformance(name: string): void {
  if (typeof window !== 'undefined' && window.performance) {
    performance.mark(name);
  }
}

/**
 * Measure custom performance timing
 */
export function measurePerformance(name: string, startMark: string, endMark: string): number | null {
  if (typeof window === 'undefined' || !window.performance) return null;

  try {
    performance.measure(name, startMark, endMark);
    const measure = performance.getEntriesByName(name)[0];
    return measure ? measure.duration : null;
  } catch {
    return null;
  }
}
