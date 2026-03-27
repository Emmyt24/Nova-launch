import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { config } from '../config/test-config.js';

// Metrics specific to search functionality
const searchErrorRate = new Rate('search_errors');
const searchDuration = new Trend('search_duration');
const cacheHitRate = new Rate('cache_hits');
const complexQueryDuration = new Trend('complex_query_duration');

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '5m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    search_duration: ['p(95)<500', 'p(99)<1000'],
    complex_query_duration: ['p(95)<1500', 'p(99)<2500'],
    search_errors: ['rate<0.01'],
    cache_hits: ['rate>0.3'], // Expect 30%+ cache hits
  },
};

export default function () {
  const baseUrl = config.baseUrl;
  
  // Test 1: Simple search (should be cached)
  testSimpleSearch(baseUrl);
  sleep(0.5);
  
  // Test 2: Wildcard search
  testWildcardSearch(baseUrl);
  sleep(0.5);
  
  // Test 3: Filter combinations
  testFilterCombinations(baseUrl);
  sleep(0.5);
  
  // Test 4: Sorting variations
  testSortingVariations(baseUrl);
  sleep(0.5);
  
  // Test 5: Pagination stress
  testPaginationStress(baseUrl);
  sleep(1);
}

function testSimpleSearch(baseUrl) {
  const query = 'token'; // Common query
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?q=${query}`,
    { tags: { name: 'SimpleSearch' } }
  );
  
  const success = check(response, {
    'simple search status 200': (r) => r.status === 200,
    'simple search has results': (r) => JSON.parse(r.body).data.length >= 0,
    'simple search fast': (r) => r.timings.duration < 500,
  });
  
  searchErrorRate.add(!success);
  searchDuration.add(response.timings.duration);
  cacheHitRate.add(response.timings.duration < 100);
}

function testWildcardSearch(baseUrl) {
  const queries = ['tok', 'ste', 'coi', 'cry'];
  const query = queries[Math.floor(Math.random() * queries.length)];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?q=${query}`,
    { tags: { name: 'WildcardSearch' } }
  );
  
  const success = check(response, {
    'wildcard search status 200': (r) => r.status === 200,
  });
  
  searchErrorRate.add(!success);
  searchDuration.add(response.timings.duration);
}

function testFilterCombinations(baseUrl) {
  const filters = [
    'hasBurns=true',
    'hasBurns=false',
    `creator=${config.testData.creators[0]}`,
    'minSupply=1000&maxSupply=100000',
    'sortBy=burned&sortOrder=desc',
    'sortBy=supply&sortOrder=asc',
  ];
  
  const filter1 = filters[Math.floor(Math.random() * filters.length)];
  const filter2 = filters[Math.floor(Math.random() * filters.length)];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?${filter1}&${filter2}`,
    { tags: { name: 'FilterCombination' } }
  );
  
  const success = check(response, {
    'filter combination status 200': (r) => r.status === 200,
    'filter combination response time ok': (r) => r.timings.duration < 1500,
  });
  
  searchErrorRate.add(!success);
  complexQueryDuration.add(response.timings.duration);
}

function testSortingVariations(baseUrl) {
  const sortOptions = [
    'sortBy=created&sortOrder=desc',
    'sortBy=created&sortOrder=asc',
    'sortBy=burned&sortOrder=desc',
    'sortBy=supply&sortOrder=desc',
    'sortBy=name&sortOrder=asc',
  ];
  
  const sort = sortOptions[Math.floor(Math.random() * sortOptions.length)];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?${sort}&limit=20`,
    { tags: { name: 'SortingVariation' } }
  );
  
  const success = check(response, {
    'sorting status 200': (r) => r.status === 200,
    'sorting response time ok': (r) => r.timings.duration < 800,
  });
  
  searchErrorRate.add(!success);
  searchDuration.add(response.timings.duration);
}

function testPaginationStress(baseUrl) {
  const page = Math.floor(Math.random() * 20) + 1;
  const limits = [10, 20, 50];
  const limit = limits[Math.floor(Math.random() * limits.length)];
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?page=${page}&limit=${limit}`,
    { tags: { name: 'PaginationStress' } }
  );
  
  const success = check(response, {
    'pagination status 200': (r) => r.status === 200,
    'pagination correct page': (r) => {
      const body = JSON.parse(r.body);
      return body.pagination && body.pagination.page === page;
    },
    'pagination correct limit': (r) => {
      const body = JSON.parse(r.body);
      return body.data.length <= limit;
    },
  });
  
  searchErrorRate.add(!success);
  searchDuration.add(response.timings.duration);
}

export function handleSummary(data) {
  return {
    'results/search-load-summary.json': JSON.stringify(data, null, 2),
    stdout: generateSearchSummary(data),
  };
}

function generateSearchSummary(data) {
  let summary = '\n=== Search Load Test Summary ===\n\n';
  
  if (data.metrics) {
    if (data.metrics.search_duration) {
      summary += 'Search Performance:\n';
      summary += `  Average: ${data.metrics.search_duration.values.avg.toFixed(2)}ms\n`;
      summary += `  p95: ${data.metrics.search_duration.values['p(95)'].toFixed(2)}ms\n`;
      summary += `  p99: ${data.metrics.search_duration.values['p(99)'].toFixed(2)}ms\n\n`;
    }
    
    if (data.metrics.complex_query_duration) {
      summary += 'Complex Query Performance:\n';
      summary += `  Average: ${data.metrics.complex_query_duration.values.avg.toFixed(2)}ms\n`;
      summary += `  p95: ${data.metrics.complex_query_duration.values['p(95)'].toFixed(2)}ms\n\n`;
    }
    
    if (data.metrics.cache_hits) {
      const cacheRate = (data.metrics.cache_hits.values.rate * 100).toFixed(2);
      summary += `Cache Hit Rate: ${cacheRate}%\n\n`;
    }
    
    if (data.metrics.search_errors) {
      const errorRate = (data.metrics.search_errors.values.rate * 100).toFixed(2);
      summary += `Error Rate: ${errorRate}%\n`;
    }
  }
  
  return summary;
}
