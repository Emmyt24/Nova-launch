import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config } from '../config/test-config.js';

// Custom metrics
const errorRate = new Rate('errors');
const searchDuration = new Trend('search_duration');
const tokenListDuration = new Trend('token_list_duration');
const requestCounter = new Counter('total_requests');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '10m', target: 10 }, // Stay at 10 users for 10 minutes
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: config.thresholds.normal,
  tags: {
    test_type: 'normal_load',
  },
};

export default function () {
  const baseUrl = config.baseUrl;
  
  // Test 1: Token Search
  const searchQuery = config.testData.searchQueries[
    Math.floor(Math.random() * config.testData.searchQueries.length)
  ];
  
  const searchResponse = http.get(
    `${baseUrl}/api/tokens/search?q=${searchQuery}&page=1&limit=20`,
    {
      tags: { name: 'TokenSearch' },
    }
  );
  
  check(searchResponse, {
    'search status is 200': (r) => r.status === 200,
    'search has data': (r) => JSON.parse(r.body).data !== undefined,
    'search response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(searchResponse.status !== 200);
  searchDuration.add(searchResponse.timings.duration);
  requestCounter.add(1);
  
  sleep(1);
  
  // Test 2: Token List with Filters
  const creator = config.testData.creators[
    Math.floor(Math.random() * config.testData.creators.length)
  ];
  
  const filterResponse = http.get(
    `${baseUrl}/api/tokens/search?creator=${creator}&sortBy=created&sortOrder=desc`,
    {
      tags: { name: 'TokenFilter' },
    }
  );
  
  check(filterResponse, {
    'filter status is 200': (r) => r.status === 200,
    'filter response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(filterResponse.status !== 200);
  tokenListDuration.add(filterResponse.timings.duration);
  requestCounter.add(1);
  
  sleep(1);
  
  // Test 3: Pagination
  const page = Math.floor(Math.random() * 5) + 1;
  const paginationResponse = http.get(
    `${baseUrl}/api/tokens/search?page=${page}&limit=20&sortBy=created`,
    {
      tags: { name: 'TokenPagination' },
    }
  );
  
  check(paginationResponse, {
    'pagination status is 200': (r) => r.status === 200,
    'pagination has correct structure': (r) => {
      const body = JSON.parse(r.body);
      return body.pagination && body.data;
    },
  });
  
  errorRate.add(paginationResponse.status !== 200);
  requestCounter.add(1);
  
  sleep(2);
  
  // Test 4: Complex Query
  const complexResponse = http.get(
    `${baseUrl}/api/tokens/search?q=${searchQuery}&hasBurns=true&sortBy=burned&sortOrder=desc&page=1&limit=10`,
    {
      tags: { name: 'ComplexQuery' },
    }
  );
  
  check(complexResponse, {
    'complex query status is 200': (r) => r.status === 200,
    'complex query response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  errorRate.add(complexResponse.status !== 200);
  requestCounter.add(1);
  
  sleep(1);
}

export function handleSummary(data) {
  return {
    'results/normal-load-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = '\n' + indent + '=== Normal Load Test Summary ===\n\n';
  
  // Metrics
  if (data.metrics) {
    summary += indent + 'Metrics:\n';
    for (const [name, metric] of Object.entries(data.metrics)) {
      if (metric.values) {
        summary += indent + `  ${name}:\n`;
        for (const [key, value] of Object.entries(metric.values)) {
          summary += indent + `    ${key}: ${value}\n`;
        }
      }
    }
  }
  
  return summary;
}
