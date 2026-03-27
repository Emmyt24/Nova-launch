import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config } from '../config/test-config.js';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const cacheHitRate = new Rate('cache_hits');
const requestCounter = new Counter('total_requests');

// Peak load configuration
export const options = {
  stages: [
    { duration: '1m', target: 20 },  // Ramp up to 20 users
    { duration: '2m', target: 50 },  // Ramp up to 50 users
    { duration: '5m', target: 50 },  // Stay at 50 users for 5 minutes
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: config.thresholds.peak,
  tags: {
    test_type: 'peak_load',
  },
};

export default function () {
  const baseUrl = config.baseUrl;
  const testScenario = Math.random();
  
  if (testScenario < 0.4) {
    // 40% - Search operations
    performSearch(baseUrl);
  } else if (testScenario < 0.7) {
    // 30% - Filter operations
    performFilter(baseUrl);
  } else if (testScenario < 0.9) {
    // 20% - Pagination
    performPagination(baseUrl);
  } else {
    // 10% - Complex queries
    performComplexQuery(baseUrl);
  }
  
  sleep(Math.random() * 2 + 0.5); // Random sleep between 0.5-2.5s
}

function performSearch(baseUrl) {
  const query = config.testData.searchQueries[
    Math.floor(Math.random() * config.testData.searchQueries.length)
  ];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?q=${query}`,
    {
      tags: { name: 'Search', operation: 'search' },
    }
  );
  
  const success = check(response, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  errorRate.add(!success);
  apiDuration.add(response.timings.duration);
  requestCounter.add(1);
  
  // Check if response was cached (custom header or fast response)
  cacheHitRate.add(response.timings.duration < 50);
}

function performFilter(baseUrl) {
  const filters = [
    `creator=${config.testData.creators[0]}`,
    'hasBurns=true',
    'minSupply=1000&maxSupply=1000000',
    'sortBy=burned&sortOrder=desc',
  ];
  
  const filter = filters[Math.floor(Math.random() * filters.length)];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?${filter}`,
    {
      tags: { name: 'Filter', operation: 'filter' },
    }
  );
  
  const success = check(response, {
    'filter status is 200': (r) => r.status === 200,
    'filter response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  errorRate.add(!success);
  apiDuration.add(response.timings.duration);
  requestCounter.add(1);
}

function performPagination(baseUrl) {
  const page = Math.floor(Math.random() * 10) + 1;
  const limit = [10, 20, 50][Math.floor(Math.random() * 3)];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?page=${page}&limit=${limit}`,
    {
      tags: { name: 'Pagination', operation: 'pagination' },
    }
  );
  
  const success = check(response, {
    'pagination status is 200': (r) => r.status === 200,
    'pagination has correct page': (r) => {
      const body = JSON.parse(r.body);
      return body.pagination && body.pagination.page === page;
    },
  });
  
  errorRate.add(!success);
  apiDuration.add(response.timings.duration);
  requestCounter.add(1);
}

function performComplexQuery(baseUrl) {
  const query = config.testData.searchQueries[
    Math.floor(Math.random() * config.testData.searchQueries.length)
  ];
  const creator = config.testData.creators[
    Math.floor(Math.random() * config.testData.creators.length)
  ];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?q=${query}&creator=${creator}&hasBurns=true&sortBy=burned&sortOrder=desc&page=1&limit=20`,
    {
      tags: { name: 'ComplexQuery', operation: 'complex' },
    }
  );
  
  const success = check(response, {
    'complex query status is 200': (r) => r.status === 200,
    'complex query response time < 2000ms': (r) => r.timings.duration < 2000,
  });
  
  errorRate.add(!success);
  apiDuration.add(response.timings.duration);
  requestCounter.add(1);
}

export function handleSummary(data) {
  return {
    'results/peak-load-summary.json': JSON.stringify(data, null, 2),
    stdout: generateTextSummary(data),
  };
}

function generateTextSummary(data) {
  let summary = '\n=== Peak Load Test Summary ===\n\n';
  
  if (data.metrics) {
    summary += 'Key Metrics:\n';
    
    if (data.metrics.http_req_duration) {
      summary += `  Response Time (p95): ${data.metrics.http_req_duration.values['p(95)']}ms\n`;
      summary += `  Response Time (p99): ${data.metrics.http_req_duration.values['p(99)']}ms\n`;
    }
    
    if (data.metrics.http_reqs) {
      summary += `  Total Requests: ${data.metrics.http_reqs.values.count}\n`;
      summary += `  Requests/sec: ${data.metrics.http_reqs.values.rate}\n`;
    }
    
    if (data.metrics.errors) {
      summary += `  Error Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%\n`;
    }
    
    if (data.metrics.cache_hits) {
      summary += `  Cache Hit Rate: ${(data.metrics.cache_hits.values.rate * 100).toFixed(2)}%\n`;
    }
  }
  
  return summary;
}
