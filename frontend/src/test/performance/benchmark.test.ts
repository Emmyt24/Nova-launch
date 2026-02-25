import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { performance } from 'perf_hooks';

/**
 * Performance Benchmark Tests
 * Tests component render times and ensures they meet performance budgets
 */

interface BenchmarkResult {
  name: string;
  duration: number;
  iterations: number;
  avgDuration: number;
}

/**
 * Benchmark a function execution
 */
function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 100
): BenchmarkResult {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  
  const end = performance.now();
  const duration = end - start;
  const avgDuration = duration / iterations;
  
  return {
    name,
    duration,
    iterations,
    avgDuration,
  };
}

/**
 * Benchmark async function execution
 */
async function benchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 50
): Promise<BenchmarkResult> {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  
  const end = performance.now();
  const duration = end - start;
  const avgDuration = duration / iterations;
  
  return {
    name,
    duration,
    iterations,
    avgDuration,
  };
}

describe('Performance Benchmarks', () => {
  describe('Component Render Performance', () => {
    it('should render simple components under 16ms (60fps)', async () => {
      // Import components dynamically to avoid affecting other tests
      const { default: App } = await import('../../App');
      
      const result = benchmark('App Component Render', () => {
        const { unmount } = render(<App />);
        unmount();
      }, 50);
      
      console.log(`📊 ${result.name}: ${result.avgDuration.toFixed(2)}ms avg`);
      expect(result.avgDuration).toBeLessThan(16);
    });

    it('should handle rapid re-renders efficiently', async () => {
      const { default: App } = await import('../../App');
      
      const result = benchmark('Rapid Re-renders', () => {
        const { rerender, unmount } = render(<App />);
        rerender(<App />);
        rerender(<App />);
        unmount();
      }, 30);
      
      console.log(`📊 ${result.name}: ${result.avgDuration.toFixed(2)}ms avg`);
      expect(result.avgDuration).toBeLessThan(50);
    });
  });

  describe('State Update Performance', () => {
    it('should update state quickly', () => {
      const state = { count: 0 };
      
      const result = benchmark('State Updates', () => {
        state.count++;
      }, 10000);
      
      console.log(`📊 ${result.name}: ${result.avgDuration.toFixed(4)}ms avg`);
      expect(result.avgDuration).toBeLessThan(0.01);
    });
  });

  describe('Data Processing Performance', () => {
    it('should process large arrays efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 100,
      }));
      
      const result = benchmark('Array Processing', () => {
        const filtered = largeArray.filter(item => item.value > 50);
        const mapped = filtered.map(item => ({ ...item, doubled: item.value * 2 }));
        const sorted = mapped.sort((a, b) => b.value - a.value);
        return sorted.slice(0, 10);
      }, 1000);
      
      console.log(`📊 ${result.name}: ${result.avgDuration.toFixed(4)}ms avg`);
      expect(result.avgDuration).toBeLessThan(1);
    });

    it('should handle JSON operations efficiently', () => {
      const data = {
        tokens: Array.from({ length: 100 }, (_, i) => ({
          id: `token-${i}`,
          name: `Token ${i}`,
          symbol: `TKN${i}`,
          supply: 1000000,
          metadata: { description: 'Test token', image: 'https://example.com/image.png' },
        })),
      };
      
      const result = benchmark('JSON Operations', () => {
        const json = JSON.stringify(data);
        const parsed = JSON.parse(json);
        return parsed;
      }, 1000);
      
      console.log(`📊 ${result.name}: ${result.avgDuration.toFixed(4)}ms avg`);
      expect(result.avgDuration).toBeLessThan(5);
    });
  });

  describe('Memory Performance', () => {
    it('should not leak memory during repeated operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform operations that could potentially leak
      for (let i = 0; i < 1000; i++) {
        const temp = Array.from({ length: 100 }, (_, j) => ({ id: j, value: Math.random() }));
        temp.filter(item => item.value > 0.5);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      console.log(`📊 Memory increase: ${memoryIncrease.toFixed(2)}MB`);
      expect(memoryIncrease).toBeLessThan(10); // Less than 10MB increase
    });
  });
});
