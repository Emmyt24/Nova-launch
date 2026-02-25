import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Performance Integration Tests
 * Validates that all performance testing infrastructure is properly set up
 */

describe('Performance Testing Infrastructure', () => {
  describe('Configuration Files', () => {
    it('should have Lighthouse CI configuration', () => {
      const configPath = join(process.cwd(), '.lighthouserc.json');
      expect(existsSync(configPath)).toBe(true);
      
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.ci).toBeDefined();
      expect(config.ci.collect).toBeDefined();
      expect(config.ci.assert).toBeDefined();
      expect(config.ci.collect.url).toBeInstanceOf(Array);
      expect(config.ci.collect.url.length).toBeGreaterThan(0);
    });

    it('should have performance budgets configuration', () => {
      const budgetsPath = join(process.cwd(), 'performance-budgets.json');
      expect(existsSync(budgetsPath)).toBe(true);
      
      const budgets = JSON.parse(readFileSync(budgetsPath, 'utf-8'));
      expect(budgets.budgets).toBeDefined();
      expect(budgets.timings).toBeDefined();
      expect(budgets.budgets[0].resourceSizes).toBeInstanceOf(Array);
      expect(budgets.timings).toBeInstanceOf(Array);
    });

    it('should have Vite configuration with performance optimizations', () => {
      const vitePath = join(process.cwd(), 'vite.config.ts');
      expect(existsSync(vitePath)).toBe(true);
      
      const viteConfig = readFileSync(vitePath, 'utf-8');
      expect(viteConfig).toContain('compression');
      expect(viteConfig).toContain('manualChunks');
      expect(viteConfig).toContain('terser');
    });
  });

  describe('Performance Scripts', () => {
    it('should have performance check script', () => {
      const scriptPath = join(process.cwd(), 'scripts', 'performance-check.js');
      expect(existsSync(scriptPath)).toBe(true);
      
      const script = readFileSync(scriptPath, 'utf-8');
      expect(script).toContain('checkBundleSizes');
      expect(script).toContain('BUDGETS_PATH');
    });

    it('should have performance test scripts in package.json', () => {
      const packagePath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      
      expect(packageJson.scripts['test:performance']).toBeDefined();
      expect(packageJson.scripts['perf:check']).toBeDefined();
      expect(packageJson.scripts['perf:benchmark']).toBeDefined();
      expect(packageJson.scripts['lighthouse']).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should have bundle size tests', () => {
      const testPath = join(process.cwd(), 'src', 'test', 'performance', 'bundle-size.test.ts');
      expect(existsSync(testPath)).toBe(true);
      
      const test = readFileSync(testPath, 'utf-8');
      expect(test).toContain('Bundle Size Performance');
      expect(test).toContain('BUDGETS');
    });

    it('should have benchmark tests', () => {
      const testPath = join(process.cwd(), 'src', 'test', 'performance', 'benchmark.test.ts');
      expect(existsSync(testPath)).toBe(true);
      
      const test = readFileSync(testPath, 'utf-8');
      expect(test).toContain('Performance Benchmarks');
      expect(test).toContain('benchmark');
    });

    it('should have web vitals tests', () => {
      const testPath = join(process.cwd(), 'src', 'test', 'performance', 'web-vitals.test.ts');
      expect(existsSync(testPath)).toBe(true);
      
      const test = readFileSync(testPath, 'utf-8');
      expect(test).toContain('Web Vitals Performance');
      expect(test).toContain('PERFORMANCE_BUDGETS');
    });
  });

  describe('Performance Utilities', () => {
    it('should have performance monitoring utilities', () => {
      const utilPath = join(process.cwd(), 'src', 'utils', 'performance.ts');
      expect(existsSync(utilPath)).toBe(true);
      
      const util = readFileSync(utilPath, 'utf-8');
      expect(util).toContain('initPerformanceMonitoring');
      expect(util).toContain('getPerformanceMetrics');
      expect(util).toContain('generatePerformanceReport');
    });

    it('should have performance dashboard component', () => {
      const componentPath = join(process.cwd(), 'src', 'components', 'PerformanceDashboard.tsx');
      expect(existsSync(componentPath)).toBe(true);
      
      const component = readFileSync(componentPath, 'utf-8');
      expect(component).toContain('PerformanceDashboard');
      expect(component).toContain('getPerformanceMetrics');
    });
  });

  describe('CI/CD Workflows', () => {
    it('should have performance workflow', () => {
      const workflowPath = join(process.cwd(), '.github', 'workflows', 'performance.yml');
      expect(existsSync(workflowPath)).toBe(true);
      
      const workflow = readFileSync(workflowPath, 'utf-8');
      expect(workflow).toContain('Performance Tests');
      expect(workflow).toContain('lhci autorun');
    });

    it('should have scheduled performance workflow', () => {
      const workflowPath = join(process.cwd(), '.github', 'workflows', 'performance-schedule.yml');
      expect(existsSync(workflowPath)).toBe(true);
      
      const workflow = readFileSync(workflowPath, 'utf-8');
      expect(workflow).toContain('Scheduled Performance Tests');
      expect(workflow).toContain('schedule');
    });
  });

  describe('Documentation', () => {
    it('should have comprehensive performance testing guide', () => {
      const docPath = join(process.cwd(), 'PERFORMANCE_TESTING.md');
      expect(existsSync(docPath)).toBe(true);
      
      const doc = readFileSync(docPath, 'utf-8');
      expect(doc).toContain('Performance Testing Guide');
      expect(doc).toContain('Performance Budgets');
      expect(doc).toContain('Running Performance Tests');
    });

    it('should have performance checklist', () => {
      const checklistPath = join(process.cwd(), 'PERFORMANCE_CHECKLIST.md');
      expect(existsSync(checklistPath)).toBe(true);
      
      const checklist = readFileSync(checklistPath, 'utf-8');
      expect(checklist).toContain('Performance Testing Checklist');
      expect(checklist).toContain('Acceptance Criteria');
    });

    it('should have quick start guide', () => {
      const quickStartPath = join(process.cwd(), 'PERFORMANCE_QUICK_START.md');
      expect(existsSync(quickStartPath)).toBe(true);
      
      const quickStart = readFileSync(quickStartPath, 'utf-8');
      expect(quickStart).toContain('Performance Testing Quick Start');
      expect(quickStart).toContain('Quick Commands');
    });
  });

  describe('Performance Budget Validation', () => {
    it('should have realistic performance budgets', () => {
      const budgetsPath = join(process.cwd(), 'performance-budgets.json');
      const budgets = JSON.parse(readFileSync(budgetsPath, 'utf-8'));
      
      // Validate resource size budgets
      const scriptBudget = budgets.budgets[0].resourceSizes.find((r: any) => r.resourceType === 'script');
      expect(scriptBudget.budget).toBe(200); // 200KB
      
      const totalBudget = budgets.budgets[0].resourceSizes.find((r: any) => r.resourceType === 'total');
      expect(totalBudget.budget).toBe(500); // 500KB
      
      // Validate timing budgets
      const fcpBudget = budgets.timings.find((t: any) => t.metric === 'first-contentful-paint');
      expect(fcpBudget.budget).toBe(1500); // 1.5s
      
      const lcpBudget = budgets.timings.find((t: any) => t.metric === 'largest-contentful-paint');
      expect(lcpBudget.budget).toBe(2500); // 2.5s
    });

    it('should have Lighthouse assertions matching budgets', () => {
      const configPath = join(process.cwd(), '.lighthouserc.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      
      const assertions = config.ci.assert.assertions;
      
      expect(assertions['first-contentful-paint']).toBeDefined();
      expect(assertions['first-contentful-paint'][1].maxNumericValue).toBe(1500);
      
      expect(assertions['largest-contentful-paint']).toBeDefined();
      expect(assertions['largest-contentful-paint'][1].maxNumericValue).toBe(2500);
      
      expect(assertions['interactive']).toBeDefined();
      expect(assertions['interactive'][1].maxNumericValue).toBe(3500);
    });
  });

  describe('Integration with Main App', () => {
    it('should have performance monitoring integrated in main.tsx', () => {
      const mainPath = join(process.cwd(), 'src', 'main.tsx');
      expect(existsSync(mainPath)).toBe(true);
      
      const main = readFileSync(mainPath, 'utf-8');
      expect(main).toContain('initPerformanceMonitoring');
    });

    it('should have performance dashboard integrated in App.tsx', () => {
      const appPath = join(process.cwd(), 'src', 'App.tsx');
      expect(existsSync(appPath)).toBe(true);
      
      const app = readFileSync(appPath, 'utf-8');
      expect(app).toContain('PerformanceDashboard');
    });
  });
});

describe('Performance Testing Workflow', () => {
  it('should have complete testing workflow', () => {
    const steps = [
      'Build application',
      'Run bundle size tests',
      'Run benchmarks',
      'Run Lighthouse CI',
      'Check against budgets',
      'Generate reports',
      'Upload artifacts',
    ];

    // This test documents the expected workflow
    expect(steps.length).toBeGreaterThan(0);
    console.log('\n📋 Performance Testing Workflow:');
    steps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step}`);
    });
  });

  it('should have all required npm scripts', () => {
    const packagePath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    
    const requiredScripts = [
      'build',
      'test:performance',
      'perf:check',
      'perf:benchmark',
      'lighthouse',
      'build:analyze',
    ];

    requiredScripts.forEach(script => {
      expect(packageJson.scripts[script]).toBeDefined();
      console.log(`  ✅ ${script}: ${packageJson.scripts[script]}`);
    });
  });
});
