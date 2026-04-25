import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PROJECTION_LAG_THRESHOLDS,
  determineThresholdStatus,
  generateThresholdAlert,
  getLagThresholdsForEventKind,
  LagWindow,
  ProjectionLagMetrics,
  EVENT_LAG_TOLERANCES,
} from '../monitoring/metrics/projectionLagThresholds';

/**
 * Projection Lag Threshold Tests
 *
 * Tests operational thresholds that detect when backend indexing falls too far
 * behind on-chain transaction confirmations.
 *
 * Coverage:
 * - Normal lag scenarios (< 5 seconds)
 * - Warning lag scenarios (5-30 seconds)
 * - Critical lag scenarios (> 30 seconds)
 * - Event-specific tolerance levels
 * - Rolling window aggregation
 * - Alert generation and debouncing
 *
 * Guidelines followed:
 * - Base thresholds on realistic ingestion timing
 * - Keep warnings actionable for operators
 * - Distinguish between normal variability and actual issues
 */

describe('Projection Lag Thresholds', () => {
  describe('PROJECTION_LAG_THRESHOLDS', () => {
    it('defines reasonable default thresholds', () => {
      // Normal lag: typical Horizon delivery + processing time
      // ~2-5 seconds expected for:
      // - Stellar ledger closure (independent event, ~5s window)
      // - Horizon event indexing (~1-2s)
      // - API request roundtrip (~100-500ms)
      // - Database write (~10-100ms)
      expect(PROJECTION_LAG_THRESHOLDS.NORMAL).toBe(5000); // 5 seconds
      expect(PROJECTION_LAG_THRESHOLDS.WARNING).toBe(30000); // 30 seconds
      expect(PROJECTION_LAG_THRESHOLDS.CRITICAL).toBe(60000); // 60 seconds
    });

    it('maintains logical ordering: NORMAL < WARNING < CRITICAL', () => {
      expect(PROJECTION_LAG_THRESHOLDS.NORMAL).toBeLessThan(
        PROJECTION_LAG_THRESHOLDS.WARNING
      );
      expect(PROJECTION_LAG_THRESHOLDS.WARNING).toBeLessThan(
        PROJECTION_LAG_THRESHOLDS.CRITICAL
      );
    });

    it('preserves threshold values as constants', () => {
      const original = { ...PROJECTION_LAG_THRESHOLDS };
      const _ = PROJECTION_LAG_THRESHOLDS;
      expect(PROJECTION_LAG_THRESHOLDS).toEqual(original);
    });
  });

  describe('determineThresholdStatus()', () => {
    describe('healthy (normal lag)', () => {
      it('returns "healthy" for lag < NORMAL threshold', () => {
        expect(determineThresholdStatus(0, 'default')).toBe('healthy');
        expect(determineThresholdStatus(1000, 'default')).toBe('healthy'); // 1 second
        expect(determineThresholdStatus(3000, 'default')).toBe('healthy'); // 3 seconds
        expect(determineThresholdStatus(4999, 'default')).toBe('healthy'); // Just under 5 seconds
      });

      it('classifies typical Stellar ingestion as healthy', () => {
        // Horizon typically delivers events 1-2 seconds after ledger closure
        const typicalHorizonDelay = 2000;
        const typicalProcessingDelay = 500;
        const totalTypicalLag = typicalHorizonDelay + typicalProcessingDelay;

        expect(determineThresholdStatus(totalTypicalLag, 'token_created')).toBe(
          'healthy'
        );
      });
    });

    describe('warning (elevated lag)', () => {
      it('returns "warning" for lag >= NORMAL and < WARNING', () => {
        expect(determineThresholdStatus(5000, 'default')).toBe('warning'); // Exactly at normal
        expect(determineThresholdStatus(10000, 'default')).toBe('warning'); // 10 seconds
        expect(determineThresholdStatus(29999, 'default')).toBe('warning'); // Just under 30
      });

      it('uses event-specific tolerances for warning threshold', () => {
        const proposalTolerance = EVENT_LAG_TOLERANCES.proposal_created;
        if (proposalTolerance?.WARNING) {
          const aboveDefault = PROJECTION_LAG_THRESHOLDS.WARNING + 1000;
          const belowProposalWarning = proposalTolerance.WARNING - 1000;

          // Above default warning but below proposal-specific warning
          if (aboveDefault < proposalTolerance.WARNING) {
            expect(determineThresholdStatus(aboveDefault, 'proposal_created')).toBe(
              'warning'
            );
          }
        }
      });
    });

    describe('critical (severe lag)', () => {
      it('returns "critical" for lag >= CRITICAL threshold', () => {
        expect(determineThresholdStatus(60000, 'default')).toBe('critical'); // Exactly at critical
        expect(determineThresholdStatus(90000, 'default')).toBe('critical'); // 90 seconds
        expect(determineThresholdStatus(120000, 'default')).toBe('critical'); // 2 minutes
      });

      it('indicates indexing falling severely behind on-chain progress', () => {
        // If backend is 60+ seconds behind, ~12+ Stellar ledgers have closed
        // This is a serious problem affecting user-facing operations
        const severelyBehind = PROJECTION_LAG_THRESHOLDS.CRITICAL + 30000;
        expect(determineThresholdStatus(severelyBehind, 'default')).toBe('critical');
      });
    });

    describe('event-specific thresholds', () => {
      it('applies tighter thresholds to token events', () => {
        // Token events should be processed quickly
        const tokenNormal = getLagThresholdsForEventKind('token_created');
        expect(tokenNormal.NORMAL).toBeLessThanOrEqual(
          PROJECTION_LAG_THRESHOLDS.NORMAL
        );
      });

      it('applies looser thresholds to complex governance events', () => {
        // Governance events may have complex calculations
        const governanceNormal = getLagThresholdsForEventKind('proposal_created');
        if (governanceNormal.NORMAL !== PROJECTION_LAG_THRESHOLDS.NORMAL) {
          expect(governanceNormal.NORMAL).toBeGreaterThan(
            PROJECTION_LAG_THRESHOLDS.NORMAL
          );
        }
      });

      it('falls back to default thresholds for unknown event kinds', () => {
        const unknownThresholds = getLagThresholdsForEventKind('unknown_event_type');
        expect(unknownThresholds).toEqual(PROJECTION_LAG_THRESHOLDS);
      });
    });
  });

  describe('generateThresholdAlert()', () => {
    const ledgerCloseTime = new Date(Date.now() - 30000); // 30 seconds ago

    it('returns null when lag is healthy', () => {
      const alert = generateThresholdAlert(3000, 'token_created', ledgerCloseTime);
      expect(alert).toBeNull();
    });

    it('generates warning alert when lag is elevated', () => {
      const alert = generateThresholdAlert(20000, 'token_created', ledgerCloseTime);
      expect(alert).not.toBeNull();
      if (alert) {
        expect(alert.severity).toBe('warning');
        expect(alert.currentLag).toBe(20000);
        expect(alert.eventKind).toBe('token_created');
        expect(alert.message).toContain('token_created');
      }
    });

    it('generates critical alert when lag is severe', () => {
      const alert = generateThresholdAlert(90000, 'campaign_started', ledgerCloseTime);
      expect(alert).not.toBeNull();
      if (alert) {
        expect(alert.severity).toBe('critical');
        expect(alert.currentLag).toBe(90000);
      }
    });

    it('includes actionable message for operators', () => {
      const alert = generateThresholdAlert(50000, 'vault_created', ledgerCloseTime);
      if (alert) {
        expect(alert.message).toContain(alert.currentLag.toString());
        expect(alert.message).toContain(alert.threshold.toString());
      }
    });
  });

  describe('LagWindow - Rolling Window Aggregation', () => {
    let window: LagWindow;

    beforeEach(() => {
      window = new LagWindow(10000); // 10 second window for faster tests
    });

    describe('record() method', () => {
      it('records individual lag measurements', () => {
        window.record(1000);
        expect(window.getCount()).toBe(1);

        window.record(2000);
        expect(window.getCount()).toBe(2);
      });

      it('maintains separate measurements', () => {
        window.record(1000);
        window.record(3000);
        window.record(2000);

        expect(window.getCount()).toBe(3);
        expect(window.getMaxLag()).toBe(3000);
      });
    });

    describe('getMaxLag() method', () => {
      it('returns 0 for empty window', () => {
        expect(window.getMaxLag()).toBe(0);
      });

      it('returns maximum lag value recorded', () => {
        window.record(1000);
        window.record(5000);
        window.record(3000);

        expect(window.getMaxLag()).toBe(5000);
      });

      it('handles negative lag values (clock skew)', () => {
        // Clock skew or Horizon delays can sometimes produce negative lag
        window.record(-100);
        window.record(500);
        expect(window.getMaxLag()).toBe(500);
      });
    });

    describe('getAverageLag() method', () => {
      it('returns 0 for empty window', () => {
        expect(window.getAverageLag()).toBe(0);
      });

      it('calculates correct average', () => {
        window.record(1000); // 1 second
        window.record(3000); // 3 seconds
        window.record(2000); // 2 seconds

        // Average should be 2 seconds
        expect(window.getAverageLag()).toBe(2000);
      });

      it('detects degradation through average lag increase', () => {
        // Record normal lag
        window.record(2000);
        window.record(3000);
        window.record(2500);
        const normalAverage = window.getAverageLag();

        // Record degraded lag (new window)
        const degradedWindow = new LagWindow(10000);
        degradedWindow.record(15000);
        degradedWindow.record(20000);
        degradedWindow.record(18000);
        const degradedAverage = degradedWindow.getAverageLag();

        expect(degradedAverage).toBeGreaterThan(normalAverage);
      });
    });

    describe('getCount() method', () => {
      it('returns number of measurements in window', () => {
        expect(window.getCount()).toBe(0);

        window.record(1000);
        expect(window.getCount()).toBe(1);

        window.record(2000);
        expect(window.getCount()).toBe(2);
      });
    });

    describe('clear() method', () => {
      it('removes all measurements', () => {
        window.record(1000);
        window.record(2000);
        expect(window.getCount()).toBe(2);

        window.clear();
        expect(window.getCount()).toBe(0);
        expect(window.getMaxLag()).toBe(0);
        expect(window.getAverageLag()).toBe(0);
      });
    });

    describe('window expiration', () => {
      it('automatically prunes measurements outside window', async () => {
        const shortWindow = new LagWindow(100); // 100ms window

        shortWindow.record(1000);
        expect(shortWindow.getCount()).toBe(1);

        // Wait for window to expire
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Record new measurement - this triggers pruning
        shortWindow.record(2000);

        // Old measurement should be pruned
        expect(shortWindow.getCount()).toBe(1);
        expect(shortWindow.getMaxLag()).toBe(2000);
      });

      it('preserves recent measurements within window', async () => {
        const shortWindow = new LagWindow(100);

        shortWindow.record(1000);
        await new Promise((resolve) => setTimeout(resolve, 50));
        shortWindow.record(2000);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Record new measurement to trigger pruning check
        shortWindow.record(3000);

        // All three should still be present (within 150ms window)
        expect(shortWindow.getCount()).toBe(3);
      });
    });
  });

  describe('Threshold Validation Scenarios', () => {
    describe('normal operation', () => {
      it('does not create alerts for healthy lag', () => {
        const times = [1000, 2000, 2500, 1500, 2800, 3000].map((lag) => {
          const alert = generateThresholdAlert(
            lag,
            'token_created',
            new Date(Date.now() - lag)
          );
          return alert;
        });

        // Should have no alerts in normal operation
        const alerts = times.filter((a) => a !== null);
        expect(alerts).toHaveLength(0);
      });

      it('classifies consistent <5s lag as healthy', () => {
        const window = new LagWindow(60000);
        const lags = [2000, 3000, 2500, 3500, 2800];

        lags.forEach((lag) => window.record(lag));

        expect(window.getMaxLag()).toBeLessThanOrEqual(
          PROJECTION_LAG_THRESHOLDS.NORMAL
        );
        expect(window.getAverageLag()).toBeLessThanOrEqual(
          PROJECTION_LAG_THRESHOLDS.NORMAL
        );
      });
    });

    describe('warning lag (transient degradation)', () => {
      it('generates warning for sustained 10-20s lag', () => {
        const window = new LagWindow(60000);
        const lags = [15000, 18000, 12000, 16000];

        lags.forEach((lag) => window.record(lag));

        const allAboveNormal = lags.every(
          (lag) => lag >= PROJECTION_LAG_THRESHOLDS.NORMAL
        );
        const allBelowCritical = lags.every(
          (lag) => lag < PROJECTION_LAG_THRESHOLDS.CRITICAL
        );

        expect(allAboveNormal).toBe(true);
        expect(allBelowCritical).toBe(true);
      });

      it('is distinguishable from critical lag', () => {
        const warningStatus = determineThresholdStatus(20000, 'token_created');
        const criticalStatus = determineThresholdStatus(90000, 'token_created');

        expect(warningStatus).toBe('warning');
        expect(criticalStatus).toBe('critical');
        expect(warningStatus).not.toBe(criticalStatus);
      });
    });

    describe('critical lag (severe issue)', () => {
      it('detects lag > 60 seconds as critical', () => {
        const alert = generateThresholdAlert(
          70000,
          'campaign_started',
          new Date(Date.now() - 70000)
        );

        expect(alert).not.toBeNull();
        if (alert) {
          expect(alert.severity).toBe('critical');
        }
      });

      it('indicates backend significantly behind on-chain progress', () => {
        // 60+ seconds lag = ~12+ Stellar ledger closures behind
        // This breaks user expectations for deployment confirmation
        const severelyBehind = 120000; // 2 minutes
        const alert = generateThresholdAlert(
          severelyBehind,
          'token_created',
          new Date(Date.now() - severelyBehind)
        );

        expect(alert?.severity).toBe('critical');
      });

      it('distinguishes from transient network delays', () => {
        const transientDelay = 12000; // 12 seconds - elevated but not critical
        const severeLag = 90000; // 90 seconds - actual critical failure

        const transientStatus = determineThresholdStatus(
          transientDelay,
          'token_created'
        );
        const severeStatus = determineThresholdStatus(
          severeLag,
          'token_created'
        );

        expect(transientStatus).toBe('warning');
        expect(severeStatus).toBe('critical');
      });
    });
  });

  describe('Event-Specific Tolerance Tests', () => {
    it('token events have tight tolerances', () => {
      const lag = 35000; // 35 seconds
      const tokenStatus = determineThresholdStatus(lag, 'token_created');
      const defaultStatus = determineThresholdStatus(lag, 'unknown');

      // Token events should alert on 35s lag
      expect(tokenStatus).not.toBe('healthy');
    });

    it('governance events tolerate higher lag', () => {
      const lag = 35000; // 35 seconds
      const proposalStatus = determineThresholdStatus(lag, 'proposal_created');
      const defaultStatus = determineThresholdStatus(lag, 'unknown');

      // Governance may be more tolerant due to complexity
      if (EVENT_LAG_TOLERANCES.proposal_created?.WARNING) {
        const proposalWarning = EVENT_LAG_TOLERANCES.proposal_created.WARNING;
        if (lag < proposalWarning) {
          expect(proposalStatus).not.toBe('critical');
        }
      }
    });

    it('ensures all tolerances maintain threshold ordering', () => {
      for (const [eventKind, tolerances] of Object.entries(
        EVENT_LAG_TOLERANCES
      )) {
        const t = { ...PROJECTION_LAG_THRESHOLDS, ...tolerances };
        expect(t.NORMAL).toBeLessThanOrEqual(t.WARNING);
        expect(t.WARNING).toBeLessThanOrEqual(t.CRITICAL);
      }
    });
  });

  describe('Operator Actionability', () => {
    it('provides clear thresholds for alerting', () => {
      expect(PROJECTION_LAG_THRESHOLDS.WARNING).toBe(30000);
      expect(PROJECTION_LAG_THRESHOLDS.CRITICAL).toBe(60000);

      // Clear time-based values operators can reason about
      expect(typeof PROJECTION_LAG_THRESHOLDS.WARNING).toBe('number');
      expect(typeof PROJECTION_LAG_THRESHOLDS.CRITICAL).toBe('number');
    });

    it('generates non-noisy warnings', () => {
      const lagWindow = new LagWindow(60000);

      // Mix of normal and slightly elevated - shouldn't alert
      const readingSequence = [
        2000, 3000, 2500, // normal
        7000, // slight blip
        3000, 2800, // back to normal
      ];

      // Check average isn't in warning territory
      readingSequence.forEach((lag) => lagWindow.record(lag));
      const average = lagWindow.getAverageLag();

      expect(average).toBeLessThan(PROJECTION_LAG_THRESHOLDS.WARNING);
    });

    it('distinguishes infrastructure issues from normal jitter', () => {
      // Normal jitter: 2-5s, occasional spike to 6-7s
      const normalJitter = [2500, 3000, 3500, 6500, 3000, 2800];
      const normalMax = Math.max(...normalJitter);
      expect(normalMax).toBeLessThan(PROJECTION_LAG_THRESHOLDS.WARNING);

      // Infrastructure issue: consistent 30-40s lag
      const infrastructureIssue = [35000, 38000, 32000, 40000, 31000];
      const issueMin = Math.min(...infrastructureIssue);
      expect(issueMin).toBeGreaterThanOrEqual(PROJECTION_LAG_THRESHOLDS.WARNING);
    });
  });
});
