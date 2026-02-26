# Performance Testing Guide

This guide covers the comprehensive performance testing setup for the Nova Launch application.

## Overview

Our performance testing strategy includes:

- **Lighthouse CI**: Automated Core Web Vitals monitoring
- **Bundle Analysis**: Track and enforce bundle size budgets
- **Custom Benchmarks**: Component render and interaction performance
- **Performance Monitoring**: Historical tracking and regression detection

## Performance Budgets

### Load Performance Targets

| Metric | Target | Budget |
|--------|--------|--------|
| First Contentful Paint (FCP) | < 1.5s | Critical |
| Largest Contentful Paint (LCP) | < 2.5s | Critical |
| Time to Interactive (TTI) | < 3.5s | Critical |
| Total Blocking Time (TBT) | < 300ms | Critical |
| Cumulative Layout Shift (CLS) | < 0.1 | Critical |
| Speed Index | < 3.0s | Important |

### Runtime Performance Targets

| Metric | Target | Budget |
|--------|--------|--------|
| Component Render Time | < 16ms | 60fps |
| Interaction Response | < 100ms | Perceived instant |
| Animation Frame Rate | 60fps | Smooth |
| Memory Usage | Stable | No leaks |

### Bundle Size Budgets

| Resource Type | Budget | Status |
|---------------|--------|--------|
| Initial Bundle | 200 KB | Enforced |
| Total Bundle | 500 KB | Enforced |
| JavaScript | 200 KB | Monitored |
| CSS | 50 KB | Monitored |
| Images | 200 KB | Monitored |
| Fonts | 100 KB | Monitored |

## Running Performance Tests

### Local Testing

```bash
# Run all performance tests
npm run test:performance

# Run in watch mode
npm run test:performance:watch

# Analyze bundle size
npm run analyze

# Run Lighthouse locally
npm run build
npm run preview
npm run lighthouse

# Monitor performance trends
npm run perf:monitor
```

### CI/CD Integration

Performance tests run automatically on:
- Every push to `main` or `develop`
- Every pull request
- Manual workflow dispatch

The CI pipeline includes:
1. Lighthouse CI for Core Web Vitals
2. Bundle size analysis with budget enforcement
3. Custom performance benchmarks
4. Performance monitoring and trend analysis

## Test Structure

### 1. Benchmark Tests (`src/test/performance/benchmark.test.ts`)

Measures component render times and memory usage:

```typescript
// Example: Component render benchmark
const stats = measureAverageRenderTime(<Button>Click</Button>);
expect(stats.avg).toBeLessThan(16); // 60fps budget
```

Tests include:
- Simple component render times
- List rendering with 100+ items
- Stateful component updates
- Memory leak detection

### 2. Interaction Tests (`src/test/performance/interaction.test.ts`)

Measures user interaction response times:

```typescript
// Example: Click response time
const start = performance.now();
fireEvent.click(button);
const duration = performance.now() - start;
expect(duration).toBeLessThan(100); // 100ms budget
```

Tests include:
- Button click responses
- Form input changes
- Rapid state updates
- Scroll event handling
- Animation frame rates

### 3. Bundle Analysis Tests (`src/test/performance/bundle-analysis.test.ts`)

Verifies build optimization:

- Code splitting configuration
- Compression enabled
- Tree shaking active
- Lazy loading patterns
- Asset optimization

## Scripts

### `analyze-bundle.js`

Analyzes the production build and generates a detailed report:

```bash
npm run build
node scripts/analyze-bundle.js
```

Output:
- Total bundle size vs budget
- Breakdown by resource type
- Largest files identified
- Optimization opportunities
- Exits with error if budget exceeded

### `performance-monitor.js`

Tracks performance metrics over time:

```bash
node scripts/performance-monitor.js
```

Features:
- Stores historical data in `performance-history.json`
- Detects regressions (>10% increase)
- Shows trends over last 5 builds
- Integrates with Lighthouse and bundle analysis
- Exits with error if regressions detected

## Lighthouse CI Configuration

Configuration in `.lighthouserc.js`:

```javascript
{
  ci: {
    collect: {
      url: ['http://localhost:4173'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'first-contentful-paint': ['error', { maxNumericValue: 1500 }],
        // ... more assertions
      },
    },
  },
}
```

## Performance Optimization Strategies

### Code Splitting

Configured in `vite.config.ts`:

```typescript
manualChunks(id) {
  if (id.includes('react')) return 'react-vendor';
  if (id.includes('@stellar')) return 'stellar-sdk';
  if (id.includes('i18next')) return 'i18n';
  // ... more chunks
}
```

### Lazy Loading

Use React.lazy for route-based code splitting:

```typescript
const Dashboard = lazy(() => import('./pages/Dashboard'));
```

### Asset Optimization

- Images: WebP format with fallbacks
- Fonts: Subset and preload critical fonts
- Icons: SVG sprites
- Inline limit: 4KB for small assets

### Compression

Both Gzip and Brotli compression enabled:

```typescript
plugins: [
  compression({ algorithm: 'gzip' }),
  compression({ algorithm: 'brotliCompress' }),
]
```

## Monitoring and Alerts

### CI/CD Alerts

The pipeline will fail if:
- Performance score < 90
- Any Core Web Vital exceeds budget
- Bundle size exceeds 500KB
- Performance regression > 10%

### PR Comments

Bundle analysis is automatically commented on PRs:
- Total size vs budget
- Breakdown by resource type
- Optimization opportunities

### Historical Tracking

Performance history is stored in `performance-history.json`:
- Last 100 builds tracked
- Includes commit SHA and branch
- Used for trend analysis

## Troubleshooting

### Slow Component Renders

1. Check benchmark test results
2. Use React DevTools Profiler
3. Look for unnecessary re-renders
4. Consider memoization (React.memo, useMemo)

### Large Bundle Size

1. Run `npm run analyze` to see breakdown
2. Check for duplicate dependencies
3. Verify tree shaking is working
4. Add more code splitting
5. Review lazy loading opportunities

### Poor Lighthouse Scores

1. Check specific failing audits
2. Review network waterfall
3. Optimize critical rendering path
4. Reduce JavaScript execution time
5. Minimize main thread work

### Memory Leaks

1. Run memory benchmark tests
2. Use Chrome DevTools Memory Profiler
3. Check for event listener cleanup
4. Verify useEffect cleanup functions
5. Look for circular references

## Best Practices

1. **Run tests locally** before pushing
2. **Monitor trends** not just absolute values
3. **Set realistic budgets** based on user needs
4. **Optimize incrementally** don't over-optimize
5. **Test on real devices** not just desktop
6. **Consider network conditions** test on 3G/4G
7. **Profile in production mode** dev mode is slower
8. **Use performance budgets** as guardrails
9. **Document optimizations** for team knowledge
10. **Celebrate wins** when metrics improve

## Resources

- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
- [Vite Performance](https://vitejs.dev/guide/performance.html)
- [React Performance](https://react.dev/learn/render-and-commit)
- [Bundle Analysis](https://github.com/btd/rollup-plugin-visualizer)

## Next Steps

1. ✅ Set up performance testing tools
2. ✅ Configure performance budgets
3. ✅ Write custom benchmarks
4. ✅ Add bundle size tracking
5. ✅ Create performance monitoring
6. ✅ Set up CI/CD integration
7. ⏳ Create performance dashboard (optional)
8. ⏳ Set up real user monitoring (optional)
9. ⏳ Add performance alerts (optional)

## Support

For questions or issues with performance testing:
1. Check this documentation
2. Review test output and logs
3. Consult the team
4. File an issue with performance data
