import { useEffect, useState } from 'react';
import { getPerformanceMetrics, generatePerformanceReport, type PerformanceMetrics } from '../utils/performance';

/**
 * Performance Dashboard Component
 * Displays real-time performance metrics for debugging
 * Only shown in development mode
 */
export function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({});
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show in development
    if (import.meta.env.PROD) return;

    // Update metrics every 2 seconds
    const interval = setInterval(() => {
      setMetrics(getPerformanceMetrics());
    }, 2000);

    // Listen for keyboard shortcut (Ctrl+Shift+P)
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  if (!isVisible || import.meta.env.PROD) return null;

  const formatMetric = (value: number | undefined, unit: string = 'ms'): string => {
    if (value === undefined) return 'N/A';
    return unit === 'ms' ? `${value.toFixed(0)}${unit}` : value.toFixed(3);
  };

  const getMetricColor = (metric: string, value: number | undefined): string => {
    if (value === undefined) return 'text-gray-400';

    const thresholds: Record<string, { good: number; poor: number }> = {
      FCP: { good: 1500, poor: 2500 },
      LCP: { good: 2500, poor: 4000 },
      FID: { good: 100, poor: 300 },
      CLS: { good: 0.1, poor: 0.25 },
      TTFB: { good: 600, poor: 1500 },
    };

    const threshold = thresholds[metric];
    if (!threshold) return 'text-gray-300';

    if (value <= threshold.good) return 'text-green-400';
    if (value <= threshold.poor) return 'text-yellow-400';
    return 'text-red-400';
  };

  const downloadReport = () => {
    const report = generatePerformanceReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-2xl border border-gray-700 max-w-md z-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">⚡ Performance Metrics</h3>
        <div className="flex gap-2">
          <button
            onClick={downloadReport}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
            title="Download Report"
          >
            📥
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-400">FCP:</span>
            <span className={`ml-2 font-mono ${getMetricColor('FCP', metrics.FCP)}`}>
              {formatMetric(metrics.FCP)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">LCP:</span>
            <span className={`ml-2 font-mono ${getMetricColor('LCP', metrics.LCP)}`}>
              {formatMetric(metrics.LCP)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">FID:</span>
            <span className={`ml-2 font-mono ${getMetricColor('FID', metrics.FID)}`}>
              {formatMetric(metrics.FID)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">CLS:</span>
            <span className={`ml-2 font-mono ${getMetricColor('CLS', metrics.CLS)}`}>
              {formatMetric(metrics.CLS, '')}
            </span>
          </div>
          <div>
            <span className="text-gray-400">TTFB:</span>
            <span className={`ml-2 font-mono ${getMetricColor('TTFB', metrics.TTFB)}`}>
              {formatMetric(metrics.TTFB)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">TTI:</span>
            <span className={`ml-2 font-mono ${getMetricColor('TTI', metrics.TTI)}`}>
              {formatMetric(metrics.TTI)}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-700 text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-400 rounded-full"></span>
            <span>Good</span>
            <span className="w-3 h-3 bg-yellow-400 rounded-full ml-2"></span>
            <span>Needs Improvement</span>
            <span className="w-3 h-3 bg-red-400 rounded-full ml-2"></span>
            <span>Poor</span>
          </div>
        </div>

        <div className="pt-2 text-gray-500 text-[10px]">
          Press Ctrl+Shift+P to toggle
        </div>
      </div>
    </div>
  );
}
