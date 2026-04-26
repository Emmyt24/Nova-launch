import { describe, it, expect } from 'vitest';
import {
  pick,
  selectScenario,
  formatSummary,
  buildSummary,
  buildPrComment,
} from '../lib/ci-load-helpers.js';

// ── pick ──────────────────────────────────────────────────────────────────────

describe('pick', () => {
  it('returns an element from the array', () => {
    const arr = ['a', 'b', 'c'];
    expect(arr).toContain(pick(arr));
  });

  it('returns undefined for an empty array', () => {
    expect(pick([])).toBeUndefined();
  });

  it('returns undefined for null/undefined input', () => {
    expect(pick(null)).toBeUndefined();
    expect(pick(undefined)).toBeUndefined();
  });

  it('returns the only element for a single-element array', () => {
    expect(pick(['only'])).toBe('only');
  });

  it('distributes picks across all elements over many calls', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(pick(arr));
    expect(seen.size).toBe(arr.length);
  });
});

// ── selectScenario ────────────────────────────────────────────────────────────

describe('selectScenario', () => {
  it('returns token_search for roll < 0.50', () => {
    expect(selectScenario(0)).toBe('token_search');
    expect(selectScenario(0.25)).toBe('token_search');
    expect(selectScenario(0.499)).toBe('token_search');
  });

  it('returns health for roll in [0.50, 0.75)', () => {
    expect(selectScenario(0.50)).toBe('health');
    expect(selectScenario(0.62)).toBe('health');
    expect(selectScenario(0.749)).toBe('health');
  });

  it('returns leaderboard for roll in [0.75, 0.90)', () => {
    expect(selectScenario(0.75)).toBe('leaderboard');
    expect(selectScenario(0.82)).toBe('leaderboard');
    expect(selectScenario(0.899)).toBe('leaderboard');
  });

  it('returns stats for roll in [0.90, 1.00)', () => {
    expect(selectScenario(0.90)).toBe('stats');
    expect(selectScenario(0.95)).toBe('stats');
    expect(selectScenario(0.999)).toBe('stats');
  });

  it('covers the correct distribution over 10000 samples', () => {
    const counts = { token_search: 0, health: 0, leaderboard: 0, stats: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) counts[selectScenario(Math.random())]++;
    // token_search ≈ 50 % ± 2 %
    expect(counts.token_search / N).toBeGreaterThan(0.48);
    expect(counts.token_search / N).toBeLessThan(0.52);
    // health ≈ 25 % ± 2 %
    expect(counts.health / N).toBeGreaterThan(0.23);
    expect(counts.health / N).toBeLessThan(0.27);
    // leaderboard ≈ 15 % ± 2 %
    expect(counts.leaderboard / N).toBeGreaterThan(0.13);
    expect(counts.leaderboard / N).toBeLessThan(0.17);
    // stats ≈ 10 % ± 2 %
    expect(counts.stats / N).toBeGreaterThan(0.08);
    expect(counts.stats / N).toBeLessThan(0.12);
  });
});

// ── buildSummary ──────────────────────────────────────────────────────────────

describe('buildSummary', () => {
  const passingData = {
    metrics: {
      http_req_duration: {
        values: { 'p(95)': 120, 'p(99)': 250 },
        thresholds: { 'p(95)<1000': { ok: true }, 'p(99)<2000': { ok: true } },
      },
      http_req_failed: {
        values: { rate: 0.002 },
        thresholds: { 'rate<0.01': { ok: true } },
      },
      ci_errors: { values: { rate: 0.001 }, thresholds: { 'rate<0.01': { ok: true } } },
      ci_total_requests: { values: { count: 600 } },
    },
  };

  it('sets passed=true when all thresholds pass', () => {
    expect(buildSummary(passingData, 10, 60).passed).toBe(true);
  });

  it('sets passed=false when any threshold fails', () => {
    const failing = JSON.parse(JSON.stringify(passingData));
    failing.metrics.http_req_duration.thresholds['p(95)<1000'].ok = false;
    expect(buildSummary(failing, 10, 60).passed).toBe(false);
  });

  it('includes vus and duration', () => {
    const s = buildSummary(passingData, 20, 120);
    expect(s.vus).toBe(20);
    expect(s.duration).toBe(120);
  });

  it('extracts p95 and p99 latency', () => {
    const s = buildSummary(passingData, 10, 60);
    expect(s.metrics.http_req_duration_p95).toBe(120);
    expect(s.metrics.http_req_duration_p99).toBe(250);
  });

  it('extracts error rates', () => {
    const s = buildSummary(passingData, 10, 60);
    expect(s.metrics.http_req_failed_rate).toBe(0.002);
    expect(s.metrics.ci_errors_rate).toBe(0.001);
  });

  it('extracts total request count', () => {
    const s = buildSummary(passingData, 10, 60);
    expect(s.metrics.ci_total_requests).toBe(600);
  });

  it('handles empty metrics gracefully', () => {
    const s = buildSummary({ metrics: {} }, 5, 30);
    expect(s.passed).toBe(true);
    expect(s.metrics.http_req_duration_p95).toBeUndefined();
  });

  it('includes a timestamp string', () => {
    const s = buildSummary(passingData, 10, 60);
    expect(s.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── formatSummary ─────────────────────────────────────────────────────────────

describe('formatSummary', () => {
  const summary = {
    passed: true,
    timestamp: '2026-01-01T00:00:00.000Z',
    vus: 10,
    duration: 60,
    metrics: {
      http_req_duration_p95: 120.5,
      http_req_duration_p99: 250.3,
      http_req_failed_rate: 0.002,
      ci_errors_rate: 0.001,
      ci_total_requests: 600,
    },
  };

  it('contains PASSED for a passing summary', () => {
    expect(formatSummary(summary)).toContain('✅ PASSED');
  });

  it('contains FAILED for a failing summary', () => {
    expect(formatSummary({ ...summary, passed: false })).toContain('❌ FAILED');
  });

  it('includes p95 latency', () => {
    expect(formatSummary(summary)).toContain('120.5');
  });

  it('includes p99 latency', () => {
    expect(formatSummary(summary)).toContain('250.3');
  });

  it('includes error rate as percentage', () => {
    expect(formatSummary(summary)).toContain('0.20');
  });

  it('includes total request count', () => {
    expect(formatSummary(summary)).toContain('600');
  });

  it('shows n/a when metrics are undefined', () => {
    const s = { ...summary, metrics: {} };
    expect(formatSummary(s)).toContain('n/a');
  });
});

// ── buildPrComment ────────────────────────────────────────────────────────────

describe('buildPrComment', () => {
  const summary = {
    passed: true,
    vus: 10,
    duration: 60,
    metrics: {
      http_req_duration_p95: 120.5,
      http_req_duration_p99: 250.3,
      http_req_failed_rate: 0.002,
      ci_total_requests: 600,
    },
  };

  it('contains PASSED status', () => {
    expect(buildPrComment(summary)).toContain('✅ PASSED');
  });

  it('contains FAILED status for failing summary', () => {
    expect(buildPrComment({ ...summary, passed: false })).toContain('❌ FAILED');
  });

  it('includes p95 latency in table', () => {
    expect(buildPrComment(summary)).toContain('120.5');
  });

  it('includes total requests in table', () => {
    expect(buildPrComment(summary)).toContain('600');
  });

  it('includes threshold description', () => {
    expect(buildPrComment(summary)).toContain('p95 < 1000 ms');
  });

  it('shows n/a when metrics are undefined', () => {
    const s = { ...summary, metrics: {} };
    expect(buildPrComment(s)).toContain('n/a');
  });

  it('is valid Markdown (contains table header)', () => {
    expect(buildPrComment(summary)).toContain('| Metric | Value |');
  });
});
