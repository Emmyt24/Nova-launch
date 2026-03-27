import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRetry } from '../useRetry';

describe('useRetry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('starts with default state', () => {
            const { result } = renderHook(() => useRetry());

            expect(result.current.isRetrying).toBe(false);
            expect(result.current.retryAttempt).toBe(0);
            expect(result.current.lastError).toBeNull();
        });
    });

    describe('execute', () => {
        it('executes operation successfully on first try', async () => {
            const { result } = renderHook(() => useRetry<string>());
            const mockOperation = vi.fn().mockResolvedValue('success');

            let returnValue;
            await act(async () => {
                returnValue = await result.current.execute(mockOperation);
            });

            expect(returnValue).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(1);
            expect(result.current.isRetrying).toBe(false);
            expect(result.current.lastError).toBeNull();
        });

        it('retries on failure and eventually succeeds', async () => {
            const { result } = renderHook(() => useRetry<string>({
                config: {
                    maxAttempts: 3,
                    initialDelay: 10,
                    maxDelay: 100,
                    backoffMultiplier: 2,
                },
            }));

            const mockOperation = vi.fn()
                .mockRejectedValueOnce(new Error('Attempt 1 failed'))
                .mockRejectedValueOnce(new Error('Attempt 2 failed'))
                .mockResolvedValueOnce('success');

            let returnValue;
            await act(async () => {
                returnValue = await result.current.execute(mockOperation);
            });

            expect(returnValue).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(3);
            expect(result.current.isRetrying).toBe(false);
        });

        it('throws after max attempts', async () => {
            const { result } = renderHook(() => useRetry<string>({
                config: {
                    maxAttempts: 2,
                    initialDelay: 10,
                    maxDelay: 100,
                    backoffMultiplier: 2,
                },
            }));

            const mockOperation = vi.fn().mockRejectedValue(new Error('Always fails'));

            await act(async () => {
                await expect(result.current.execute(mockOperation)).rejects.toThrow('Always fails');
            });

            expect(mockOperation).toHaveBeenCalledTimes(2);
            expect(result.current.lastError?.message).toBe('Always fails');
        });

        it('calls onRetryAttempt callback', async () => {
            const onRetryAttempt = vi.fn();
            const { result } = renderHook(() => useRetry<string>({
                config: {
                    maxAttempts: 3,
                    initialDelay: 10,
                    maxDelay: 100,
                    backoffMultiplier: 2,
                },
                onRetryAttempt,
            }));

            const mockOperation = vi.fn()
                .mockRejectedValueOnce(new Error('Attempt 1 failed'))
                .mockResolvedValueOnce('success');

            await act(async () => {
                await result.current.execute(mockOperation);
            });

            expect(onRetryAttempt).toHaveBeenCalled();
            expect(onRetryAttempt.mock.calls[0][0]).toBe(1); // attempt number
            expect(onRetryAttempt.mock.calls[0][2].message).toBe('Attempt 1 failed'); // error
        });

        it('updates retry attempt count', async () => {
            const { result } = renderHook(() => useRetry<string>({
                config: {
                    maxAttempts: 3,
                    initialDelay: 10,
                    maxDelay: 100,
                    backoffMultiplier: 2,
                },
            }));

            const mockOperation = vi.fn()
                .mockRejectedValueOnce(new Error('Attempt 1 failed'))
                .mockRejectedValueOnce(new Error('Attempt 2 failed'))
                .mockResolvedValueOnce('success');

            await act(async () => {
                await result.current.execute(mockOperation);
            });

            await waitFor(() => {
                expect(result.current.retryAttempt).toBeGreaterThan(0);
            });
        });

        it('sets isRetrying during execution', async () => {
            const { result } = renderHook(() => useRetry<string>());
            const mockOperation = vi.fn().mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve('success'), 100))
            );

            act(() => {
                result.current.execute(mockOperation);
            });

            expect(result.current.isRetrying).toBe(true);

            await waitFor(() => {
                expect(result.current.isRetrying).toBe(false);
            });
        });
    });

    describe('retry', () => {
        it('retries last operation', async () => {
            const { result } = renderHook(() => useRetry<string>());
            const mockOperation = vi.fn()
                .mockRejectedValueOnce(new Error('First attempt failed'))
                .mockResolvedValueOnce('success on retry');

            await act(async () => {
                await expect(result.current.execute(mockOperation)).rejects.toThrow();
            });

            expect(mockOperation).toHaveBeenCalledTimes(1);

            await act(async () => {
                const retryResult = await result.current.retry();
                expect(retryResult).toBe('success on retry');
            });

            expect(mockOperation).toHaveBeenCalledTimes(2);
        });

        it('returns undefined if no operation to retry', async () => {
            const { result } = renderHook(() => useRetry<string>());

            let retryResult;
            await act(async () => {
                retryResult = await result.current.retry();
            });

            expect(retryResult).toBeUndefined();
        });
    });

    describe('error handling', () => {
        it('stores last error', async () => {
            const { result } = renderHook(() => useRetry<string>({
                config: {
                    maxAttempts: 1,
                    initialDelay: 10,
                    maxDelay: 100,
                    backoffMultiplier: 2,
                },
            }));

            const error = new Error('Operation failed');
            const mockOperation = vi.fn().mockRejectedValue(error);

            await act(async () => {
                await expect(result.current.execute(mockOperation)).rejects.toThrow();
            });

            expect(result.current.lastError?.message).toBe('Operation failed');
        });

        it('handles non-Error objects', async () => {
            const { result } = renderHook(() => useRetry<string>({
                config: {
                    maxAttempts: 1,
                    initialDelay: 10,
                    maxDelay: 100,
                    backoffMultiplier: 2,
                },
            }));

            const mockOperation = vi.fn().mockRejectedValue('string error');

            await act(async () => {
                await expect(result.current.execute(mockOperation)).rejects.toBe('string error');
            });

            expect(result.current.lastError?.message).toBe('string error');
        });
    });

    describe('configuration', () => {
        it('respects custom retry config', async () => {
            const { result } = renderHook(() => useRetry<string>({
                config: {
                    maxAttempts: 5,
                    initialDelay: 50,
                    maxDelay: 500,
                    backoffMultiplier: 3,
                },
            }));

            const mockOperation = vi.fn().mockRejectedValue(new Error('Always fails'));

            await act(async () => {
                await expect(result.current.execute(mockOperation)).rejects.toThrow();
            });

            expect(mockOperation).toHaveBeenCalledTimes(5);
        });
    });

    describe('edge cases', () => {
        it('handles synchronous errors', async () => {
            const { result } = renderHook(() => useRetry<string>({
                config: {
                    maxAttempts: 2,
                    initialDelay: 10,
                    maxDelay: 100,
                    backoffMultiplier: 2,
                },
            }));

            const mockOperation = vi.fn().mockImplementation(() => {
                throw new Error('Sync error');
            });

            await act(async () => {
                await expect(result.current.execute(mockOperation)).rejects.toThrow('Sync error');
            });

            expect(mockOperation).toHaveBeenCalledTimes(2);
        });

        it('handles multiple concurrent executions', async () => {
            const { result } = renderHook(() => useRetry<string>());
            const mockOperation1 = vi.fn().mockResolvedValue('result1');
            const mockOperation2 = vi.fn().mockResolvedValue('result2');

            let result1, result2;
            await act(async () => {
                [result1, result2] = await Promise.all([
                    result.current.execute(mockOperation1),
                    result.current.execute(mockOperation2),
                ]);
            });

            expect(result1).toBe('result1');
            expect(result2).toBe('result2');
        });
    });
});
