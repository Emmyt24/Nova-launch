/**
 * Projection Refresh — Integration Tests
 *
 * Verifies:
 *   1. Pending tx transitions to indexed state without manual refresh
 *   2. Polling stops once backend state catches up
 *   3. Failed backend refresh shows retry option
 *   4. No double-polling when the same txHash is submitted twice
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectionRefresh } from '../../hooks/useProjectionRefresh';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TX_HASH = '0xabc123smoke';

function makeCheck(resolveAfterCalls: number) {
  let calls = 0;
  return vi.fn(async () => {
    calls += 1;
    return calls >= resolveAfterCalls;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useProjectionRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── 1. Pending → indexed without manual refresh ───────────────────────────

  it('starts in idle when txHash is null', () => {
    const check = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useProjectionRefresh({ txHash: null, check }),
    );
    expect(result.current.status).toBe('idle');
    expect(check).not.toHaveBeenCalled();
  });

  it('transitions to polling when txHash is set', async () => {
    const check = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useProjectionRefresh({ txHash: TX_HASH, check, intervalMs: 100 }),
    );
    expect(result.current.status).toBe('polling');
  });

  it('transitions to indexed once check returns true', async () => {
    const check = makeCheck(2); // resolves on 2nd call
    const onIndexed = vi.fn();

    const { result } = renderHook(() =>
      useProjectionRefresh({ txHash: TX_HASH, check, onIndexed, intervalMs: 50 }),
    );

    expect(result.current.status).toBe('polling');

    // Advance past first poll (returns false), then second (returns true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    await waitFor(() => expect(result.current.status).toBe('indexed'));
    expect(onIndexed).toHaveBeenCalledOnce();
  });

  // ── 2. Polling stops once backend catches up ──────────────────────────────

  it('stops polling after indexed — no further check calls', async () => {
    const check = makeCheck(1); // resolves immediately on first call

    const { result } = renderHook(() =>
      useProjectionRefresh({ txHash: TX_HASH, check, intervalMs: 50 }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await waitFor(() => expect(result.current.status).toBe('indexed'));

    const callsAtIndexed = check.mock.calls.length;

    // Advance more time — no additional calls should happen
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(check.mock.calls.length).toBe(callsAtIndexed);
  });

  it('increments attempt count on each poll', async () => {
    const check = vi.fn().mockResolvedValue(false);

    const { result } = renderHook(() =>
      useProjectionRefresh({ txHash: TX_HASH, check, intervalMs: 50 }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.attempts).toBeGreaterThan(1);
  });

  // ── 3. Failed refresh shows retry ────────────────────────────────────────

  it('transitions to failed after maxAttempts', async () => {
    const check = vi.fn().mockResolvedValue(false);

    const { result } = renderHook(() =>
      useProjectionRefresh({
        txHash: TX_HASH,
        check,
        intervalMs: 10,
        maxAttempts: 3,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await waitFor(() => expect(result.current.status).toBe('failed'));
  });

  it('retry restarts polling from failed state', async () => {
    const check = vi.fn().mockResolvedValue(false);

    const { result } = renderHook(() =>
      useProjectionRefresh({
        txHash: TX_HASH,
        check,
        intervalMs: 10,
        maxAttempts: 2,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    await waitFor(() => expect(result.current.status).toBe('failed'));

    // Now make check succeed on retry
    check.mockResolvedValue(true);

    act(() => {
      result.current.retry();
    });

    expect(result.current.status).toBe('polling');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    await waitFor(() => expect(result.current.status).toBe('indexed'));
  });

  // ── 4. No double-polling on same txHash ───────────────────────────────────

  it('does not restart polling when txHash prop is set to the same value', async () => {
    const check = vi.fn().mockResolvedValue(false);

    const { result, rerender } = renderHook(
      ({ txHash }: { txHash: string }) =>
        useProjectionRefresh({ txHash, check, intervalMs: 50 }),
      { initialProps: { txHash: TX_HASH } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const callsBeforeRerender = check.mock.calls.length;

    // Re-render with same txHash — should not reset polling
    rerender({ txHash: TX_HASH });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Calls should continue incrementally, not restart from 0
    expect(check.mock.calls.length).toBeGreaterThan(callsBeforeRerender);
    expect(result.current.attempts).toBeGreaterThan(0);
  });

  it('resets and restarts when txHash changes to a new value', async () => {
    const check = vi.fn().mockResolvedValue(false);
    const NEW_TX = '0xnewTxHash';

    const { result, rerender } = renderHook(
      ({ txHash }: { txHash: string }) =>
        useProjectionRefresh({ txHash, check, intervalMs: 50 }),
      { initialProps: { txHash: TX_HASH } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    rerender({ txHash: NEW_TX });

    // Attempts should reset
    expect(result.current.attempts).toBe(0);
    expect(result.current.status).toBe('polling');
  });

  // ── 5. Cleanup on unmount ─────────────────────────────────────────────────

  it('stops polling on unmount', async () => {
    const check = vi.fn().mockResolvedValue(false);

    const { unmount } = renderHook(() =>
      useProjectionRefresh({ txHash: TX_HASH, check, intervalMs: 50 }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const callsAtUnmount = check.mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(check.mock.calls.length).toBe(callsAtUnmount);
  });
});
