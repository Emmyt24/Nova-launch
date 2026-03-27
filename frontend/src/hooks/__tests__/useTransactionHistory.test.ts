import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTransactionHistory } from '../useTransactionHistory';
import { useWallet } from '../useWallet';

vi.mock('../useWallet');

describe('useTransactionHistory', () => {
    const mockAddress = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(useWallet).mockReturnValue({
            wallet: {
                connected: true,
                address: mockAddress,
                network: 'testnet',
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
            isConnecting: false,
            error: null,
        });
    });

    describe('initial state', () => {
        it('starts with empty history', () => {
            const { result } = renderHook(() => useTransactionHistory());

            expect(result.current.history).toEqual([]);
            expect(result.current.isEmpty).toBe(true);
            expect(result.current.loading).toBe(false);
        });

        it('loads history from localStorage', () => {
            const mockHistory = [
                {
                    id: '1',
                    tokenName: 'Test Token',
                    tokenSymbol: 'TST',
                    contractAddress: 'CDLZ...',
                    timestamp: Date.now(),
                    walletAddress: mockAddress,
                },
            ];

            localStorage.setItem('nova_transaction_history', JSON.stringify(mockHistory));

            const { result } = renderHook(() => useTransactionHistory());

            waitFor(() => {
                expect(result.current.history).toEqual(mockHistory);
                expect(result.current.isEmpty).toBe(false);
            });
        });
    });

    describe('addTransaction', () => {
        it('adds new transaction to history', () => {
            const { result } = renderHook(() => useTransactionHistory());

            const newTransaction = {
                id: '1',
                tokenName: 'Test Token',
                tokenSymbol: 'TST',
                contractAddress: 'CDLZ...',
            };

            act(() => {
                result.current.addTransaction(newTransaction);
            });

            expect(result.current.history).toHaveLength(1);
            expect(result.current.history[0]).toMatchObject(newTransaction);
            expect(result.current.history[0].walletAddress).toBe(mockAddress);
            expect(result.current.history[0].timestamp).toBeDefined();
        });

        it('adds transaction to beginning of list', () => {
            const { result } = renderHook(() => useTransactionHistory());

            const transaction1 = {
                id: '1',
                tokenName: 'Token 1',
                tokenSymbol: 'TK1',
                contractAddress: 'CDLZ1...',
            };

            const transaction2 = {
                id: '2',
                tokenName: 'Token 2',
                tokenSymbol: 'TK2',
                contractAddress: 'CDLZ2...',
            };

            act(() => {
                result.current.addTransaction(transaction1);
            });

            act(() => {
                result.current.addTransaction(transaction2);
            });

            expect(result.current.history[0].id).toBe('2');
            expect(result.current.history[1].id).toBe('1');
        });

        it('persists to localStorage', () => {
            const { result } = renderHook(() => useTransactionHistory());

            const newTransaction = {
                id: '1',
                tokenName: 'Test Token',
                tokenSymbol: 'TST',
                contractAddress: 'CDLZ...',
            };

            act(() => {
                result.current.addTransaction(newTransaction);
            });

            const stored = localStorage.getItem('nova_transaction_history');
            expect(stored).toBeTruthy();

            const parsed = JSON.parse(stored!);
            expect(parsed).toHaveLength(1);
            expect(parsed[0]).toMatchObject(newTransaction);
        });

        it('handles unknown wallet address', () => {
            vi.mocked(useWallet).mockReturnValue({
                wallet: {
                    connected: false,
                    address: null,
                    network: 'testnet',
                },
                connect: vi.fn(),
                disconnect: vi.fn(),
                isConnecting: false,
                error: null,
            });

            const { result } = renderHook(() => useTransactionHistory());

            const newTransaction = {
                id: '1',
                tokenName: 'Test Token',
                tokenSymbol: 'TST',
                contractAddress: 'CDLZ...',
            };

            act(() => {
                result.current.addTransaction(newTransaction);
            });

            expect(result.current.history[0].walletAddress).toBe('unknown');
        });
    });

    describe('filtering and sorting', () => {
        it('filters transactions by wallet address', () => {
            const otherAddress = 'GHIJKLM1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            
            const mockHistory = [
                {
                    id: '1',
                    tokenName: 'Token 1',
                    tokenSymbol: 'TK1',
                    contractAddress: 'CDLZ1...',
                    timestamp: Date.now(),
                    walletAddress: mockAddress,
                },
                {
                    id: '2',
                    tokenName: 'Token 2',
                    tokenSymbol: 'TK2',
                    contractAddress: 'CDLZ2...',
                    timestamp: Date.now(),
                    walletAddress: otherAddress,
                },
            ];

            localStorage.setItem('nova_transaction_history', JSON.stringify(mockHistory));

            const { result } = renderHook(() => useTransactionHistory());

            waitFor(() => {
                expect(result.current.history).toHaveLength(1);
                expect(result.current.history[0].id).toBe('1');
            });
        });

        it('sorts transactions by timestamp descending', () => {
            const now = Date.now();
            const mockHistory = [
                {
                    id: '1',
                    tokenName: 'Token 1',
                    tokenSymbol: 'TK1',
                    contractAddress: 'CDLZ1...',
                    timestamp: now - 2000,
                    walletAddress: mockAddress,
                },
                {
                    id: '2',
                    tokenName: 'Token 2',
                    tokenSymbol: 'TK2',
                    contractAddress: 'CDLZ2...',
                    timestamp: now - 1000,
                    walletAddress: mockAddress,
                },
                {
                    id: '3',
                    tokenName: 'Token 3',
                    tokenSymbol: 'TK3',
                    contractAddress: 'CDLZ3...',
                    timestamp: now,
                    walletAddress: mockAddress,
                },
            ];

            localStorage.setItem('nova_transaction_history', JSON.stringify(mockHistory));

            const { result } = renderHook(() => useTransactionHistory());

            waitFor(() => {
                expect(result.current.history[0].id).toBe('3');
                expect(result.current.history[1].id).toBe('2');
                expect(result.current.history[2].id).toBe('1');
            });
        });
    });

    describe('refreshFromChain', () => {
        it('calls refreshFromChain without errors', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const { result } = renderHook(() => useTransactionHistory());

            await act(async () => {
                await result.current.refreshFromChain();
            });

            expect(consoleSpy).toHaveBeenCalledWith('Refreshing token data from Stellar network...');
            consoleSpy.mockRestore();
        });
    });

    describe('isEmpty', () => {
        it('returns true when history is empty', () => {
            const { result } = renderHook(() => useTransactionHistory());

            expect(result.current.isEmpty).toBe(true);
        });

        it('returns false when history has transactions', () => {
            const { result } = renderHook(() => useTransactionHistory());

            const newTransaction = {
                id: '1',
                tokenName: 'Test Token',
                tokenSymbol: 'TST',
                contractAddress: 'CDLZ...',
            };

            act(() => {
                result.current.addTransaction(newTransaction);
            });

            expect(result.current.isEmpty).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('handles invalid localStorage data', () => {
            localStorage.setItem('nova_transaction_history', 'invalid json');

            expect(() => {
                renderHook(() => useTransactionHistory());
            }).toThrow();
        });

        it('handles empty localStorage', () => {
            const { result } = renderHook(() => useTransactionHistory());

            expect(result.current.history).toEqual([]);
        });

        it('handles multiple transactions with same timestamp', () => {
            const now = Date.now();
            const mockHistory = [
                {
                    id: '1',
                    tokenName: 'Token 1',
                    tokenSymbol: 'TK1',
                    contractAddress: 'CDLZ1...',
                    timestamp: now,
                    walletAddress: mockAddress,
                },
                {
                    id: '2',
                    tokenName: 'Token 2',
                    tokenSymbol: 'TK2',
                    contractAddress: 'CDLZ2...',
                    timestamp: now,
                    walletAddress: mockAddress,
                },
            ];

            localStorage.setItem('nova_transaction_history', JSON.stringify(mockHistory));

            const { result } = renderHook(() => useTransactionHistory());

            waitFor(() => {
                expect(result.current.history).toHaveLength(2);
            });
        });
    });
});
