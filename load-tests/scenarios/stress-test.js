import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { config } from '../config/test-config.js';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const activeUsers = new Gauge('active_users');
const failedRequests = new Counter('failed_requests');
const successfulRequests = new Counter('successful_requests');

// Stress test configuration - push system to its limits
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 150 },  // Ramp up to 150 users
    { duration: '5m', target: 200 },  // Ramp up to 200 users - breaking point
    { duration: '3m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: config.thresholds.stress,
  tags: {
    test_type: 'stress_test',
  },
};

export default function () {
  const baseUrl = config.baseUrl;
  activeUsers.add(1);
  
  // Aggressive request pattern
  const requests = [
    performSearch,
    performFilter,
    performPagination,
    performComplexQuery,
    performBurnFilter,
    performSupplyRange,
  ];
  
  // Execute 3-5 requests per iteration
  const numRequests = Math.floor(Math.random() * 3) + 3;
  
  for (let i = 0; i < numRequests; i++) {
    const requestFunc = requests[Math.floor(Math.random() * requests.length)];
    requestFunc(baseUrl);
    sleep(0.1); // Minimal sleep between requests
  }
  
  sleep(Math.random() * 0.5); // Short sleep between iterations
}

function performSearch(baseUrl) {
  const query = config.testData.searchQueries[
    Math.floor(Math.random() * config.testData.searchQueries.length)
  ];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?q=${query}`,
    {
      tags: { name: 'StressSearch' },
      timeout: '10s',
    }
  );
  
  trackResponse(response, 'search');
}

function performFilter(baseUrl) {
  const creator = config.testData.creators[
    Math.floor(Math.random() * config.testData.creators.length)
  ];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?creator=${creator}&sortBy=created`,
    {
      tags: { name: 'StressFilter' },
      timeout: '10s',
    }
  );
  
  trackResponse(response, 'filter');
}

function performPagination(baseUrl) {
  const page = Math.floor(Math.random() * 20) + 1;
  const limit = 50; // Max limit
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?page=${page}&limit=${limit}`,
    {
      tags: { name: 'StressPagination' },
      timeout: '10s',
    }
  );
  
  trackResponse(response, 'pagination');
}

function performComplexQuery(baseUrl) {
  const query = config.testData.searchQueries[
    Math.floor(Math.random() * config.testData.searchQueries.length)
  ];
  const creator = config.testData.creators[
    Math.floor(Math.random() * config.testData.creators.length)
  ];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?q=${query}&creator=${creator}&hasBurns=true&minSupply=1000&sortBy=burned&sortOrder=desc`,
    {
      tags: { name: 'StressComplex' },
      timeout: '10s',
    }
  );
  
  trackResponse(response, 'complex');
}

function performBurnFilter(baseUrl) {
  const hasBurns = Math.random() > 0.5 ? 'true' : 'false';
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?hasBurns=${hasBurns}&sortBy=burned&sortOrder=desc`,
    {
      tags: { name: 'StressBurnFilter' },
      timeout: '10s',
    }
  );
  
  trackResponse(response, 'burn_filter');
}

function performSupplyRange(baseUrl) {
  const minSupply = Math.floor(Math.random() * 100000);
  const maxSupply = minSupply + Math.floor(Math.random() * 1000000);
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?minSupply=${minSupply}&maxSupply=${maxSupply}&sortBy=supply`,
    {
      tags: { name: 'StressSupplyRange' },
      timeout: '10s',
    }
  );
  
  trackResponse(response, 'supply_range');
}

function trackResponse(response, operation) {
  const success = response.status === 200;
  
  check(response, {
    [`${operation} status is 200`]: (r) => r.status === 200,
    [`${operation} response time < 5000ms`]: (r) => r.timings.duration < 5000,
  });
  
  if (success) {
    successfulRequests.add(1);
  } else {
    failedRequests.add(1);
    console.log(`Failed ${operation}: ${response.status} - ${response.body.substring(0, 100)}`);
  }
  
  errorRate.add(!success);
  apiDuration.add(response.timings.duration);
}

export function handleSummary(data) {
  const summary = generateDetailedSummary(data);
  
  return {
    'results/stress-test-summary.json': JSON.stringify(data, null, 2),
    'results/stress-test-report.txt': summary,
    stdout: summary,
  };
}

function generateDetailedSummary(data) {
  let summary = '\n' + '='.repeat(60) + '\n';
  summary += '           STRESS TEST RESULTS\n';
  summary += '='.repeat(60) + '\n\n';
  
  if (data.metrics) {
    summary += 'PERFORMANCE METRICS:\n';
    summary += '-'.repeat(60) + '\n';
    
    if (data.metrics.http_req_duration) {
      const duration = data.metrics.http_req_duration.values;
      summary += `  Average Response Time: ${duration.avg.toFixed(2)}ms\n`;
      summary += `  Median Response Time:  ${duration.med.toFixed(2)}ms\n`;
      summary += `  95th Percentile:       ${duration['p(95)'].toFixed(2)}ms\n`;
      summary += `  99th Percentile:       ${duration['p(99)'].toFixed(2)}ms\n`;
      summary += `  Max Response Time:     ${duration.max.toFixed(2)}ms\n`;
    }
    
    summary += '\nTHROUGHPUT:\n';
    summary += '-'.repeat(60) + '\n';
    
    if (data.metrics.http_reqs) {
      const reqs = data.metrics.http_reqs.values;
      summary += `  Total Requests:        ${reqs.count}\n`;
      summary += `  Requests per Second:   ${reqs.rate.toFixed(2)}\n`;
    }
    
    if (data.metrics.successful_requests && data.metrics.failed_requests) {
      const success = data.metrics.successful_requests.values.count;
      const failed = data.metrics.failed_requests.values.count;
      const total = success + failed;
      summary += `  Successful Requests:   ${success} (${((success/total)*100).toFixed(2)}%)\n`;
      summary += `  Failed Requests:       ${failed} (${((failed/total)*100).toFixed(2)}%)\n`;
    }
    
    summary += '\nERROR ANALYSIS:\n';
    summary += '-'.repeat(60) + '\n';
    
    if (data.metrics.errors) {
      const errorPct = (data.metrics.errors.values.rate * 100).toFixed(2);
      summary += `  Error Rate:            ${errorPct}%\n`;
    }
    
    if (data.metrics.http_req_failed) {
      const failedPct = (data.metrics.http_req_failed.values.rate * 100).toFixed(2);
      summary += `  Failed Request Rate:   ${failedPct}%\n`;
    }
  }
  
  summary += '\n' + '='.repeat(60) + '\n';
  summary += 'BREAKING POINT ANALYSIS:\n';
  summary += '='.repeat(60) + '\n';
  
  if (data.metrics && data.metrics.errors) {
    const errorRate = data.metrics.errors.values.rate;
    if (errorRate > 0.1) {
      summary += '⚠️  SYSTEM BREAKING POINT REACHED\n';
      summary += `   Error rate exceeded 10% (${(errorRate * 100).toFixed(2)}%)\n`;
    } else if (errorRate > 0.05) {
      summary += '⚠️  SYSTEM UNDER HEAVY STRESS\n';
      summary += `   Error rate: ${(errorRate * 100).toFixed(2)}%\n`;
    } else {
      summary += '✓  SYSTEM HANDLED STRESS WELL\n';
      summary += `   Error rate: ${(errorRate * 100).toFixed(2)}%\n`;
    }
  }
  
  summary += '\n';
  return summary;
}
