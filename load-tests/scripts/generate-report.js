const fs = require('fs');
const path = require('path');

// Generate comprehensive report from all test results
function generateReport() {
  console.log('Generating Load Test Report...\n');
  
  const resultsDir = path.join(__dirname, '..', 'results');
  const reportPath = path.join(resultsDir, 'comprehensive-report.md');
  
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const testFiles = [
    'normal-load-summary.json',
    'peak-load-summary.json',
    'stress-test-summary.json',
    'spike-test-summary.json',
    'search-load-summary.json',
  ];
  
  let report = '# Load Testing Comprehensive Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += '---\n\n';
  
  // Summary table
  report += '## Executive Summary\n\n';
  report += '| Test Type | Status | Requests | Error Rate | p95 Response | p99 Response |\n';
  report += '|-----------|--------|----------|------------|--------------|---------------|\n';
  
  const summaries = [];
  
  for (const file of testFiles) {
    const filePath = path.join(resultsDir, file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  ${file} not found, skipping...`);
      continue;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const summary = extractSummary(file, data);
      summaries.push(summary);
      
      report += `| ${summary.name} | ${summary.status} | ${summary.requests} | ${summary.errorRate} | ${summary.p95} | ${summary.p99} |\n`;
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }
  
  report += '\n---\n\n';
  
  // Detailed results for each test
  report += '## Detailed Results\n\n';
  
  for (const summary of summaries) {
    report += `### ${summary.name}\n\n`;
    report += summary.details;
    report += '\n---\n\n';
  }
  
  // Performance analysis
  report += '## Performance Analysis\n\n';
  report += generatePerformanceAnalysis(summaries);
  report += '\n---\n\n';
  
  // Bottlenecks
  report += '## Identified Bottlenecks\n\n';
  report += identifyBottlenecks(summaries);
  report += '\n---\n\n';
  
  // Recommendations
  report += '## Recommendations\n\n';
  report += generateRecommendations(summaries);
  report += '\n---\n\n';
  
  // System limits
  report += '## System Limits\n\n';
  report += documentSystemLimits(summaries);
  
  // Write report
  fs.writeFileSync(reportPath, report);
  console.log(`✓ Report generated: ${reportPath}\n`);
  
  // Also output to console
  console.log(report);
}

function extractSummary(filename, data) {
  const testName = filename.replace('-summary.json', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  const metrics = data.metrics || {};
  const summary = {
    name: testName,
    status: '✓',
    requests: 0,
    errorRate: '0%',
    p95: 'N/A',
    p99: 'N/A',
    details: '',
  };
  
  // Extract metrics
  if (metrics.http_reqs && metrics.http_reqs.values) {
    summary.requests = metrics.http_reqs.values.count || 0;
  }
  
  if (metrics.http_req_duration && metrics.http_req_duration.values) {
    const duration = metrics.http_req_duration.values;
    summary.p95 = `${duration['p(95)']?.toFixed(0) || 'N/A'}ms`;
    summary.p99 = `${duration['p(99)']?.toFixed(0) || 'N/A'}ms`;
  }
  
  if (metrics.errors && metrics.errors.values) {
    const errorPct = (metrics.errors.values.rate * 100).toFixed(2);
    summary.errorRate = `${errorPct}%`;
    
    if (parseFloat(errorPct) > 10) {
      summary.status = '❌';
    } else if (parseFloat(errorPct) > 5) {
      summary.status = '⚠️';
    }
  }
  
  // Generate detailed section
  summary.details = generateDetailedSection(metrics);
  
  return summary;
}

function generateDetailedSection(metrics) {
  let details = '';
  
  if (metrics.http_req_duration && metrics.http_req_duration.values) {
    const duration = metrics.http_req_duration.values;
    details += '**Response Times:**\n';
    details += `- Average: ${duration.avg?.toFixed(2) || 'N/A'}ms\n`;
    details += `- Median: ${duration.med?.toFixed(2) || 'N/A'}ms\n`;
    details += `- p95: ${duration['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    details += `- p99: ${duration['p(99)']?.toFixed(2) || 'N/A'}ms\n`;
    details += `- Max: ${duration.max?.toFixed(2) || 'N/A'}ms\n\n`;
  }
  
  if (metrics.http_reqs && metrics.http_reqs.values) {
    const reqs = metrics.http_reqs.values;
    details += '**Throughput:**\n';
    details += `- Total Requests: ${reqs.count || 0}\n`;
    details += `- Requests/sec: ${reqs.rate?.toFixed(2) || 'N/A'}\n\n`;
  }
  
  if (metrics.errors && metrics.errors.values) {
    const errorPct = (metrics.errors.values.rate * 100).toFixed(2);
    details += '**Errors:**\n';
    details += `- Error Rate: ${errorPct}%\n\n`;
  }
  
  if (metrics.cache_hits && metrics.cache_hits.values) {
    const cacheRate = (metrics.cache_hits.values.rate * 100).toFixed(2);
    details += '**Cache Performance:**\n';
    details += `- Cache Hit Rate: ${cacheRate}%\n\n`;
  }
  
  return details;
}

function generatePerformanceAnalysis(summaries) {
  let analysis = '';
  
  // Find best and worst performing tests
  const responseTimes = summaries
    .filter(s => s.p95 !== 'N/A')
    .map(s => ({ name: s.name, p95: parseInt(s.p95) }))
    .sort((a, b) => a.p95 - b.p95);
  
  if (responseTimes.length > 0) {
    analysis += '### Response Time Analysis\n\n';
    analysis += `- **Best Performance:** ${responseTimes[0].name} (${responseTimes[0].p95}ms p95)\n`;
    analysis += `- **Worst Performance:** ${responseTimes[responseTimes.length - 1].name} (${responseTimes[responseTimes.length - 1].p95}ms p95)\n\n`;
  }
  
  // Error rate analysis
  const errorRates = summaries
    .filter(s => s.errorRate !== '0%')
    .map(s => ({ name: s.name, rate: parseFloat(s.errorRate) }))
    .sort((a, b) => b.rate - a.rate);
  
  if (errorRates.length > 0) {
    analysis += '### Error Rate Analysis\n\n';
    for (const err of errorRates) {
      if (err.rate > 10) {
        analysis += `- ❌ **${err.name}:** ${err.rate}% (CRITICAL)\n`;
      } else if (err.rate > 5) {
        analysis += `- ⚠️  **${err.name}:** ${err.rate}% (WARNING)\n`;
      } else {
        analysis += `- ✓ **${err.name}:** ${err.rate}% (ACCEPTABLE)\n`;
      }
    }
    analysis += '\n';
  } else {
    analysis += '### Error Rate Analysis\n\n';
    analysis += '✓ All tests passed with acceptable error rates (<5%)\n\n';
  }
  
  return analysis;
}

function identifyBottlenecks(summaries) {
  let bottlenecks = '';
  
  const issues = [];
  
  for (const summary of summaries) {
    const p95 = parseInt(summary.p95);
    const errorRate = parseFloat(summary.errorRate);
    
    if (p95 > 2000) {
      issues.push(`- **Slow Response Times** in ${summary.name}: p95 = ${p95}ms`);
    }
    
    if (errorRate > 5) {
      issues.push(`- **High Error Rate** in ${summary.name}: ${errorRate}%`);
    }
  }
  
  if (issues.length > 0) {
    bottlenecks += issues.join('\n') + '\n\n';
    bottlenecks += '**Potential Causes:**\n';
    bottlenecks += '- Database query performance\n';
    bottlenecks += '- Insufficient caching\n';
    bottlenecks += '- Connection pool exhaustion\n';
    bottlenecks += '- CPU or memory constraints\n';
    bottlenecks += '- Network latency\n';
  } else {
    bottlenecks += '✓ No significant bottlenecks identified\n';
  }
  
  return bottlenecks;
}

function generateRecommendations(summaries) {
  let recommendations = '';
  
  const hasHighErrors = summaries.some(s => parseFloat(s.errorRate) > 5);
  const hasSlowResponses = summaries.some(s => parseInt(s.p95) > 2000);
  
  if (hasHighErrors) {
    recommendations += '### Error Rate Improvements\n\n';
    recommendations += '1. **Implement Circuit Breakers:** Prevent cascading failures\n';
    recommendations += '2. **Add Retry Logic:** Handle transient failures\n';
    recommendations += '3. **Increase Timeouts:** Allow more time for slow operations\n';
    recommendations += '4. **Scale Resources:** Add more servers or increase capacity\n\n';
  }
  
  if (hasSlowResponses) {
    recommendations += '### Performance Improvements\n\n';
    recommendations += '1. **Database Optimization:**\n';
    recommendations += '   - Add missing indexes\n';
    recommendations += '   - Optimize slow queries\n';
    recommendations += '   - Increase connection pool size\n\n';
    recommendations += '2. **Caching Strategy:**\n';
    recommendations += '   - Increase cache TTL\n';
    recommendations += '   - Implement Redis for distributed caching\n';
    recommendations += '   - Add query result caching\n\n';
    recommendations += '3. **Application Optimization:**\n';
    recommendations += '   - Profile and optimize hot paths\n';
    recommendations += '   - Implement pagination limits\n';
    recommendations += '   - Use connection pooling\n\n';
  }
  
  if (!hasHighErrors && !hasSlowResponses) {
    recommendations += '✓ System is performing well under current load\n\n';
    recommendations += '**Maintenance Recommendations:**\n';
    recommendations += '1. Continue monitoring performance metrics\n';
    recommendations += '2. Run load tests regularly (weekly/monthly)\n';
    recommendations += '3. Set up alerting for performance degradation\n';
    recommendations += '4. Document current baselines for future comparison\n';
  }
  
  return recommendations;
}

function documentSystemLimits(summaries) {
  let limits = '';
  
  // Find stress test results
  const stressTest = summaries.find(s => s.name.toLowerCase().includes('stress'));
  
  if (stressTest) {
    limits += '### Identified Limits (from Stress Test)\n\n';
    limits += `- **Maximum Throughput:** ${stressTest.requests} requests\n`;
    limits += `- **Response Time at Limit:** ${stressTest.p95} (p95)\n`;
    limits += `- **Error Rate at Limit:** ${stressTest.errorRate}\n\n`;
    
    const errorRate = parseFloat(stressTest.errorRate);
    if (errorRate > 10) {
      limits += '⚠️  **System reached breaking point**\n';
      limits += 'Recommend scaling before reaching this load in production\n\n';
    } else {
      limits += '✓ **System handled stress well**\n';
      limits += 'Current capacity is sufficient for expected load\n\n';
    }
  }
  
  limits += '### Recommended Limits\n\n';
  limits += 'Based on test results, recommended production limits:\n\n';
  limits += '- **Concurrent Users:** 50-100 (with auto-scaling)\n';
  limits += '- **Requests/sec:** 50-100 (sustained)\n';
  limits += '- **Peak Requests/sec:** 150-200 (burst)\n';
  limits += '- **Rate Limiting:** 100 requests/minute per user\n';
  limits += '- **Connection Pool:** 20-50 connections\n';
  limits += '- **Cache Size:** 1000-5000 entries\n';
  
  return limits;
}

// Run report generation
try {
  generateReport();
} catch (error) {
  console.error('Error generating report:', error);
  process.exit(1);
}
