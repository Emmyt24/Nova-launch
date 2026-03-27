export const ANALYTICS_CONFIG = {
    provider: (import.meta.env.VITE_ANALYTICS_PROVIDER as 'none' | 'custom' | 'plausible') || 'none',
    // Endpoint must be a self-hosted proxy or analytics intake that strips IPs and PII.
    endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT || '',
    siteId: import.meta.env.VITE_ANALYTICS_SITE_ID || '',
    enabled: (import.meta.env.VITE_ENABLE_ANALYTICS || 'false') === 'true',
} as const;
