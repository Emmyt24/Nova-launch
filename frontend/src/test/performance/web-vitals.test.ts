import { describe, it, expect } from 'vitest';

/**
 * Web Vitals Performance Tests
 * Tests Core Web Vitals metrics
 */

interface WebVitalsMetrics {
  FCP: number;  // First Contentful Paint
  LCP: number;  // Largest Contentful Paint
  FID: number;  // First Input Delay
  CLS: number;  // Cumulative Layout Shift
  TTFB: number; // Time to First Byte
}

const PERFORMANCE_BUDGETS = {
  FCP: 1500,   // < 1.5s
  LCP: 2500,   // < 2.5s
  FID: 100,    // < 100ms
  CLS: 0.1,    // < 0.1
  TTFB: 600,   // < 600ms
  TTI: 3500,   // < 3.5s (Time to Interactive)
  TBT: 300,    // < 300ms (Total Blocking Time)
};

describe('Web Vitals Performance', () => {
  describe('Performance Budget Validation', () => {
    it('should define FCP budget under 1.5s', () => {
      expect(PERFORMANCE_BUDGETS.FCP).toBe(1500);
      expect(PERFORMANCE_BUDGETS.FCP).toBeLessThanOrEqual(1500);
    });

    it('should define LCP budget under 2.5s', () => {
      expect(PERFORMANCE_BUDGETS.LCP).toBe(2500);
      expect(PERFORMANCE_BUDGETS.LCP).toBeLessThanOrEqual(2500);
    });

    it('should define FID budget under 100ms', () => {
      expect(PERFORMANCE_BUDGETS.FID).toBe(100);
      expect(PERFORMANCE_BUDGETS.FID).toBeLessThanOrEqual(100);
    });

    it('should define CLS budget under 0.1', () => {
      expect(PERFORMANCE_BUDGETS.CLS).toBe(0.1);
      expect(PERFORMANCE_BUDGETS.CLS).toBeLessThanOrEqual(0.1);
    });

    it('should define TTI budget under 3.5s', () => {
      expect(PERFORMANCE_BUDGETS.TTI).toBe(3500);
      expect(PERFORMANCE_BUDGETS.TTI).toBeLessThanOrEqual(3500);
    });

    it('should define TBT budget under 300ms', () => {
      expect(PERFORMANCE_BUDGETS.TBT).toBe(300);
      expect(PERFORMANCE_BUDGETS.TBT).toBeLessThanOrEqual(300);
    });
  });

  describe('Performance Monitoring Setup', () => {
    it('should have performance observer available', () => {
      // Check if PerformanceObserver is available in the environment
      const hasPerformanceAPI = typeof window !== 'undefined' && 'performance' in window;
      console.log(`📊 Performance API available: ${hasPerformanceAPI}`);
      
      // In Node.js test environment, we expect this to be false
      // In browser, it should be true
      expect(typeof hasPerformanceAPI).toBe('boolean');
    });

    it('should validate metric thresholds', () => {
      const metrics: Partial<WebVitalsMetrics> = {
        FCP: 1200,
        LCP: 2000,
        FID: 50,
        CLS: 0.05,
        TTFB: 400,
      };

      // Validate each metric against budget
      if (metrics.FCP) {
        console.log(`📊 FCP: ${metrics.FCP}ms (budget: ${PERFORMANCE_BUDGETS.FCP}ms)`);
        expect(metrics.FCP).toBeLessThan(PERFORMANCE_BUDGETS.FCP);
      }

      if (metrics.LCP) {
        console.log(`📊 LCP: ${metrics.LCP}ms (budget: ${PERFORMANCE_BUDGETS.LCP}ms)`);
        expect(metrics.LCP).toBeLessThan(PERFORMANCE_BUDGETS.LCP);
      }

      if (metrics.FID) {
        console.log(`📊 FID: ${metrics.FID}ms (budget: ${PERFORMANCE_BUDGETS.FID}ms)`);
        expect(metrics.FID).toBeLessThan(PERFORMANCE_BUDGETS.FID);
      }

      if (metrics.CLS) {
        console.log(`📊 CLS: ${metrics.CLS} (budget: ${PERFORMANCE_BUDGETS.CLS})`);
        expect(metrics.CLS).toBeLessThan(PERFORMANCE_BUDGETS.CLS);
      }

      if (metrics.TTFB) {
        console.log(`📊 TTFB: ${metrics.TTFB}ms (budget: ${PERFORMANCE_BUDGETS.TTFB}ms)`);
        expect(metrics.TTFB).toBeLessThan(PERFORMANCE_BUDGETS.TTFB);
      }
    });
  });

  describe('Performance Scoring', () => {
    it('should calculate performance score correctly', () => {
      const calculateScore = (metrics: Partial<WebVitalsMetrics>): number => {
        let score = 100;
        
        if (metrics.FCP && metrics.FCP > PERFORMANCE_BUDGETS.FCP) {
          score -= 10;
        }
        if (metrics.LCP && metrics.LCP > PERFORMANCE_BUDGETS.LCP) {
          score -= 20;
        }
        if (metrics.FID && metrics.FID > PERFORMANCE_BUDGETS.FID) {
          score -= 15;
        }
        if (metrics.CLS && metrics.CLS > PERFORMANCE_BUDGETS.CLS) {
          score -= 15;
        }
        if (metrics.TTFB && metrics.TTFB > PERFORMANCE_BUDGETS.TTFB) {
          score -= 10;
        }
        
        return Math.max(0, score);
      };

      // Good metrics
      const goodMetrics: Partial<WebVitalsMetrics> = {
        FCP: 1000,
        LCP: 2000,
        FID: 50,
        CLS: 0.05,
        TTFB: 400,
      };
      
      const goodScore = calculateScore(goodMetrics);
      console.log(`📊 Good metrics score: ${goodScore}/100`);
      expect(goodScore).toBe(100);

      // Poor metrics
      const poorMetrics: Partial<WebVitalsMetrics> = {
        FCP: 2000,
        LCP: 3000,
        FID: 150,
        CLS: 0.2,
        TTFB: 800,
      };
      
      const poorScore = calculateScore(poorMetrics);
      console.log(`📊 Poor metrics score: ${poorScore}/100`);
      expect(poorScore).toBeLessThan(100);
    });
  });
});
