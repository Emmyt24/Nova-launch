# Performance Testing Quick Reference

## Quick Commands

```bash
# Run all performance tests
npm run test:performance

# Analyze bundle size
npm run analyze

# Run Lighthouse CI
npm run lighthouse

# Monitor performance trends
npm run perf:monitor

# Build with bundle visualization
npm run build:analyze
```

## Performance Budgets

| Metric | Budget | Critical |
|--------|--------|----------|
| FCP | 1.5s | ✅ |
| LCP | 2.5s | ✅ |
| TTI | 3.5s | ✅ |
| TBT | 300ms | ✅ |
| CLS | 0.1 | ✅ |
| Initial Bundle | 200KB | ✅ |
| Total Bundle | 500KB | ✅ |
| Component Render | 16ms | ⚠️ |
| Interaction | 100ms | ⚠️ |

## Test Files

- `src/test/performance/benchmark.test.ts` - Component render benchmarks
- `src/test/performance/interaction.test.ts` - Interaction response times
- `src/test/performance/bundle-analysis.test.ts` - Bundle optimization checks

## Scripts

- `scripts/analyze-bundle.js` - Bundle size analysis
- `scripts/performance-monitor.js` - Historical tracking

## CI/CD

- `.github/workflows/performance.yml` - Automated performance testing
- Runs on every push and PR
- Comments bundle size on PRs
- Fails on budget violations

## Configuration

- `.lighthouserc.js` - Lighthouse CI config
- `performance-budgets.json` - Budget definitions
- `vite.config.ts` - Build optimization

## Monitoring

- Performance history: `performance-history.json`
- Bundle analysis: `bundle-analysis.json`
- Lighthouse results: `.lighthouseci/`

## Keyboard Shortcuts

- `Ctrl+Shift+P` - Toggle performance dashboard (dev only)

## Common Issues

### Bundle too large
```bash
npm run analyze
# Check largest files and add code splitting
```

### Slow component
```typescript
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';

usePerformanceMonitor({ componentName: 'MyComponent' });
```

### Poor Lighthouse score
```bash
npm run lighthouse
# Check specific failing audits
```

## Optimization Checklist

- [ ] Code splitting configured
- [ ] Lazy loading for routes
- [ ] Images optimized (WebP)
- [ ] Fonts subset and preloaded
- [ ] Compression enabled (gzip + brotli)
- [ ] Tree shaking active
- [ ] Bundle size < 500KB
- [ ] All Core Web Vitals pass
- [ ] No memory leaks
- [ ] 60fps animations

## Resources

- Full guide: `PERFORMANCE_TESTING.md`
- Web Vitals: https://web.dev/vitals/
- Lighthouse: https://github.com/GoogleChrome/lighthouse-ci
