import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { config } from '../config/test-config.js';

// Custom metrics for leaderboard performance
const errorRate = new Rate('leaderboard_errors');
const leaderboardDuration = new Trend('leaderboard_duration');
const leaderboardP95 = new Trend('leaderboard_p95');
const leaderboardP99 = new Trend('leaderboard_p99');
const requestCounter = new Counter('leaderboard_requests');
const activeUsers = new Gauge('active_users');
const cacheHitRate = new Rate('cache_hits');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 5 },    // Ramp up to 5 users
    { duration: '3m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 50 },   // Spike to 50 users
    { duration: '3m', target: 20 },   // Back down to 20 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    'leaderboard_duration': ['p(95)<800', 'p(99)<1500'],
    'leaderboard_errors': ['rate<0.05'],
    'leaderboard_requests': ['rate>10'],
    'cache_hits': ['rate>0.7'],
  },
  tags: {
    test_type: 'leaderboard_load',
  },
};

// Test data for leaderboard queries
const leaderboardQueries = [
  { limit: 10, offset: 0 },
  { limit: 20, offset: 0 },
  { limit: 50, offset: 0 },
  { limit: 10, offset: 10 },
  { limit: 20, offset: 20 },
  { limit: 10, offset: 100 },
];

const sortOptions = ['score', 'recent', 'trending'];
const timeRanges = ['24h', '7d', '30d', 'all'];

export default function () {
  const baseUrl = config.baseUrl;
  activeUsers.set(__VU);

  group('Leaderboard Query Performance', () => {
    // Test 1: Basic leaderboard fetch
    const query = leaderboardQueries[Math.floor(Math.random() * leaderboardQueries.length)];
    const sort = sortOptions[Math.floor(Math.random() * sortOptions.length)];
    const timeRange = timeRanges[Math.floor(Math.random() * timeRanges.length)];

    const leaderboardUrl = `${baseUrl}/api/leaderboard?limit=${query.limit}&offset=${query.offset}&sort=${sort}&timeRange=${timeRange}`;
    
    const leaderboardResponse = http.get(leaderboardUrl, {
      tags: { name: 'LeaderboardFetch' },
      headers: {
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'max-age=60',
      },
    });

    check(leaderboardResponse, {
      'leaderboard status is 200': (r) => r.status === 200,
      'leaderboard has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data && Array.isArray(body.data);
        } catch {
          return false;
        }
      },
      'leaderboard response time < 800ms': (r) => r.timings.duration < 800,
      'leaderboard response time < 1500ms': (r) => r.timings.duration < 1500,
      'leaderboard has pagination': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.pagination && body.pagination.total !== undefined;
        } catch {
          return false;
        }
      },
    });

    const isCacheHit = leaderboardResponse.headers['X-Cache'] === 'HIT';
    cacheHitRate.add(isCacheHit);
    errorRate.add(leaderboardResponse.status !== 200);
    leaderboardDuration.add(leaderboardResponse.timings.duration);
    leaderboardP95.add(leaderboardResponse.timings.duration);
    leaderboardP99.add(leaderboardResponse.timings.duration);
    requestCounter.add(1);

    sleep(0.5);
  });

  group('Leaderboard Filtering', () => {
    // Test 2: Leaderboard with filters
    const creator = config.testData.creators[Math.floor(Math.random() * config.testData.creators.length)];
    
    const filterUrl = `${baseUrl}/api/leaderboard?limit=20&creator=${creator}&minScore=100`;
    
    const filterResponse = http.get(filterUrl, {
      tags: { name: 'LeaderboardFilter' },
    });

    check(filterResponse, {
      'filter status is 200': (r) => r.status === 200,
      'filter has results': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data !== undefined;
        } catch {
          return false;
        }
      },
      'filter response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    errorRate.add(filterResponse.status !== 200);
    leaderboardDuration.add(filterResponse.timings.duration);
    requestCounter.add(1);

    sleep(0.5);
  });

  group('Leaderboard Ranking Consistency', () => {
    // Test 3: Verify ranking consistency across multiple requests
    const rankingUrl = `${baseUrl}/api/leaderboard?limit=5&sort=score`;
    
    const firstResponse = http.get(rankingUrl, {
      tags: { name: 'RankingCheck1' },
    });

    sleep(0.2);

    const secondResponse = http.get(rankingUrl, {
      tags: { name: 'RankingCheck2' },
    });

    check(firstResponse, {
      'first ranking request successful': (r) => r.status === 200,
    });

    check(secondResponse, {
      'second ranking request successful': (r) => r.status === 200,
      'rankings are consistent': (r) => {
        try {
          const first = JSON.parse(firstResponse.body);
          const second = JSON.parse(r.body);
          
          if (!first.data || !second.data || first.data.length !== second.data.length) {
            return false;
          }

          // Check if top entries match (allowing for minor score changes)
          for (let i = 0; i < Math.min(3, first.data.length); i++) {
            if (first.data[i].address !== second.data[i].address) {
              return false;
            }
          }
          return true;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(secondResponse.status !== 200);
    leaderboardDuration.add(secondResponse.timings.duration);
    requestCounter.add(1);

    sleep(0.5);
  });

  group('Leaderboard Pagination Stress', () => {
    // Test 4: Pagination under load
    const pageSize = 20;
    const maxPages = 5;
    const randomPage = Math.floor(Math.random() * maxPages);
    const offset = randomPage * pageSize;

    const paginationUrl = `${baseUrl}/api/leaderboard?limit=${pageSize}&offset=${offset}`;
    
    const paginationResponse = http.get(paginationUrl, {
      tags: { name: 'PaginationStress' },
    });

    check(paginationResponse, {
      'pagination status is 200': (r) => r.status === 200,
      'pagination has correct limit': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data && body.data.length <= pageSize;
        } catch {
          return false;
        }
      },
      'pagination response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    errorRate.add(paginationResponse.status !== 200);
    leaderboardDuration.add(paginationResponse.timings.duration);
    requestCounter.add(1);

    sleep(0.3);
  });

  group('Leaderboard Time Range Queries', () => {
    // Test 5: Different time range queries
    const timeRanges = ['24h', '7d', '30d'];
    const selectedRange = timeRanges[Math.floor(Math.random() * timeRanges.length)];

    const timeRangeUrl = `${baseUrl}/api/leaderboard?limit=20&timeRange=${selectedRange}&sort=trending`;
    
    const timeRangeResponse = http.get(timeRangeUrl, {
      tags: { name: 'TimeRangeQuery' },
    });

    check(timeRangeResponse, {
      'time range query successful': (r) => r.status === 200,
      'time range query response time < 1200ms': (r) => r.timings.duration < 1200,
      'time range query has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data && body.data.length > 0;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(timeRangeResponse.status !== 200);
    leaderboardDuration.add(timeRangeResponse.timings.duration);
    requestCounter.add(1);

    sleep(0.4);
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results.json': JSON.stringify(data),
  };
}
