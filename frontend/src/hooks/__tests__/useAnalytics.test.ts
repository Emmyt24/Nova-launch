import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnalytics } from '../useAnalytics';
import { analytics, AnalyticsEvent } from '../../services/analytics';

vi.mock('../../services/analytics');

describe('useAnalytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(analytics.init).mockImplementation(() => {});
        vi.mocked(analytics.track).mockImplementation(() => {});
        vi.mocked(analytics.trackPageView).mockImplementation(() => {});
        
        // Mock navigator.doNotTrack
        Object.defineProperty(navigator, 'doNotTrack', {
            writable: true,
            value: '0',
        });
    });

    describe('initialization', () => {
        it('initializes analytics on mount', () => {
            import.meta.env.VITE_ANALYTICS_DOMAIN = 'analytics.example.com';
            import.meta.env.VITE_ANALYTICS_API_KEY = 'test-key';

            renderHook(() => useAnalytics());

            expect(analytics.init).toHaveBeenCalledWith('analytics.example.com', 'test-key');
        });

        it('tracks page view on mount', () => {
            renderHook(() => useAnalytics());

            expect(analytics.trackPageView).toHaveBeenCalled();
        });

        it('does not track if DNT is enabled', () => {
            Object.defineProperty(navigator, 'doNotTrack', {
                writable: true,
                value: '1',
            });

            renderHook(() => useAnalytics());

            expect(analytics.init).not.toHaveBeenCalled();
        });

        it('respects globalPrivacyControl', () => {
            Object.defineProperty(navigator, 'globalPrivacyControl', {
                writable: true,
                value: true,
            });

            renderHook(() => useAnalytics());

            expect(analytics.init).not.toHaveBeenCalled();
        });

        it('does not track page view if disabled', () => {
            renderHook(() => useAnalytics({ enabled: false }));

            expect(analytics.trackPageView).not.toHaveBeenCalled();
        });
    });

    describe('trackPageView', () => {
        it('tracks page view with default params', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackPageView();
            });

            expect(analytics.trackPageView).toHaveBeenCalledWith(undefined, undefined);
        });

        it('tracks page view with custom url and referrer', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackPageView('/custom-page', 'https://referrer.com');
            });

            expect(analytics.trackPageView).toHaveBeenCalledWith('/custom-page', 'https://referrer.com');
        });

        it('does not track if disabled', () => {
            const { result } = renderHook(() => useAnalytics({ enabled: false }));

            act(() => {
                result.current.trackPageView();
            });

            expect(analytics.trackPageView).toHaveBeenCalledTimes(0);
        });
    });

    describe('trackWalletConnect', () => {
        it('tracks wallet connection', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackWalletConnect('freighter', 'testnet');
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.WALLET_CONNECTED, {
                wallet_type: 'freighter',
                network: 'testnet',
            });
        });

        it('does not track if disabled', () => {
            const { result } = renderHook(() => useAnalytics({ enabled: false }));

            act(() => {
                result.current.trackWalletConnect('freighter', 'testnet');
            });

            expect(analytics.track).not.toHaveBeenCalled();
        });
    });

    describe('trackWalletDisconnect', () => {
        it('tracks wallet disconnection', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackWalletDisconnect('freighter');
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.WALLET_DISCONNECTED, {
                wallet_type: 'freighter',
            });
        });
    });

    describe('trackTokenDeployed', () => {
        it('tracks token deployment', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackTokenDeployed('TST', 'testnet');
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.TOKEN_DEPLOYED, {
                token_symbol: 'TST',
                network: 'testnet',
            });
        });
    });

    describe('trackTokenDeployFailed', () => {
        it('tracks token deployment failure', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackTokenDeployFailed('Transaction failed', 'testnet');
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.TOKEN_DEPLOY_FAILED, {
                error: 'Transaction failed',
                network: 'testnet',
            });
        });
    });

    describe('trackNetworkSwitch', () => {
        it('tracks network switch', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackNetworkSwitch('testnet', 'mainnet');
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.NETWORK_SWITCHED, {
                from_network: 'testnet',
                to_network: 'mainnet',
            });
        });
    });

    describe('tutorial tracking', () => {
        it('tracks tutorial started', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackTutorialStarted();
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.TUTORIAL_STARTED);
        });

        it('tracks tutorial completed', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackTutorialCompleted();
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.TUTORIAL_COMPLETED);
        });

        it('tracks tutorial skipped', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackTutorialSkipped();
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.TUTORIAL_SKIPPED);
        });
    });

    describe('trackPWAInstalled', () => {
        it('tracks PWA installation', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackPWAInstalled();
            });

            expect(analytics.track).toHaveBeenCalledWith(AnalyticsEvent.PWA_INSTALLED);
        });
    });

    describe('trackCustomEvent', () => {
        it('tracks custom event without properties', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackCustomEvent('custom_event');
            });

            expect(analytics.track).toHaveBeenCalledWith('custom_event', undefined);
        });

        it('tracks custom event with properties', () => {
            const { result } = renderHook(() => useAnalytics());

            act(() => {
                result.current.trackCustomEvent('custom_event', {
                    properties: { key: 'value', count: 42 },
                });
            });

            expect(analytics.track).toHaveBeenCalledWith('custom_event', { key: 'value', count: 42 });
        });
    });

    describe('enabled option', () => {
        it('respects enabled option for all tracking methods', () => {
            const { result } = renderHook(() => useAnalytics({ enabled: false }));

            act(() => {
                result.current.trackWalletConnect('freighter', 'testnet');
                result.current.trackWalletDisconnect('freighter');
                result.current.trackTokenDeployed('TST', 'testnet');
                result.current.trackTokenDeployFailed('error', 'testnet');
                result.current.trackNetworkSwitch('testnet', 'mainnet');
                result.current.trackTutorialStarted();
                result.current.trackTutorialCompleted();
                result.current.trackTutorialSkipped();
                result.current.trackPWAInstalled();
                result.current.trackCustomEvent('custom');
            });

            expect(analytics.track).not.toHaveBeenCalled();
        });
    });
});
