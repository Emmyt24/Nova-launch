/**
 * CI Load Test — load-tests/scenarios/ci-load.js
 *
 * Designed to run in CI pipelines where:
 *   - No real backend is available (uses BASE_URL env var, defaults to mock)
 *   - Duration must be short (< 3 minutes total)
 *   - Thresholds must be strict enough to catch regressions
 *   - Results are written to load-tests/results/ for artifact upload
 *
 * Scenario mix (mirrors production traffic distribution):
 *   50% — token search / list  (read-heavy, cacheable)
 *   25% — health / version     (lightweight liveness probes)
 *   15% — leaderboard          (aggregation queries)
 *   10% — stats                (heavier aggregation)
 *
 * Environment variables:
 *   BASE_URL          API base URL (default: http://localhost:3001)
 *   CI_VUS            Virtual users during steady state (default: 10)
 *   CI_DURATION       Steady-state duration in seconds (default: 60)
 *   FAIL_ON_THRESHOLD Set to "false" to collect data without failing CI
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config } from '../config/test-config.js';

// ── Custom metrics ────────────────────────────────────────────────────────────

const errorRate = new Rate('ci_errors');
const p95Duration = new Trend('ci_p95_duration');
const requestCounter = new Counter('ci_total_requests');

// ── Options ───────────────────────────────────────────────────────────────────

const VUS = parseInt(__ENV.CI_VUS || '10');
const DURATION = parseInt(__ENV.CI_DURATION || '60');

export const options = {
  stages: [
    { duration: '30s', target: VUS },          // ramp-up
    { duration: `${DURATION}s`, target: VUS }, // steady state
    { duration: '30s', target: 0 },            // ramp-down
  ],
  thresholds: {
    // Error rate must stay below 1 %
    http_req_failed: ['rate<0.01'],
    ci_errors: ['rate<0.01'],
    // p95 latency under 500 ms for search, 1 s overall
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    ci_p95_duration: ['p(95)<500'],
  },
  tags: { test_type: 'ci_load' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || config.baseUrl;

/** Pick a random element from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Record a response: check status, update metrics. */
function record(res, name, maxMs = 500) {
  const ok = check(res, {
    [`${name} status 200`]: (r) => r.status === 200,
    [`${name} < ${maxMs}ms`]: (r) => r.timings.duration < maxMs,
  });
  errorRate.add(!ok);
  p95Duration.add(res.timings.duration);
  requestCounter.add(1);
  return ok;
}

// ── Default function (VU loop) ────────────────────────────────────────────────

export default function () {
  const roll = Math.random();

  if (roll < 0.50) {
    // 50 % — token search
    group('token_search', () => {
      const q = pick(config.testData.searchQueries);
      const res = http.get(`${BASE_URL}/api/tokens/search?q=${q}&page=1&limit=20`, {
        tags: { name: 'TokenSearch' },
      });
      record(res, 'token_search', 500);
    });
  } else if (roll < 0.75) {
    // 25 % — health probe
    group('health', () => {
      const res = http.get(`${BASE_URL}/health`, { tags: { name: 'Health' } });
      record(res, 'health', 200);
    });
  } else if (roll < 0.90) {
    // 15 % — leaderboard
    group('leaderboard', () => {
      const res = http.get(`${BASE_URL}/api/leaderboard?limit=10`, {
        tags: { name: 'Leaderboard' },
      });
      record(res, 'leaderboard', 800);
    });
  } else {
    // 10 % — stats
    group('stats', () => {
      const res = http.get(`${BASE_URL}/api/stats`, { tags: { name: 'Stats' } });
      record(res, 'stats', 1000);
    });
  }

  sleep(1);
}

// ── Summary ───────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const passed = !Object.values(data.metrics).some(
    (m) => m.thresholds && Object.values(m.thresholds).some((t) => t.ok === false)
  );

  const summary = {
    passed,
    timestamp: new Date().toISOString(),
    vus: VUS,
    duration: DURATION,
    metrics: {
      http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'],
      http_req_duration_p99: data.metrics.http_req_duration?.values?.['p(99)'],
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate,
      ci_errors_rate: data.metrics.ci_errors?.values?.rate,
      ci_total_requests: data.metrics.ci_total_requests?.values?.count,
    },
    thresholds: Object.fromEntries(
      Object.entries(data.metrics)
        .filter(([, m]) => m.thresholds)
        .map(([name, m]) => [name, m.thresholds])
    ),
  };

  return {
    'load-tests/results/ci-load-summary.json': JSON.stringify(summary, null, 2),
    stdout: formatSummary(summary),
  };
}

function formatSummary(s) {
  const status = s.passed ? '✅ PASSED' : '❌ FAILED';
  const m = s.metrics;
  return [
    '',
    `=== CI Load Test Summary — ${status} ===`,
    `  Timestamp : ${s.timestamp}`,
    `  VUs       : ${s.vus}`,
    `  Duration  : ${s.duration}s steady state`,
    '',
    '  Latency:',
    `    p95 : ${m.http_req_duration_p95?.toFixed(1) ?? 'n/a'} ms`,
    `    p99 : ${m.http_req_duration_p99?.toFixed(1) ?? 'n/a'} ms`,
    '',
    '  Reliability:',
    `    HTTP error rate : ${((m.http_req_failed_rate ?? 0) * 100).toFixed(2)} %`,
    `    CI error rate   : ${((m.ci_errors_rate ?? 0) * 100).toFixed(2)} %`,
    '',
    `  Total requests : ${m.ci_total_requests ?? 0}`,
    '',
  ].join('\n');
}
