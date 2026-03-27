import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useNetwork } from '../useNetwork';

describe('useNetwork', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initial state', () => {
        it('defaults to testnet', () => {
            const { result } = renderHook(() => useNetwork());

            expect(result.current.network).toBe('testnet');
            expect(result.current.isTestnet).toBe(true);
            expect(result.current.isMainnet).toBe(false);
            expect(result.current.isChanging).toBe(false);
        });

        it('loads from localStorage if available', () => {
            localStorage.setItem('nova_network_preference', 'mainnet');

            const { result } = renderHook(() => useNetwork());

            expect(result.current.network).toBe('mainnet');
            expect(result.current.isMainnet).toBe(true);
        });

        it('ignores invalid localStorage value', () => {
            localStorage.setItem('nova_network_preference', 'invalid');

            const { result } = renderHook(() => useNetwork());

            expect(result.current.network).toBe('testnet');
        });
    });

    describe('setNetwork', () => {
        it('changes network to mainnet', () => {
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.setNetwork('mainnet');
            });

            expect(result.current.network).toBe('mainnet');
            expect(result.current.isMainnet).toBe(true);
            expect(result.current.isTestnet).toBe(false);
        });

        it('changes network to testnet', () => {
            localStorage.setItem('nova_network_preference', 'mainnet');
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.setNetwork('testnet');
            });

            expect(result.current.network).toBe('testnet');
            expect(result.current.isTestnet).toBe(true);
            expect(result.current.isMainnet).toBe(false);
        });

        it('sets isChanging during transition', () => {
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.setNetwork('mainnet');
            });

            expect(result.current.isChanging).toBe(true);

            act(() => {
                vi.advanceTimersByTime(300);
            });

            expect(result.current.isChanging).toBe(false);
        });

        it('persists to localStorage', () => {
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.setNetwork('mainnet');
            });

            expect(localStorage.getItem('nova_network_preference')).toBe('mainnet');
        });
    });

    describe('toggleNetwork', () => {
        it('toggles from testnet to mainnet', () => {
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.toggleNetwork();
            });

            expect(result.current.network).toBe('mainnet');
        });

        it('toggles from mainnet to testnet', () => {
            localStorage.setItem('nova_network_preference', 'mainnet');
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.toggleNetwork();
            });

            expect(result.current.network).toBe('testnet');
        });

        it('sets isChanging during toggle', () => {
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.toggleNetwork();
            });

            expect(result.current.isChanging).toBe(true);

            act(() => {
                vi.advanceTimersByTime(300);
            });

            expect(result.current.isChanging).toBe(false);
        });

        it('persists toggle to localStorage', () => {
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.toggleNetwork();
            });

            expect(localStorage.getItem('nova_network_preference')).toBe('mainnet');

            act(() => {
                result.current.toggleNetwork();
            });

            expect(localStorage.getItem('nova_network_preference')).toBe('testnet');
        });
    });

    describe('localStorage handling', () => {
        it('handles localStorage unavailable on read', () => {
            const originalGetItem = localStorage.getItem;
            localStorage.getItem = vi.fn().mockImplementation(() => {
                throw new Error('localStorage unavailable');
            });

            const { result } = renderHook(() => useNetwork());

            expect(result.current.network).toBe('testnet');

            localStorage.getItem = originalGetItem;
        });

        it('handles localStorage unavailable on write', () => {
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = vi.fn().mockImplementation(() => {
                throw new Error('localStorage unavailable');
            });

            const { result } = renderHook(() => useNetwork());

            expect(() => {
                act(() => {
                    result.current.setNetwork('mainnet');
                });
            }).not.toThrow();

            expect(result.current.network).toBe('mainnet');

            localStorage.setItem = originalSetItem;
        });
    });

    describe('computed properties', () => {
        it('updates isTestnet and isMainnet correctly', () => {
            const { result } = renderHook(() => useNetwork());

            expect(result.current.isTestnet).toBe(true);
            expect(result.current.isMainnet).toBe(false);

            act(() => {
                result.current.setNetwork('mainnet');
            });

            expect(result.current.isTestnet).toBe(false);
            expect(result.current.isMainnet).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('handles rapid network changes', () => {
            const { result } = renderHook(() => useNetwork());

            act(() => {
                result.current.toggleNetwork();
                result.current.toggleNetwork();
                result.current.toggleNetwork();
            });

            expect(result.current.network).toBe('mainnet');
        });

        it('maintains state across multiple toggles', () => {
            const { result } = renderHook(() => useNetwork());

            for (let i = 0; i < 10; i++) {
                act(() => {
                    result.current.toggleNetwork();
                });
            }

            expect(result.current.network).toBe('testnet');
        });
    });
});
