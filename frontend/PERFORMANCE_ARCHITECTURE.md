# Performance Testing Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Performance Testing System                   │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Local Dev      │  │   CI/CD Pipeline │  │   Monitoring     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Application                             │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Components with usePerformanceMonitor hook            │    │
│  │  - Tracks render times                                  │    │
│  │  - Logs slow renders                                    │    │
│  │  - Provides stats                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  PerformanceDashboard (Dev Only)                       │    │
│  │  - Real-time metrics                                    │    │
│  │  - Memory usage                                         │    │
│  │  - Toggle with Ctrl+Shift+P                            │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Testing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Test Execution                           │
└─────────────────────────────────────────────────────────────────┘

1. Unit Tests (Vitest)
   ├── benchmark.test.ts
   │   ├── Component render times
   │   ├── List rendering
   │   ├── State updates
   │   └── Memory leak detection
   │
   ├── interaction.test.ts
   │   ├── Click response
   │   ├── Input changes
   │   ├── Rapid updates
   │   ├── Scroll handling
   │   └── Animation FPS
   │
   └── bundle-analysis.test.ts
       ├── Code splitting check
       ├── Compression check
       ├── Tree shaking check
       └── Lazy loading check

2. Build Analysis
   ├── npm run build
   ├── analyze-bundle.js
   │   ├── Calculate sizes
   │   ├── Compare to budgets
   │   ├── Identify large files
   │   └── Suggest optimizations
   │
   └── Output: bundle-analysis.json

3. Lighthouse CI
   ├── npm run preview (start server)
   ├── lhci autorun
   │   ├── Run 3 times
   │   ├── Collect metrics
   │   ├── Assert budgets
   │   └── Generate reports
   │
   └── Output: .lighthouseci/

4. Performance Monitoring
   ├── performance-monitor.js
   │   ├── Load bundle analysis
   │   ├── Load lighthouse results
   │   ├── Compare to history
   │   ├── Detect regressions
   │   └── Update history
   │
   └── Output: performance-history.json
```

## CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                       │
└─────────────────────────────────────────────────────────────────┘

Trigger: Push to main/develop or Pull Request
│
├── Job 1: Lighthouse CI
│   ├── Checkout code
│   ├── Setup Node.js
│   ├── Install dependencies
│   ├── Build application
│   ├── Run Lighthouse CI
│   └── Upload results
│
├── Job 2: Bundle Analysis
│   ├── Checkout code
│   ├── Setup Node.js
│   ├── Install dependencies
│   ├── Build application
│   ├── Run analyze-bundle.js
│   ├── Upload analysis
│   └── Comment on PR (if PR)
│
├── Job 3: Performance Benchmarks
│   ├── Checkout code
│   ├── Setup Node.js
│   ├── Install dependencies
│   ├── Run test:performance
│   └── Upload results
│
└── Job 4: Performance Monitoring (main only)
    ├── Checkout code
    ├── Setup Node.js
    ├── Install dependencies
    ├── Download artifacts
    ├── Build application
    ├── Run Lighthouse CI
    ├── Run analyze-bundle.js
    ├── Run performance-monitor.js
    ├── Commit history
    └── Push to repo

Result: ✅ Pass or ❌ Fail (with details)
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          Data Flow                               │
└─────────────────────────────────────────────────────────────────┘

Build Process
│
├── Vite Build
│   ├── Code splitting
│   ├── Tree shaking
│   ├── Compression (gzip + brotli)
│   └── Asset optimization
│   │
│   └── Output: dist/
│
├── Bundle Analysis
│   ├── Read dist/ files
│   ├── Calculate sizes
│   ├── Compare budgets
│   └── Generate report
│   │
│   └── Output: bundle-analysis.json
│
├── Lighthouse CI
│   ├── Start preview server
│   ├── Run audits (3x)
│   ├── Calculate metrics
│   └── Assert budgets
│   │
│   └── Output: .lighthouseci/*.json
│
└── Performance Monitor
    ├── Read bundle-analysis.json
    ├── Read .lighthouseci/*.json
    ├── Load performance-history.json
    ├── Calculate trends
    ├── Detect regressions
    └── Update history
    │
    └── Output: performance-history.json (updated)
```

## Budget Enforcement

```
┌─────────────────────────────────────────────────────────────────┐
│                      Budget Enforcement                          │
└─────────────────────────────────────────────────────────────────┘

Performance Budgets (performance-budgets.json)
│
├── Resource Sizes
│   ├── script: 200 KB
│   ├── total: 500 KB
│   ├── stylesheet: 50 KB
│   ├── image: 200 KB
│   └── font: 100 KB
│
├── Resource Counts
│   ├── script: 10
│   ├── stylesheet: 5
│   └── third-party: 5
│
└── Timings
    ├── FCP: 1500 ms
    ├── LCP: 2500 ms
    ├── TTI: 3500 ms
    ├── CLS: 0.1
    ├── TBT: 300 ms
    └── Speed Index: 3000 ms

Lighthouse CI (.lighthouserc.js)
│
├── Performance Score: ≥ 90
├── Accessibility Score: ≥ 95
├── Best Practices Score: ≥ 90
├── SEO Score: ≥ 90
│
└── Core Web Vitals
    ├── FCP: ≤ 1500 ms (error)
    ├── LCP: ≤ 2500 ms (error)
    ├── CLS: ≤ 0.1 (error)
    ├── TBT: ≤ 300 ms (error)
    └── TTI: ≤ 3500 ms (error)

Enforcement Points
│
├── Local Development
│   ├── npm run analyze (manual)
│   └── npm run lighthouse (manual)
│
├── CI/CD Pipeline
│   ├── Automatic on every build
│   ├── Fails build if exceeded
│   └── Comments on PR
│
└── Performance Monitor
    ├── Tracks trends
    ├── Detects regressions (>10%)
    └── Fails if regression detected
```

## Monitoring & Alerting

```
┌─────────────────────────────────────────────────────────────────┐
│                    Monitoring & Alerting                         │
└─────────────────────────────────────────────────────────────────┘

Historical Data (performance-history.json)
│
├── Last 100 builds
├── Includes:
│   ├── Timestamp
│   ├── Commit SHA
│   ├── Branch name
│   ├── Bundle sizes
│   └── Lighthouse metrics
│
└── Used for:
    ├── Trend analysis
    ├── Regression detection
    └── Performance tracking

Regression Detection
│
├── Threshold: 10% increase
├── Metrics checked:
│   ├── Total bundle size
│   ├── FCP
│   ├── LCP
│   ├── TTI
│   ├── TBT
│   └── CLS
│
└── Actions:
    ├── Log warning
    ├── Fail CI build
    └── Notify team (future)

Alerts
│
├── CI Build Failure
│   ├── Budget exceeded
│   ├── Regression detected
│   └── Test failures
│
├── PR Comments
│   ├── Bundle size report
│   ├── Comparison to budget
│   └── Optimization suggestions
│
└── Future Enhancements
    ├── Slack notifications
    ├── Email alerts
    └── Dashboard alerts
```

## File Structure

```
frontend/
├── .lighthouserc.js              # Lighthouse CI config
├── performance-budgets.json      # Budget definitions
├── vite.config.ts                # Build optimization
├── package.json                  # Scripts
│
├── scripts/
│   ├── analyze-bundle.js         # Bundle analysis
│   └── performance-monitor.js    # Historical tracking
│
├── src/
│   ├── hooks/
│   │   └── usePerformanceMonitor.ts  # Monitoring hook
│   │
│   ├── components/
│   │   └── PerformanceDashboard.tsx  # Dev dashboard
│   │
│   └── test/
│       └── performance/
│           ├── benchmark.test.ts      # Render tests
│           ├── interaction.test.ts    # Interaction tests
│           └── bundle-analysis.test.ts # Bundle tests
│
├── .lighthouseci/                # Lighthouse results
├── bundle-analysis.json          # Bundle report
├── performance-history.json      # Historical data
│
└── Documentation/
    ├── PERFORMANCE_TESTING.md
    ├── PERFORMANCE_QUICK_REF.md
    └── PERFORMANCE_ARCHITECTURE.md (this file)

.github/
└── workflows/
    └── performance.yml           # CI/CD workflow
```

## Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                      Integration Points                          │
└─────────────────────────────────────────────────────────────────┘

1. Development
   ├── usePerformanceMonitor hook
   │   └── Add to components for monitoring
   │
   ├── PerformanceDashboard
   │   └── Toggle with Ctrl+Shift+P
   │
   └── npm scripts
       ├── test:performance
       ├── analyze
       └── lighthouse

2. Build Process
   ├── Vite plugins
   │   ├── compression
   │   └── visualizer
   │
   └── Build optimization
       ├── Code splitting
       ├── Tree shaking
       └── Asset optimization

3. Testing
   ├── Vitest
   │   └── Performance test suite
   │
   ├── Lighthouse CI
   │   └── Core Web Vitals
   │
   └── Custom scripts
       ├── Bundle analysis
       └── Performance monitoring

4. CI/CD
   ├── GitHub Actions
   │   └── Automated workflow
   │
   ├── PR Comments
   │   └── Bundle size report
   │
   └── Build Status
       └── Pass/Fail based on budgets

5. Monitoring
   ├── Performance history
   │   └── JSON file in repo
   │
   ├── Trend analysis
   │   └── Last 5 builds
   │
   └── Regression detection
       └── 10% threshold
```

## Best Practices

```
┌─────────────────────────────────────────────────────────────────┐
│                       Best Practices                             │
└─────────────────────────────────────────────────────────────────┘

1. Development
   ✓ Use usePerformanceMonitor for critical components
   ✓ Check performance dashboard regularly
   ✓ Run tests before committing
   ✓ Profile slow components

2. Testing
   ✓ Run performance tests locally
   ✓ Check bundle size after changes
   ✓ Verify Lighthouse scores
   ✓ Review performance history

3. Optimization
   ✓ Code split large dependencies
   ✓ Lazy load routes
   ✓ Optimize images (WebP)
   ✓ Minimize JavaScript
   ✓ Use compression

4. Monitoring
   ✓ Track trends over time
   ✓ Investigate regressions
   ✓ Set realistic budgets
   ✓ Update budgets as needed

5. CI/CD
   ✓ Don't ignore failures
   ✓ Review PR comments
   ✓ Fix regressions promptly
   ✓ Keep history clean
```

---

This architecture provides a comprehensive performance testing system that:
- Monitors performance continuously
- Enforces budgets automatically
- Detects regressions early
- Provides actionable insights
- Integrates seamlessly with development workflow
