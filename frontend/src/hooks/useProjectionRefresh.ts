/**
 * useProjectionRefresh
 *
 * Polls a backend check function until the projection for a given txHash or
 * entity ID is confirmed indexed, then stops. Designed to be started after
 * on-chain confirmation — not before.
 *
 * Usage:
 *   const { status, retry } = useProjectionRefresh({
 *     txHash,
 *     check: () => campaignApi.getById(campaignId).then(c => c.txHash === txHash),
 *     onIndexed: () => refetchCampaign(),
 *   });
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { analytics } from '../services/analytics';

export type ProjectionStatus = 'idle' | 'polling' | 'indexed' | 'failed';

export interface UseProjectionRefreshOptions {
  /** The on-chain tx hash or entity ID to wait for */
  txHash: string | null;
  /**
   * Async function that returns true when the backend projection reflects
   * the submitted transaction. Called on each poll interval.
   */
  check: () => Promise<boolean>;
  /** Called once when the projection is confirmed indexed */
  onIndexed?: () => void;
  /** Poll interval in ms — default 3000 */
  intervalMs?: number;
  /** Max number of poll attempts before giving up — default 20 (~60s) */
  maxAttempts?: number;
}

export interface UseProjectionRefreshReturn {
  status: ProjectionStatus;
  attempts: number;
  /** Manually restart polling (e.g. after a failed refresh) */
  retry: () => void;
  /** Elapsed ms since polling started */
  elapsedMs: number;
}

export function useProjectionRefresh({
  txHash,
  check,
  onIndexed,
  intervalMs = 3_000,
  maxAttempts = 20,
}: UseProjectionRefreshOptions): UseProjectionRefreshReturn {
  const [status, setStatus] = useState<ProjectionStatus>('idle');
  const [attempts, setAttempts] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const attemptsRef = useRef(0);
  const activeRef = useRef(false);
  // Stable refs so the polling closure doesn't capture stale values
  const checkRef = useRef(check);
  const onIndexedRef = useRef(onIndexed);
  checkRef.current = check;
  onIndexedRef.current = onIndexed;

  const stop = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!activeRef.current) return;

    attemptsRef.current += 1;
    setAttempts(attemptsRef.current);
    setElapsedMs(Date.now() - startTimeRef.current);

    if (attemptsRef.current > maxAttempts) {
      stop();
      setStatus('failed');
      analytics.track('projection_refresh_failed', {
        attempts: attemptsRef.current,
        elapsedMs: Date.now() - startTimeRef.current,
      });
      return;
    }

    try {
      const indexed = await checkRef.current();
      if (!activeRef.current) return; // unmounted or stopped mid-flight

      if (indexed) {
        stop();
        setStatus('indexed');
        analytics.track('projection_refresh_indexed', {
          attempts: attemptsRef.current,
          elapsedMs: Date.now() - startTimeRef.current,
        });
        onIndexedRef.current?.();
      } else {
        timerRef.current = setTimeout(poll, intervalMs);
      }
    } catch {
      if (!activeRef.current) return;
      // Transient error — keep polling
      timerRef.current = setTimeout(poll, intervalMs);
    }
  }, [maxAttempts, intervalMs, stop]);

  const start = useCallback(() => {
    stop();
    attemptsRef.current = 0;
    startTimeRef.current = Date.now();
    activeRef.current = true;
    setAttempts(0);
    setElapsedMs(0);
    setStatus('polling');
    poll();
  }, [stop, poll]);

  // Start polling whenever txHash changes to a non-null value
  useEffect(() => {
    if (!txHash) {
      stop();
      setStatus('idle');
      return;
    }
    start();
    return stop;
  }, [txHash, start, stop]);

  const retry = useCallback(() => {
    if (!txHash) return;
    start();
  }, [txHash, start]);

  return { status, attempts, retry, elapsedMs };
}
