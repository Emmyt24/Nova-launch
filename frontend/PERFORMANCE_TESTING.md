# Performance Testing Guide

This guide covers the comprehensive performance testing setup for the Nova Launch application.

## Overview

Performance testing ensures the application loads quickly and responds smoothly. We test:

- **Load Performance**: Page load times and Core Web Vitals
- **Runtime Performance**: Component render times and interactions
- **Bundle Performance**: Bundle sizes and code splitting
- **Real User Monitoring**: Actual user metrics

## Performance Budgets

### Load Performance
- **First Contentful Paint (FCP)**: < 1.5s
- **Largest Contentful Paint (LCP)**: < 2.5s
- **Time to Interactive (TTI)**: < 3.5s
- **Total Blocking Time (TBT)**: < 300ms
- **Cumulative Layout Shift (CLS)**: < 0.1

### Runtime Performance
- **Component render time**: < 16ms (60fps)
- **Interaction response**: < 100ms
- **Animation frame rate**: 60fps
- **Memory usage**: Stable, no leaks

### Bundle Performance
- **Initial bundle**: < 200KB
- **Total bundle**: < 500KB
- **CSS bundle**: < 50KB
- **Code splitting**: Effective
- **Lazy loading**: Working
- **Tree shaking**: Effective

## Running Performance Tests

### 1. Bundle Size Tests

```bash
# Build the application first
npm run build

# Run bundle size tests
npm run test:performance

# Check bundle sizes against budgets
node scripts/performance-check.js
```

### 2. Component Benchmarks

```bash
# Run performance benchmarks
npm run test -- src/test/performance/benchmark.test.ts

# Run with detailed output
npm run test -- src/test/performance/benchmark.test.ts --reporter=verbose
```

### 3. Lighthouse CI

```bash
# Install Lighthouse CI globally
npm install -g @lhci/cli

# Build and preview the app
npm run build
npm run preview

# In another terminal, run Lighthouse
lhci autorun
```

### 4. Real User Monitoring

The application automatically tracks performance metrics in production:

```typescript
import { initPerformanceMonitoring, getPerformanceMetrics } from './utils/performance';

// Initialize monitoring on app start
initPerformanceMonitoring();

// Get current metrics
const metrics = getPerformanceMetrics();
console.log(metrics);
```

## Performance Testing Tools

### 1. Vitest Performance Tests

Located in `src/test/performance/`:

- **bundle-size.test.ts**: Tests bundle sizes against budgets
- **benchmark.test.ts**: Benchmarks component render times
- **web-vitals.test.ts**: Validates Web Vitals budgets

### 2. Lighthouse CI

Configuration in `.lighthouserc.json`:

- Runs on multiple pages
- Tests desktop performance
- Enforces performance budgets
- Generates detailed reports

### 3. Bundle Analyzer

```bash
# Analyze bundle composition
npm run build:analyze

# Opens interactive bundle visualization
```

### 4. Performance Check Script

```bash
# Quick performance check
node scripts/performance-check.js
```

## CI/CD Integration

Performance tests run automatically on:

- Every push to main/develop
- Every pull request
- Scheduled nightly builds

### GitHub Actions Workflow

Located in `.github/workflows/performance.yml`:

1. Builds the application
2. Runs bundle size tests
3. Checks against budgets
4. Runs Lighthouse CI
5. Comments results on PRs
6. Uploads artifacts

## Performance Monitoring

### Real User Monitoring (RUM)

The app tracks actual user metrics:

```typescript
// Automatically tracked:
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- First Input Delay (FID)
- Cumulative Layout Shift (CLS)
- Time to First Byte (TTFB)
- Navigation timing
- Network conditions
```

### Custom Performance Marks

```typescript
import { markPerformance, measurePerformance } from './utils/performance';

// Mark start of operation
markPerformance('operation-start');

// ... perform operation ...

// Mark end and measure
markPerformance('operation-end');
const duration = measurePerformance('operation', 'operation-start', 'operation-end');
console.log(`Operation took ${duration}ms`);
```

## Performance Dashboard

### Viewing Metrics

1. **Browser DevTools**:
   - Open DevTools → Performance tab
   - Record and analyze performance
   - View Core Web Vitals

2. **Lighthouse**:
   - Open DevTools → Lighthouse tab
   - Run audit
   - View detailed report

3. **Bundle Analyzer**:
   - Run `npm run build:analyze`
   - Interactive visualization opens
   - Identify large dependencies

### Stored Metrics

Performance metrics are stored in localStorage:

```javascript
// View stored metrics
const metrics = JSON.parse(localStorage.getItem('performance_metrics'));
console.log(metrics);
```

## Optimization Strategies

### Bundle Size Optimization

1. **Code Splitting**:
   ```typescript
   // Lazy load components
   const Dashboard = lazy(() => import('./pages/Dashboard'));
   ```

2. **Tree Shaking**:
   - Import only what you need
   - Use ES modules
   - Avoid default exports for utilities

3. **Compression**:
   - Gzip/Brotli enabled
   - Minification in production
   - Asset optimization

### Runtime Optimization

1. **Component Optimization**:
   ```typescript
   // Memoize expensive components
   const MemoizedComponent = memo(Component);
   
   // Memoize expensive calculations
   const value = useMemo(() => expensiveCalc(), [deps]);
   
   // Memoize callbacks
   const callback = useCallback(() => {}, [deps]);
   ```

2. **Virtual Scrolling**:
   - For long lists
   - Render only visible items
   - Improves scroll performance

3. **Debouncing/Throttling**:
   ```typescript
   // Debounce search input
   const debouncedSearch = debounce(search, 300);
   
   // Throttle scroll handler
   const throttledScroll = throttle(handleScroll, 100);
   ```

### Load Performance Optimization

1. **Critical CSS**:
   - Inline critical CSS
   - Defer non-critical CSS
   - Remove unused CSS

2. **Image Optimization**:
   - Use WebP format
   - Lazy load images
   - Responsive images
   - Proper sizing

3. **Font Optimization**:
   - Use font-display: swap
   - Preload critical fonts
   - Subset fonts

## Troubleshooting

### Bundle Too Large

1. Check bundle analyzer for large dependencies
2. Consider alternatives to large libraries
3. Implement code splitting
4. Enable tree shaking

### Slow Component Renders

1. Run benchmark tests to identify slow components
2. Use React DevTools Profiler
3. Memoize expensive operations
4. Optimize re-renders

### Poor Web Vitals

1. Run Lighthouse for detailed recommendations
2. Check network waterfall
3. Optimize critical rendering path
4. Reduce JavaScript execution time

### Memory Leaks

1. Check for event listener cleanup
2. Clear timers and intervals
3. Unsubscribe from observables
4. Use Chrome DevTools Memory profiler

## Best Practices

1. **Test Early and Often**:
   - Run performance tests in development
   - Check bundle sizes before merging
   - Monitor metrics in production

2. **Set Realistic Budgets**:
   - Based on target devices
   - Consider network conditions
   - Review and adjust regularly

3. **Automate Testing**:
   - Run in CI/CD pipeline
   - Fail builds on regression
   - Track trends over time

4. **Monitor Production**:
   - Track real user metrics
   - Identify slow devices
   - Analyze bottlenecks

5. **Document Changes**:
   - Note performance impacts
   - Document optimizations
   - Share learnings

## Resources

- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [React Performance](https://react.dev/learn/render-and-commit)
- [Vite Performance](https://vitejs.dev/guide/performance.html)

## Acceptance Criteria

- ✅ All metrics meet targets
- ✅ Budgets enforced in CI
- ✅ Tests run automatically
- ✅ Dashboard shows trends
- ✅ Alerts configured
- ✅ Documentation complete
- ✅ Team trained on tools
- ✅ Optimization strategies documented
