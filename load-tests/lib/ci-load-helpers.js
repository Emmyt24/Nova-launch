/**
 * Pure helper functions extracted from ci-load.js for unit testing.
 *
 * k6 scripts import k6-specific modules (k6/http, k6/metrics) that are not
 * available in Node.js.  This module contains only the logic that can be
 * tested without a k6 runtime.
 */

/**
 * Pick a random element from an array.
 * @param {Array} arr
 * @returns {*}
 */
export function pick(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Determine which scenario group a VU should execute based on a [0,1) roll.
 *
 * Distribution:
 *   [0.00, 0.50) → token_search
 *   [0.50, 0.75) → health
 *   [0.75, 0.90) → leaderboard
 *   [0.90, 1.00) → stats
 *
 * @param {number} roll  Random value in [0, 1)
 * @returns {'token_search'|'health'|'leaderboard'|'stats'}
 */
export function selectScenario(roll) {
  if (roll < 0.50) return 'token_search';
  if (roll < 0.75) return 'health';
  if (roll < 0.90) return 'leaderboard';
  return 'stats';
}

/**
 * Format the load test summary for stdout.
 *
 * @param {{ passed: boolean, timestamp: string, vus: number, duration: number,
 *           metrics: object }} s
 * @returns {string}
 */
export function formatSummary(s) {
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

/**
 * Build the summary object written to ci-load-summary.json.
 *
 * @param {object} k6Data  k6 handleSummary data object
 * @param {number} vus
 * @param {number} duration
 * @returns {object}
 */
export function buildSummary(k6Data, vus, duration) {
  const passed = !Object.values(k6Data.metrics ?? {}).some(
    (m) => m.thresholds && Object.values(m.thresholds).some((t) => t.ok === false)
  );

  return {
    passed,
    timestamp: new Date().toISOString(),
    vus,
    duration,
    metrics: {
      http_req_duration_p95: k6Data.metrics?.http_req_duration?.values?.['p(95)'],
      http_req_duration_p99: k6Data.metrics?.http_req_duration?.values?.['p(99)'],
      http_req_failed_rate: k6Data.metrics?.http_req_failed?.values?.rate,
      ci_errors_rate: k6Data.metrics?.ci_errors?.values?.rate,
      ci_total_requests: k6Data.metrics?.ci_total_requests?.values?.count,
    },
    thresholds: Object.fromEntries(
      Object.entries(k6Data.metrics ?? {})
        .filter(([, m]) => m.thresholds)
        .map(([name, m]) => [name, m.thresholds])
    ),
  };
}

/**
 * Build the Markdown comment body for a PR.
 *
 * @param {object} summary  Output of buildSummary()
 * @returns {string}
 */
export function buildPrComment(summary) {
  const m = summary.metrics;
  const status = summary.passed ? '✅ PASSED' : '❌ FAILED';
  return [
    `## 🔥 Load Test Results — ${status}`,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| p95 latency | ${m.http_req_duration_p95?.toFixed(1) ?? 'n/a'} ms |`,
    `| p99 latency | ${m.http_req_duration_p99?.toFixed(1) ?? 'n/a'} ms |`,
    `| HTTP error rate | ${((m.http_req_failed_rate ?? 0) * 100).toFixed(2)} % |`,
    `| Total requests | ${m.ci_total_requests ?? 0} |`,
    `| VUs | ${summary.vus} |`,
    `| Duration | ${summary.duration}s |`,
    '',
    `> Thresholds: p95 < 1000 ms · p99 < 2000 ms · error rate < 1 %`,
  ].join('\n');
}
