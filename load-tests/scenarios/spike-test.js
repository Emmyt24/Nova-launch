import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config } from '../config/test-config.js';

// Custom metrics
const errorRate = new Rate('errors');
const recoveryTime = new Trend('recovery_time');
const spikeResponseTime = new Trend('spike_response_time');
const requestCounter = new Counter('total_requests');

// Spike test configuration - sudden traffic increase
export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Normal load
    { duration: '10s', target: 100 }, // Sudden spike!
    { duration: '3m', target: 100 },  // Sustained spike
    { duration: '10s', target: 10 },  // Drop back
    { duration: '2m', target: 10 },   // Recovery period
    { duration: '10s', target: 150 }, // Second spike!
    { duration: '2m', target: 150 },  // Sustained second spike
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.15'],
    errors: ['rate<0.15'],
  },
  tags: {
    test_type: 'spike_test',
  },
};

let spikeStartTime = null;
let recoveryStartTime = null;

export default function () {
  const baseUrl = config.baseUrl;
  const currentVUs = __VU;
  
  // Detect spike (when VUs suddenly increase)
  if (currentVUs > 50 && spikeStartTime === null) {
    spikeStartTime = Date.now();
    console.log(`Spike detected at VU count: ${currentVUs}`);
  }
  
  // Detect recovery (when VUs drop back)
  if (currentVUs < 20 && spikeStartTime !== null && recoveryStartTime === null) {
    recoveryStartTime = Date.now();
    const recovery = recoveryStartTime - spikeStartTime;
    recoveryTime.add(recovery);
    console.log(`Recovery period started. Spike duration: ${recovery}ms`);
  }
  
  // Mixed operations during spike
  const operations = [
    () => performQuickSearch(baseUrl),
    () => performHeavyQuery(baseUrl),
    () => performPagination(baseUrl),
    () => performCachedQuery(baseUrl),
  ];
  
  const operation = operations[Math.floor(Math.random() * operations.length)];
  operation();
  
  // Minimal sleep during spike
  sleep(Math.random() * 0.3);
}

function performQuickSearch(baseUrl) {
  const query = config.testData.searchQueries[0]; // Use same query for cache
  
  const startTime = Date.now();
  const response = http.get(
    `${baseUrl}/api/tokens/search?q=${query}`,
    {
      tags: { name: 'SpikeQuickSearch', spike_phase: getSpikePhase() },
      timeout: '5s',
    }
  );
  const duration = Date.now() - startTime;
  
  const success = check(response, {
    'quick search status is 200': (r) => r.status === 200,
    'quick search response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  errorRate.add(!success);
  spikeResponseTime.add(duration);
  requestCounter.add(1);
  
  if (!success) {
    console.log(`Quick search failed during ${getSpikePhase()}: ${response.status}`);
  }
}

function performHeavyQuery(baseUrl) {
  const query = config.testData.searchQueries[
    Math.floor(Math.random() * config.testData.searchQueries.length)
  ];
  const creator = config.testData.creators[
    Math.floor(Math.random() * config.testData.creators.length)
  ];
  
  const startTime = Date.now();
  const response = http.get(
    `${baseUrl}/api/tokens/search?q=${query}&creator=${creator}&hasBurns=true&minSupply=1000&maxSupply=1000000&sortBy=burned&sortOrder=desc&page=1&limit=50`,
    {
      tags: { name: 'SpikeHeavyQuery', spike_phase: getSpikePhase() },
      timeout: '10s',
    }
  );
  const duration = Date.now() - startTime;
  
  const success = check(response, {
    'heavy query status is 200': (r) => r.status === 200,
    'heavy query response time < 3000ms': (r) => r.timings.duration < 3000,
  });
  
  errorRate.add(!success);
  spikeResponseTime.add(duration);
  requestCounter.add(1);
}

function performPagination(baseUrl) {
  const page = Math.floor(Math.random() * 10) + 1;
  
  const response = http.get(
    `${baseUrl}/api/tokens/search?page=${page}&limit=20`,
    {
      tags: { name: 'SpikePagination', spike_phase: getSpikePhase() },
      timeout: '5s',
    }
  );
  
  const success = check(response, {
    'pagination status is 200': (r) => r.status === 200,
  });
  
  errorRate.add(!success);
  requestCounter.add(1);
}

function performCachedQuery(baseUrl) {
  // Intentionally use same parameters to test cache
  const response = http.get(
    `${baseUrl}/api/tokens/search?sortBy=created&sortOrder=desc&page=1&limit=20`,
    {
      tags: { name: 'SpikeCachedQuery', spike_phase: getSpikePhase() },
      timeout: '5s',
    }
  );
  
  const success = check(response, {
    'cached query status is 200': (r) => r.status === 200,
    'cached query is fast': (r) => r.timings.duration < 200, // Should be cached
  });
  
  errorRate.add(!success);
  requestCounter.add(1);
}

function getSpikePhase() {
  const currentVUs = __VU;
  if (currentVUs > 80) {
    return 'spike';
  } else if (currentVUs > 50) {
    return 'elevated';
  } else if (currentVUs > 20) {
    return 'normal';
  } else {
    return 'recovery';
  }
}

export function handleSummary(data) {
  const summary = generateSpikeSummary(data);
  
  return {
    'results/spike-test-summary.json': JSON.stringify(data, null, 2),
    'results/spike-test-report.txt': summary,
    stdout: summary,
  };
}

function generateSpikeSummary(data) {
  let summary = '\n' + '='.repeat(60) + '\n';
  summary += '           SPIKE TEST RESULTS\n';
  summary += '='.repeat(60) + '\n\n';
  
  summary += 'TEST SCENARIO:\n';
  summary += '  - Sudden increase from 10 to 100 users\n';
  summary += '  - Second spike to 150 users\n';
  summary += '  - Testing system recovery and auto-scaling\n\n';
  
  if (data.metrics) {
    summary += 'SPIKE PERFORMANCE:\n';
    summary += '-'.repeat(60) + '\n';
    
    if (data.metrics.spike_response_time) {
      const spike = data.metrics.spike_response_time.values;
      summary += `  Average Response Time: ${spike.avg.toFixed(2)}ms\n`;
      summary += `  95th Percentile:       ${spike['p(95)'].toFixed(2)}ms\n`;
      summary += `  99th Percentile:       ${spike['p(99)'].toFixed(2)}ms\n`;
      summary += `  Max Response Time:     ${spike.max.toFixed(2)}ms\n`;
    }
    
    summary += '\nSYSTEM RESILIENCE:\n';
    summary += '-'.repeat(60) + '\n';
    
    if (data.metrics.errors) {
      const errorPct = (data.metrics.errors.values.rate * 100).toFixed(2);
      summary += `  Error Rate:            ${errorPct}%\n`;
      
      if (parseFloat(errorPct) < 5) {
        summary += '  ✓ System handled spike well\n';
      } else if (parseFloat(errorPct) < 15) {
        summary += '  ⚠️  System struggled during spike\n';
      } else {
        summary += '  ❌ System failed to handle spike\n';
      }
    }
    
    if (data.metrics.recovery_time && data.metrics.recovery_time.values.count > 0) {
      const recovery = data.metrics.recovery_time.values.avg;
      summary += `  Recovery Time:         ${(recovery / 1000).toFixed(2)}s\n`;
    }
    
    summary += '\nTHROUGHPUT:\n';
    summary += '-'.repeat(60) + '\n';
    
    if (data.metrics.http_reqs) {
      const reqs = data.metrics.http_reqs.values;
      summary += `  Total Requests:        ${reqs.count}\n`;
      summary += `  Peak Requests/sec:     ${reqs.rate.toFixed(2)}\n`;
    }
  }
  
  summary += '\n' + '='.repeat(60) + '\n';
  summary += 'RECOMMENDATIONS:\n';
  summary += '='.repeat(60) + '\n';
  
  if (data.metrics && data.metrics.errors) {
    const errorRate = data.metrics.errors.values.rate;
    if (errorRate > 0.15) {
      summary += '  - Implement auto-scaling\n';
      summary += '  - Increase cache TTL\n';
      summary += '  - Add rate limiting\n';
      summary += '  - Consider CDN for static content\n';
    } else if (errorRate > 0.05) {
      summary += '  - Monitor cache hit rate\n';
      summary += '  - Consider connection pooling\n';
      summary += '  - Review database indexes\n';
    } else {
      summary += '  - System is well-configured for spikes\n';
      summary += '  - Continue monitoring in production\n';
    }
  }
  
  summary += '\n';
  return summary;
}
