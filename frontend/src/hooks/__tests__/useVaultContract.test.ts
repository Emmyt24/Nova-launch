import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useVaultContract, formatInterval, formatCountdown, truncateAddress, getStellarExpertUrl } from '../useVaultContract';
import type { CreateRecurringPaymentParams } from '../../types';

describe('useVaultContract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('starts with default state', () => {
            const { result } = renderHook(() => useVaultContract());

            expect(result.current.payments).toEqual([]);
            expect(result.current.loading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('accepts network option', () => {
            const { result } = renderHook(() => useVaultContract({ network: 'mainnet' }));

            expect(result.current.payments).toEqual([]);
        });

        it('accepts wallet address option', () => {
            const walletAddress = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            const { result } = renderHook(() => useVaultContract({ walletAddress }));

            expect(result.current.payments).toEqual([]);
        });
    });

    describe('getRecurringPayments', () => {
        it('fetches recurring payments successfully', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                const payments = await result.current.getRecurringPayments();
                expect(payments).toBeDefined();
                expect(Array.isArray(payments)).toBe(true);
            });

            expect(result.current.loading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('sets loading state during fetch', async () => {
            const { result } = renderHook(() => useVaultContract());

            act(() => {
                result.current.getRecurringPayments();
            });

            expect(result.current.loading).toBe(true);

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });
        });

        it('updates payments state', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.getRecurringPayments();
            });

            expect(result.current.payments.length).toBeGreaterThan(0);
        });

        it('calculates payment status correctly', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.getRecurringPayments();
            });

            const payments = result.current.payments;
            expect(payments.some(p => p.status === 'active' || p.status === 'due' || p.status === 'paused')).toBe(true);
        });
    });

    describe('schedulePayment', () => {
        it('schedules a new payment successfully', async () => {
            const { result } = renderHook(() => useVaultContract({
                walletAddress: 'GCREATOR1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12'
            }));

            const params: CreateRecurringPaymentParams = {
                recipient: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                amount: '100.00',
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                memo: 'Test payment',
                interval: 'daily',
            };

            let newPayment;
            await act(async () => {
                newPayment = await result.current.schedulePayment(params);
            });

            expect(newPayment).toBeDefined();
            expect(newPayment?.recipient).toBe(params.recipient);
            expect(newPayment?.amount).toBe(params.amount);
            expect(newPayment?.status).toBe('active');
            expect(result.current.payments).toContainEqual(newPayment);
        });

        it('validates recipient address', async () => {
            const { result } = renderHook(() => useVaultContract());

            const params: CreateRecurringPaymentParams = {
                recipient: 'invalid',
                amount: '100.00',
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                interval: 'daily',
            };

            await act(async () => {
                await expect(result.current.schedulePayment(params)).rejects.toThrow('Invalid recipient address');
            });

            expect(result.current.error).toBe('Invalid recipient address');
        });

        it('validates amount', async () => {
            const { result } = renderHook(() => useVaultContract());

            const params: CreateRecurringPaymentParams = {
                recipient: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                amount: '0',
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                interval: 'daily',
            };

            await act(async () => {
                await expect(result.current.schedulePayment(params)).rejects.toThrow('Amount must be greater than 0');
            });
        });

        it('validates token address', async () => {
            const { result } = renderHook(() => useVaultContract());

            const params: CreateRecurringPaymentParams = {
                recipient: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                amount: '100.00',
                tokenAddress: '',
                interval: 'daily',
            };

            await act(async () => {
                await expect(result.current.schedulePayment(params)).rejects.toThrow('Token address is required');
            });
        });

        it('handles custom interval', async () => {
            const { result } = renderHook(() => useVaultContract({
                walletAddress: 'GCREATOR1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12'
            }));

            const params: CreateRecurringPaymentParams = {
                recipient: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                amount: '100.00',
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                interval: 'custom',
                customIntervalSeconds: 7200, // 2 hours
            };

            let newPayment;
            await act(async () => {
                newPayment = await result.current.schedulePayment(params);
            });

            expect(newPayment?.intervalSeconds).toBe(7200);
        });

        it('validates custom interval', async () => {
            const { result } = renderHook(() => useVaultContract());

            const params: CreateRecurringPaymentParams = {
                recipient: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                amount: '100.00',
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                interval: 'custom',
                customIntervalSeconds: 0,
            };

            await act(async () => {
                await expect(result.current.schedulePayment(params)).rejects.toThrow('Invalid payment interval');
            });
        });

        it('sets loading state during scheduling', async () => {
            const { result } = renderHook(() => useVaultContract({
                walletAddress: 'GCREATOR1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12'
            }));

            const params: CreateRecurringPaymentParams = {
                recipient: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                amount: '100.00',
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                interval: 'daily',
            };

            act(() => {
                result.current.schedulePayment(params);
            });

            expect(result.current.loading).toBe(true);

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });
        });
    });

    describe('executeRecurringPayment', () => {
        it('executes a payment successfully', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.getRecurringPayments();
            });

            const paymentId = result.current.payments[0]?.id;
            if (!paymentId) throw new Error('No payment found');

            let executeResult;
            await act(async () => {
                executeResult = await result.current.executeRecurringPayment(paymentId);
            });

            expect(executeResult?.success).toBe(true);
            expect(executeResult?.txHash).toBeDefined();
        });

        it('updates payment state after execution', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.getRecurringPayments();
            });

            const paymentId = result.current.payments[0]?.id;
            if (!paymentId) throw new Error('No payment found');

            const initialPaymentCount = result.current.payments.find(p => p.id === paymentId)?.paymentCount || 0;

            await act(async () => {
                await result.current.executeRecurringPayment(paymentId);
            });

            const updatedPayment = result.current.payments.find(p => p.id === paymentId);
            expect(updatedPayment?.paymentCount).toBe(initialPaymentCount + 1);
            expect(updatedPayment?.lastPaymentTime).toBeDefined();
        });

        it('throws error for non-existent payment', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await expect(result.current.executeRecurringPayment('non-existent')).rejects.toThrow('Payment not found');
            });
        });
    });

    describe('cancelRecurringPayment', () => {
        it('cancels a payment successfully', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.getRecurringPayments();
            });

            const paymentId = result.current.payments[0]?.id;
            if (!paymentId) throw new Error('No payment found');

            let cancelResult;
            await act(async () => {
                cancelResult = await result.current.cancelRecurringPayment(paymentId);
            });

            expect(cancelResult?.success).toBe(true);

            const cancelledPayment = result.current.payments.find(p => p.id === paymentId);
            expect(cancelledPayment?.status).toBe('cancelled');
        });

        it('throws error for non-existent payment', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await expect(result.current.cancelRecurringPayment('non-existent')).rejects.toThrow('Payment not found');
            });
        });
    });

    describe('pauseRecurringPayment', () => {
        it('pauses a payment successfully', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.getRecurringPayments();
            });

            const activePayment = result.current.payments.find(p => p.status === 'active');
            if (!activePayment) throw new Error('No active payment found');

            let pauseResult;
            await act(async () => {
                pauseResult = await result.current.pauseRecurringPayment(activePayment.id);
            });

            expect(pauseResult?.success).toBe(true);

            const pausedPayment = result.current.payments.find(p => p.id === activePayment.id);
            expect(pausedPayment?.status).toBe('paused');
        });
    });

    describe('resumeRecurringPayment', () => {
        it('resumes a paused payment successfully', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.getRecurringPayments();
            });

            const pausedPayment = result.current.payments.find(p => p.status === 'paused');
            if (!pausedPayment) throw new Error('No paused payment found');

            let resumeResult;
            await act(async () => {
                resumeResult = await result.current.resumeRecurringPayment(pausedPayment.id);
            });

            expect(resumeResult?.success).toBe(true);

            const resumedPayment = result.current.payments.find(p => p.id === pausedPayment.id);
            expect(resumedPayment?.status).toBe('active');
        });

        it('throws error for non-paused payment', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.getRecurringPayments();
            });

            const activePayment = result.current.payments.find(p => p.status === 'active');
            if (!activePayment) throw new Error('No active payment found');

            await act(async () => {
                await expect(result.current.resumeRecurringPayment(activePayment.id)).rejects.toThrow('Payment is not paused');
            });
        });
    });

    describe('getPaymentHistory', () => {
        it('fetches payment history successfully', async () => {
            const { result } = renderHook(() => useVaultContract());

            let history;
            await act(async () => {
                history = await result.current.getPaymentHistory('1');
            });

            expect(Array.isArray(history)).toBe(true);
        });

        it('filters history by payment ID', async () => {
            const { result } = renderHook(() => useVaultContract());

            let history;
            await act(async () => {
                history = await result.current.getPaymentHistory('1');
            });

            expect(history?.every(h => h.paymentId === '1')).toBe(true);
        });
    });

    describe('refreshPayments', () => {
        it('refreshes payments list', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await result.current.refreshPayments();
            });

            expect(result.current.payments.length).toBeGreaterThan(0);
        });
    });

    describe('wallet connection', () => {
        it('fetches payments when wallet connects', async () => {
            const { rerender } = renderHook(
                ({ walletAddress }) => useVaultContract({ walletAddress }),
                { initialProps: { walletAddress: null as string | null } }
            );

            await act(async () => {
                rerender({ walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12' });
            });

            // Should trigger fetch
            await waitFor(() => {
                // Effect should have run
            });
        });
    });

    describe('error handling', () => {
        it('handles errors gracefully', async () => {
            const { result } = renderHook(() => useVaultContract());

            await act(async () => {
                await expect(result.current.executeRecurringPayment('invalid')).rejects.toThrow();
            });

            expect(result.current.error).toBeDefined();
        });

        it('clears error on successful operation', async () => {
            const { result } = renderHook(() => useVaultContract({
                walletAddress: 'GCREATOR1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12'
            }));

            // Cause an error
            await act(async () => {
                await expect(result.current.schedulePayment({
                    recipient: 'invalid',
                    amount: '100',
                    tokenAddress: 'test',
                    interval: 'daily',
                })).rejects.toThrow();
            });

            expect(result.current.error).toBeDefined();

            // Successful operation
            await act(async () => {
                await result.current.getRecurringPayments();
            });

            expect(result.current.error).toBeNull();
        });
    });
});

describe('utility functions', () => {
    describe('formatInterval', () => {
        it('formats hourly interval', () => {
            expect(formatInterval('hourly')).toBe('Every hour');
        });

        it('formats daily interval', () => {
            expect(formatInterval('daily')).toBe('Every day');
        });

        it('formats weekly interval', () => {
            expect(formatInterval('weekly')).toBe('Every week');
        });

        it('formats monthly interval', () => {
            expect(formatInterval('monthly')).toBe('Every month');
        });

        it('formats custom interval in hours', () => {
            expect(formatInterval('custom', 7200)).toBe('Every 2 hours');
        });

        it('formats custom interval in days', () => {
            expect(formatInterval('custom', 172800)).toBe('Every 2 days');
        });

        it('handles single hour', () => {
            expect(formatInterval('custom', 3600)).toBe('Every 1 hour');
        });

        it('handles single day', () => {
            expect(formatInterval('custom', 86400)).toBe('Every 1 day');
        });
    });

    describe('formatCountdown', () => {
        it('shows "Due now" for past time', () => {
            const pastTime = Date.now() - 1000;
            expect(formatCountdown(pastTime)).toBe('Due now');
        });

        it('formats days and hours', () => {
            const futureTime = Date.now() + (2 * 24 * 60 * 60 * 1000) + (3 * 60 * 60 * 1000);
            expect(formatCountdown(futureTime)).toBe('2d 3h');
        });

        it('formats hours and minutes', () => {
            const futureTime = Date.now() + (5 * 60 * 60 * 1000) + (30 * 60 * 1000);
            expect(formatCountdown(futureTime)).toBe('5h 30m');
        });

        it('formats minutes only', () => {
            const futureTime = Date.now() + (45 * 60 * 1000);
            expect(formatCountdown(futureTime)).toBe('45m');
        });

        it('formats seconds only', () => {
            const futureTime = Date.now() + 30000;
            expect(formatCountdown(futureTime)).toBe('30s');
        });
    });

    describe('truncateAddress', () => {
        it('truncates long address', () => {
            const address = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            expect(truncateAddress(address)).toBe('GABCDEF1...BCDEF12');
        });

        it('does not truncate short address', () => {
            const address = 'SHORT';
            expect(truncateAddress(address)).toBe('SHORT');
        });

        it('respects custom char count', () => {
            const address = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            expect(truncateAddress(address, 4)).toBe('GABC...EF12');
        });
    });

    describe('getStellarExpertUrl', () => {
        it('generates testnet URL', () => {
            const txHash = 'abc123';
            expect(getStellarExpertUrl(txHash, 'testnet')).toBe(
                'https://stellar.expert/explorer/testnet/tx/abc123'
            );
        });

        it('generates mainnet URL', () => {
            const txHash = 'abc123';
            expect(getStellarExpertUrl(txHash, 'mainnet')).toBe(
                'https://stellar.expert/explorer/public/tx/abc123'
            );
        });

        it('defaults to testnet', () => {
            const txHash = 'abc123';
            expect(getStellarExpertUrl(txHash)).toBe(
                'https://stellar.expert/explorer/testnet/tx/abc123'
            );
        });
    });
});
