import { useCallback, useEffect, useRef } from 'react';
import { analytics, AnalyticsEvent } from '../services/analytics';

const getDNTStatus = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return navigator.doNotTrack === '1' || 
         (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
};

interface UseAnalyticsOptions {
  enabled?: boolean;
}

interface TrackEventOptions {
  properties?: Record<string, string | number | boolean>;
}

export function useAnalytics(options: UseAnalyticsOptions = {}) {
  const enabled = options.enabled ?? true;
  const pageViewTracked = useRef(false);

  useEffect(() => {
    if (getDNTStatus()) return;
    
    const domain = import.meta.env.VITE_ANALYTICS_DOMAIN;
    const apiKey = import.meta.env.VITE_ANALYTICS_API_KEY;
    
    if (domain && apiKey) {
      analytics.init(domain, apiKey);
    }
  }, []);

  useEffect(() => {
    if (!enabled || pageViewTracked.current) return;
    
    analytics.trackPageView();
    pageViewTracked.current = true;
  }, [enabled]);

  const trackPageView = useCallback((url?: string, referrer?: string) => {
    if (!enabled) return;
    analytics.trackPageView(url, referrer);
  }, [enabled]);

  const trackWalletConnect = useCallback((walletType: string, network?: string) => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.WALLET_CONNECTED, {
      wallet_type: walletType,
      network,
    });
  }, [enabled]);

  const trackWalletDisconnect = useCallback((walletType: string) => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.WALLET_DISCONNECTED, {
      wallet_type: walletType,
    });
  }, [enabled]);

  const trackTokenDeployed = useCallback((tokenSymbol: string, network: string) => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.TOKEN_DEPLOYED, {
      token_symbol: tokenSymbol,
      network,
    });
  }, [enabled]);

  const trackTokenDeployFailed = useCallback((error: string, network: string) => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.TOKEN_DEPLOY_FAILED, {
      error,
      network,
    });
  }, [enabled]);

  const trackNetworkSwitch = useCallback((fromNetwork: string, toNetwork: string) => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.NETWORK_SWITCHED, {
      from_network: fromNetwork,
      to_network: toNetwork,
    });
  }, [enabled]);

  const trackTutorialStarted = useCallback(() => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.TUTORIAL_STARTED);
  }, [enabled]);

  const trackTutorialCompleted = useCallback(() => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.TUTORIAL_COMPLETED);
  }, [enabled]);

  const trackTutorialSkipped = useCallback(() => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.TUTORIAL_SKIPPED);
  }, [enabled]);

  const trackPWAInstalled = useCallback(() => {
    if (!enabled) return;
    analytics.track(AnalyticsEvent.PWA_INSTALLED);
  }, [enabled]);

  const trackCustomEvent = useCallback((eventName: string, options?: TrackEventOptions) => {
    if (!enabled) return;
    analytics.track(eventName, options?.properties);
  }, [enabled]);

  return {
    trackPageView,
    trackWalletConnect,
    trackWalletDisconnect,
    trackTokenDeployed,
    trackTokenDeployFailed,
    trackNetworkSwitch,
    trackTutorialStarted,
    trackTutorialCompleted,
    trackTutorialSkipped,
    trackPWAInstalled,
    trackCustomEvent,
  };
}
