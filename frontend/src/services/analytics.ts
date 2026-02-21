let ANALYTICS_DOMAIN = '';
let ANALYTICS_API_KEY = '';

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
  timestamp?: number;
}

class Analytics {
  private initialized = false;
  private queue: AnalyticsEvent[] = [];
  private enabled = true;

  constructor() {
    if (typeof window !== 'undefined') {
      this.checkPrivacySettings();
    }
  }

  private checkPrivacySettings(): void {
    const dntEnabled = navigator.doNotTrack === '1' || 
                       (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    
    if (dntEnabled) {
      this.enabled = false;
    }
  }

  init(domain: string, apiKey: string): void {
    if (!domain || !apiKey) {
      console.warn('[Analytics] Missing domain or API key');
      return;
    }

    ANALYTICS_DOMAIN = domain;
    ANALYTICS_API_KEY = apiKey;
    this.initialized = true;
    this.processQueue();
  }

  private shouldTrack(): boolean {
    if (!this.enabled || !this.initialized) return false;
    return true;
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      if (event) {
        this.track(event.name, event.properties, event.timestamp);
      }
    }
  }

  trackPageView(url?: string, referrer?: string): void {
    const pageUrl = url || (typeof window !== 'undefined' ? window.location.pathname : '/');
    const pageReferrer = referrer || (typeof document !== 'undefined' ? document.referrer : '');

    this.track('pageview', {
      url: pageUrl,
      referrer: pageReferrer,
    });
  }

  track(eventName: string, properties?: Record<string, string | number | boolean>, timestamp?: number): void {
    if (!this.shouldTrack()) return;

    const event: AnalyticsEvent = {
      name: eventName,
      properties,
      timestamp: timestamp || Date.now(),
    };

    if (!this.initialized) {
      this.queue.push(event);
      return;
    }

    this.sendEvent(event);
  }

  private sendEvent(event: AnalyticsEvent): void {
    if (!ANALYTICS_DOMAIN || !ANALYTICS_API_KEY) return;

    const payload = {
      name: event.name,
      url: event.properties?.url as string || (typeof window !== 'undefined' ? window.location.pathname : '/'),
      referrer: event.properties?.referrer as string || '',
      props: event.properties,
      ts: Math.floor((event.timestamp || Date.now()) / 1000),
    };

    try {
      const endpoint = `${ANALYTICS_DOMAIN}/api/event`;
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANALYTICS_API_KEY}`,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }
}

export const analytics = new Analytics();

export const AnalyticsEvent = {
  PAGE_VIEW: 'pageview',
  WALLET_CONNECTED: 'wallet_connected',
  WALLET_DISCONNECTED: 'wallet_disconnected',
  TOKEN_DEPLOYED: 'token_deployed',
  TOKEN_DEPLOY_FAILED: 'token_deploy_failed',
  NETWORK_SWITCHED: 'network_switched',
  TUTORIAL_STARTED: 'tutorial_started',
  TUTORIAL_COMPLETED: 'tutorial_completed',
  TUTORIAL_SKIPPED: 'tutorial_skipped',
  PWA_INSTALLED: 'pwa_installed',
} as const;
