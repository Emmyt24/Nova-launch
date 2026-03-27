import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWallet } from '../useWallet';
import { WalletService } from '../../services/wallet';
import { analytics } from '../../services/analytics';

vi.mock('../../services/wallet');
vi.mock('../../services/analytics');

describe('useWallet', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(analytics.track).mockImplementation(() => {});
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('starts disconnected with testnet as default network', () => {
            const { result } = renderHook(() => useWallet());

            expect(result.current.wallet).toEqual({
                connected: false,
                address: null,
                network: 'testnet',
            });
            expect(result.current.isConnecting).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('uses provided network option', () => {
            const { result } = renderHook(() => useWallet({ network: 'mainnet' }));

            expect(result.current.wallet.network).toBe('mainnet');
        });
    });

    describe('connect', () => {
        it('connects successfully', async () => {
            const mockAddress = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockResolvedValue(mockAddress);
            vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
            vi.mocked(WalletService.watchChanges).mockReturnValue(() => {});

            const { result } = renderHook(() => useWallet());

            await act(async () => {
                await result.current.connect();
            });

            await waitFor(() => {
                expect(result.current.wallet.connected).toBe(true);
            });

            expect(result.current.wallet.address).toBe(mockAddress);
            expect(result.current.wallet.network).toBe('testnet');
            expect(result.current.error).toBeNull();
            expect(localStorage.getItem('nova_wallet_connected')).toBe('true');
        });

        it('handles wallet not installed', async () => {
            vi.mocked(WalletService.isInstalled).mockResolvedValue(false);

            const { result } = renderHook(() => useWallet());

            await act(async () => {
                await result.current.connect();
            });

            await waitFor(() => {
                expect(result.current.error).toBe('Freighter wallet is not installed');
            });

            expect(result.current.wallet.connected).toBe(false);
        });

        it('handles user rejection', async () => {
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockResolvedValue(null);

            const { result } = renderHook(() => useWallet());

            await act(async () => {
                await result.current.connect();
            });

            await waitFor(() => {
                expect(result.current.error).toBeTruthy();
            });

            expect(result.current.wallet.connected).toBe(false);
        });

        it('sets isConnecting state during connection', async () => {
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve('GABC...'), 100))
            );
            vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
            vi.mocked(WalletService.watchChanges).mockReturnValue(() => {});

            const { result } = renderHook(() => useWallet());

            act(() => {
                result.current.connect();
            });

            expect(result.current.isConnecting).toBe(true);

            await waitFor(() => {
                expect(result.current.isConnecting).toBe(false);
            });
        });
    });

    describe('disconnect', () => {
        it('disconnects and clears state', async () => {
            const mockAddress = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockResolvedValue(mockAddress);
            vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
            vi.mocked(WalletService.watchChanges).mockReturnValue(() => {});

            const { result } = renderHook(() => useWallet());

            await act(async () => {
                await result.current.connect();
            });

            await waitFor(() => {
                expect(result.current.wallet.connected).toBe(true);
            });

            act(() => {
                result.current.disconnect();
            });

            expect(result.current.wallet.connected).toBe(false);
            expect(result.current.wallet.address).toBeNull();
            expect(result.current.error).toBeNull();
            expect(localStorage.getItem('nova_wallet_connected')).toBeNull();
        });

        it('calls cleanup function', async () => {
            const mockCleanup = vi.fn();
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockResolvedValue('GABC...');
            vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
            vi.mocked(WalletService.watchChanges).mockReturnValue(mockCleanup);

            const { result } = renderHook(() => useWallet());

            await act(async () => {
                await result.current.connect();
            });

            act(() => {
                result.current.disconnect();
            });

            expect(mockCleanup).toHaveBeenCalled();
        });
    });

    describe('network changes', () => {
        it('disconnects when network option changes', async () => {
            const mockAddress = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockResolvedValue(mockAddress);
            vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
            vi.mocked(WalletService.watchChanges).mockReturnValue(() => {});

            const { result, rerender } = renderHook(
                ({ network }) => useWallet({ network }),
                { initialProps: { network: 'testnet' as const } }
            );

            await act(async () => {
                await result.current.connect();
            });

            await waitFor(() => {
                expect(result.current.wallet.connected).toBe(true);
            });

            rerender({ network: 'mainnet' });

            await waitFor(() => {
                expect(result.current.wallet.connected).toBe(false);
            });

            expect(result.current.wallet.network).toBe('mainnet');
        });
    });

    describe('auto-reconnect', () => {
        it('reconnects on mount if previously connected', async () => {
            localStorage.setItem('nova_wallet_connected', 'true');
            const mockAddress = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockResolvedValue(mockAddress);
            vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
            vi.mocked(WalletService.watchChanges).mockReturnValue(() => {});

            const { result } = renderHook(() => useWallet());

            await waitFor(() => {
                expect(result.current.wallet.connected).toBe(true);
            }, { timeout: 3000 });

            expect(result.current.wallet.address).toBe(mockAddress);
        });

        it('clears storage if wallet not installed on auto-reconnect', async () => {
            localStorage.setItem('nova_wallet_connected', 'true');
            vi.mocked(WalletService.isInstalled).mockResolvedValue(false);

            renderHook(() => useWallet());

            await waitFor(() => {
                expect(localStorage.getItem('nova_wallet_connected')).toBeNull();
            });
        });
    });

    describe('wallet change listener', () => {
        it('updates state when wallet changes', async () => {
            const mockAddress1 = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            const mockAddress2 = 'GHIJKLM1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
            
            let changeCallback: ((data: { address: string; network: string }) => void) | null = null;
            
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockResolvedValue(mockAddress1);
            vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
            vi.mocked(WalletService.watchChanges).mockImplementation((callback) => {
                changeCallback = callback;
                return () => {};
            });

            const { result } = renderHook(() => useWallet());

            await act(async () => {
                await result.current.connect();
            });

            await waitFor(() => {
                expect(result.current.wallet.connected).toBe(true);
            });

            act(() => {
                changeCallback?.({ address: mockAddress2, network: 'TESTNET' });
            });

            await waitFor(() => {
                expect(result.current.wallet.address).toBe(mockAddress2);
            });
        });
    });

    describe('cleanup', () => {
        it('cleans up listeners on unmount', async () => {
            const mockCleanup = vi.fn();
            vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
            vi.mocked(WalletService.getPublicKey).mockResolvedValue('GABC...');
            vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
            vi.mocked(WalletService.watchChanges).mockReturnValue(mockCleanup);

            const { result, unmount } = renderHook(() => useWallet());

            await act(async () => {
                await result.current.connect();
            });

            unmount();

            expect(mockCleanup).toHaveBeenCalled();
        });
    });
});
