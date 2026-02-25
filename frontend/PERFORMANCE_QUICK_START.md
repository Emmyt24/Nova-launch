# Performance Testing Quick Start

## 🚀 Quick Commands

```bash
# Build the app
npm run build

# Run all performance tests
npm run test:performance

# Check bundle sizes
npm run perf:check

# Run benchmarks
npm run perf:benchmark

# Analyze bundle
npm run build:analyze

# Run Lighthouse
npm run lighthouse
```

## 📊 Performance Budgets

| Metric | Budget | Status |
|--------|--------|--------|
| First Contentful Paint (FCP) | < 1.5s | ✅ |
| Largest Contentful Paint (LCP) | < 2.5s | ✅ |
| Time to Interactive (TTI) | < 3.5s | ✅ |
| Total Blocking Time (TBT) | < 300ms | ✅ |
| Cumulative Layout Shift (CLS) | < 0.1 | ✅ |
| Initial Bundle | < 200KB | ✅ |
| Total Bundle | < 500KB | ✅ |
| CSS Bundle | < 50KB | ✅ |

## 🧪 Running Tests

### 1. Bundle Size Tests

```bash
# Build first
npm run build

# Run tests
npm run test:performance

# Or run specific test
npm run test -- src/test/performance/bundle-size.test.ts
```

### 2. Component Benchmarks

```bash
# Run benchmarks with detailed output
npm run perf:benchmark

# Or run all performance tests
npm run test:performance
```

### 3. Lighthouse CI

```bash
# Install Lighthouse CI (one time)
npm install -g @lhci/cli

# Build and start preview server
npm run build
npm run preview

# In another terminal, run Lighthouse
npm run lighthouse
```

## 📈 Viewing Results

### Bundle Analyzer

```bash
npm run build:analyze
```

Opens interactive visualization showing:
- Bundle composition
- Chunk sizes
- Dependencies
- Optimization opportunities

### Performance Dashboard (Dev Mode)

Press `Ctrl+Shift+P` in development to toggle the performance dashboard.

Shows real-time metrics:
- FCP, LCP, FID, CLS, TTFB, TTI
- Color-coded (green/yellow/red)
- Download report button

### Lighthouse Reports

After running Lighthouse:
```bash
# View reports
ls -la .lighthouseci/

# Open HTML report
open .lighthouseci/*.html
```

## 🔍 Debugging Performance Issues

### 1. Large Bundle Size

```bash
# Analyze bundle
npm run build:analyze

# Check what's large
npm run perf:check
```

Look for:
- Large dependencies
- Duplicate code
- Missing code splitting

### 2. Slow Component Renders

```bash
# Run benchmarks
npm run perf:benchmark
```

Look for:
- Components taking > 16ms
- Expensive re-renders
- Unoptimized operations

### 3. Poor Web Vitals

```bash
# Run Lighthouse
npm run lighthouse
```

Check:
- Network waterfall
- Main thread work
- Render-blocking resources

## 🛠️ Common Fixes

### Reduce Bundle Size

```typescript
// Use lazy loading
const Dashboard = lazy(() => import('./pages/Dashboard'));

// Import only what you need
import { specific } from 'library';

// Use dynamic imports
const module = await import('./module');
```

### Optimize Components

```typescript
// Memoize components
const MemoComponent = memo(Component);

// Memoize values
const value = useMemo(() => expensive(), [deps]);

// Memoize callbacks
const callback = useCallback(() => {}, [deps]);
```

### Improve Load Performance

```typescript
// Lazy load images
<img loading="lazy" src="..." />

// Preload critical resources
<link rel="preload" href="..." />

// Defer non-critical scripts
<script defer src="..." />
```

## 📝 CI/CD Integration

Performance tests run automatically on:
- Push to main/develop
- Pull requests
- Scheduled builds

View results in:
- GitHub Actions logs
- PR comments
- Artifacts

## 🎯 Performance Targets

### Load Performance
- ✅ FCP < 1.5s
- ✅ LCP < 2.5s
- ✅ TTI < 3.5s
- ✅ TBT < 300ms
- ✅ CLS < 0.1

### Runtime Performance
- ✅ Render < 16ms (60fps)
- ✅ Interaction < 100ms
- ✅ No memory leaks

### Bundle Performance
- ✅ Initial < 200KB
- ✅ Total < 500KB
- ✅ Code splitting effective

## 📚 Resources

- [Full Documentation](./PERFORMANCE_TESTING.md)
- [Checklist](./PERFORMANCE_CHECKLIST.md)
- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)

## 💡 Tips

1. **Test Early**: Run performance tests during development
2. **Monitor Trends**: Track metrics over time
3. **Set Budgets**: Enforce performance budgets in CI
4. **Optimize Incrementally**: Small improvements add up
5. **Measure Real Users**: Use RUM in production

## 🆘 Need Help?

1. Check [PERFORMANCE_TESTING.md](./PERFORMANCE_TESTING.md) for detailed guide
2. Review [PERFORMANCE_CHECKLIST.md](./PERFORMANCE_CHECKLIST.md) for tasks
3. Run `npm run perf:check` for quick diagnostics
4. Check bundle analyzer for optimization opportunities
