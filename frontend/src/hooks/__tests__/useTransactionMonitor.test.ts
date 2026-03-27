import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTransactionMonitor } from '../useTransactionMonitor';

// Mock fetch globally
global.fetch = vi.fn();

describe('useTransactionMonitor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initial state', () => {
        it('starts with default state', () => {
            const { result } = renderHook(() => useTransactionMonitor());

            expect(result.current.monitoring).toBe(false);
            expect(result.current.status).toBeNull();
            expect(result.current.progress).toBe(0);
            expect(result.current.estimatedTimeMs).toBeUndefined();
            expect(result.current.error).toBeNull();
        });
    });

    describe('startMonitoring', () => {
        it('starts monitoring a transaction', () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            act(() => {
                result.current.startMonitoring(txHash);
            });

            expect(result.current.monitoring).toBe(true);
            expect(result.current.status).toBe('pending');
            expect(result.current.progress).toBe(0);
            expect(result.current.estimatedTimeMs).toBeDefined();
        });

        it('polls transaction status at intervals', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            expect(global.fetch).not.toHaveBeenCalled();

            // First poll
            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith(
                `https://horizon-testnet.stellar.org/transactions/${txHash}`
            );

            // Second poll
            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('updates progress during monitoring', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            expect(result.current.progress).toBe(0);

            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            expect(result.current.progress).toBeGreaterThan(0);

            await act(async () => {
                vi.advanceTimersByTime(6000);
            });

            expect(result.current.progress).toBeGreaterThan(0);
        });

        it('updates estimated time remaining', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            const initialEstimate = result.current.estimatedTimeMs;

            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            const updatedEstimate = result.current.estimatedTimeMs;

            if (initialEstimate !== undefined && updatedEstimate !== undefined) {
                expect(updatedEstimate).toBeLessThanOrEqual(initialEstimate);
            }
        });

        it('stops monitoring on successful transaction', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                status: 200,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            await act(async () => {
                vi.advanceTimersByTime(3000);
                await Promise.resolve();
            });

            expect(result.current.status).toBe('success');
            expect(result.current.monitoring).toBe(false);
            expect(result.current.progress).toBe(100);
            expect(result.current.estimatedTimeMs).toBe(0);
        });

        it('handles transaction timeout', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

            act(() => {
                result.current.startMonitoring(txHash);
            });

            // Simulate max attempts (40 * 3000ms)
            for (let i = 0; i < 40; i++) {
                await act(async () => {
                    vi.advanceTimersByTime(3000);
                    await Promise.resolve();
                });
            }

            expect(result.current.status).toBe('timeout');
            expect(result.current.error).toBe('Transaction confirmation timeout');
            expect(result.current.monitoring).toBe(false);
        });

        it('handles transaction failure', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 400,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            // Should continue polling on non-404 errors until timeout
            expect(result.current.monitoring).toBe(true);
        });

        it('resets state when starting new monitoring', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash1 = 'abc123';
            const txHash2 = 'def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                status: 200,
            } as Response);

            // First monitoring
            act(() => {
                result.current.startMonitoring(txHash1);
            });

            await act(async () => {
                vi.advanceTimersByTime(3000);
                await Promise.resolve();
            });

            expect(result.current.status).toBe('success');

            // Start new monitoring
            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash2);
            });

            expect(result.current.status).toBe('pending');
            expect(result.current.progress).toBe(0);
            expect(result.current.error).toBeNull();
        });
    });

    describe('stopMonitoring', () => {
        it('stops monitoring manually', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            expect(result.current.monitoring).toBe(true);

            act(() => {
                result.current.stopMonitoring();
            });

            expect(result.current.monitoring).toBe(false);

            // Should not poll after stopping
            const callCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
            
            await act(async () => {
                vi.advanceTimersByTime(10000);
            });

            expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
        });

        it('can be called multiple times safely', () => {
            const { result } = renderHook(() => useTransactionMonitor());

            act(() => {
                result.current.stopMonitoring();
                result.current.stopMonitoring();
                result.current.stopMonitoring();
            });

            expect(result.current.monitoring).toBe(false);
        });

        it('can be called before starting monitoring', () => {
            const { result } = renderHook(() => useTransactionMonitor());

            act(() => {
                result.current.stopMonitoring();
            });

            expect(result.current.monitoring).toBe(false);
        });
    });

    describe('progress calculation', () => {
        it('progress increases with attempts', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            const progressValues: number[] = [result.current.progress];

            for (let i = 0; i < 5; i++) {
                await act(async () => {
                    vi.advanceTimersByTime(3000);
                });
                progressValues.push(result.current.progress);
            }

            // Progress should generally increase
            expect(progressValues[progressValues.length - 1]).toBeGreaterThan(progressValues[0]);
        });

        it('progress caps at 90% during monitoring', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            // Advance through many attempts
            for (let i = 0; i < 35; i++) {
                await act(async () => {
                    vi.advanceTimersByTime(3000);
                });
            }

            expect(result.current.progress).toBeLessThanOrEqual(90);
        });

        it('progress reaches 100% on success', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                status: 200,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            await act(async () => {
                vi.advanceTimersByTime(3000);
                await Promise.resolve();
            });

            expect(result.current.progress).toBe(100);
        });
    });

    describe('error handling', () => {
        it('handles network errors gracefully', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

            act(() => {
                result.current.startMonitoring(txHash);
            });

            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            // Should continue monitoring despite error
            expect(result.current.monitoring).toBe(true);
            expect(result.current.status).toBe('pending');
        });

        it('handles fetch exceptions', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
                throw new Error('Fetch failed');
            });

            act(() => {
                result.current.startMonitoring(txHash);
            });

            await act(async () => {
                vi.advanceTimersByTime(3000);
            });

            // Should handle exception and continue
            expect(result.current.monitoring).toBe(true);
        });
    });

    describe('cleanup', () => {
        it('clears interval on unmount', async () => {
            const { result, unmount } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            const callCountBeforeUnmount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

            unmount();

            await act(async () => {
                vi.advanceTimersByTime(10000);
            });

            // Should not make additional calls after unmount
            expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountBeforeUnmount);
        });

        it('handles unmount during active monitoring', () => {
            const { result, unmount } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            expect(result.current.monitoring).toBe(true);

            // Should not throw
            expect(() => unmount()).not.toThrow();
        });
    });

    describe('edge cases', () => {
        it('handles empty transaction hash', () => {
            const { result } = renderHook(() => useTransactionMonitor());

            act(() => {
                result.current.startMonitoring('');
            });

            expect(result.current.monitoring).toBe(true);
            expect(result.current.status).toBe('pending');
        });

        it('handles very long transaction hash', () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const longHash = 'a'.repeat(1000);

            act(() => {
                result.current.startMonitoring(longHash);
            });

            expect(result.current.monitoring).toBe(true);
        });

        it('handles rapid start/stop cycles', () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            for (let i = 0; i < 10; i++) {
                act(() => {
                    result.current.startMonitoring(txHash);
                    result.current.stopMonitoring();
                });
            }

            expect(result.current.monitoring).toBe(false);
        });

        it('handles monitoring restart with same hash', async () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash = 'abc123def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash);
            });

            await act(async () => {
                vi.advanceTimersByTime(6000);
            });

            act(() => {
                result.current.stopMonitoring();
            });

            // Restart with same hash
            act(() => {
                result.current.startMonitoring(txHash);
            });

            expect(result.current.monitoring).toBe(true);
            expect(result.current.progress).toBe(0);
        });

        it('handles concurrent monitoring attempts', () => {
            const { result } = renderHook(() => useTransactionMonitor());
            const txHash1 = 'abc123';
            const txHash2 = 'def456';

            (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response);

            act(() => {
                result.current.startMonitoring(txHash1);
                result.current.startMonitoring(txHash2);
            });

            // Second call should reset state
            expect(result.current.monitoring).toBe(true);
            expect(result.current.progress).toBe(0);
        });
    });
});
