import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BurnSettings } from '../BurnSettings';
import type { BurnConfig, BurnStats } from '../types';

const defaultConfig: BurnConfig = {
    burnEnabled: true,
    adminBurnEnabled: true,
    selfBurnEnabled: true,
    minBurnAmount: '1',
    maxBurnAmount: null,
    burnFee: '0.01',
    tokenSymbol: 'TOKEN',
};

describe('BurnSettings', () => {
    const mockLocalStorage: Record<string, string> = {};
    beforeEach(() => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
            return mockLocalStorage[key] ?? null;
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
            mockLocalStorage[key] = value;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]);
    });

    it('renders all sections with correct config', () => {
        render(<BurnSettings config={defaultConfig} />);

        expect(screen.getByText('Burn Status')).toBeInTheDocument();
        expect(screen.getByText('Burn Type')).toBeInTheDocument();
        expect(screen.getByText('Limits')).toBeInTheDocument();
        expect(screen.getByText('Fees')).toBeInTheDocument();
        expect(screen.getByText('Notifications')).toBeInTheDocument();
    });

    it('displays Burn enabled Yes badge when burnEnabled is true', () => {
        render(<BurnSettings config={{ ...defaultConfig, burnEnabled: true }} />);

        const badges = screen.getAllByText('Yes');
        expect(badges.length).toBeGreaterThanOrEqual(1);
        expect(badges[0]).toBeInTheDocument();
    });

    it('displays Burn enabled No badge when burnEnabled is false', () => {
        render(<BurnSettings config={{ ...defaultConfig, burnEnabled: false }} />);

        const nos = screen.getAllByText('No');
        expect(nos.length).toBeGreaterThanOrEqual(1);
    });

    it('displays Admin burn and Self burn badges', () => {
        render(
            <BurnSettings
                config={{
                    ...defaultConfig,
                    adminBurnEnabled: true,
                    selfBurnEnabled: false,
                }}
            />
        );

        const yesBadges = screen.getAllByText('Yes');
        const noBadges = screen.getAllByText('No');
        expect(yesBadges.length).toBeGreaterThanOrEqual(1);
        expect(noBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('shows min burn amount when provided', () => {
        render(<BurnSettings config={{ ...defaultConfig, minBurnAmount: '10' }} />);

        expect(screen.getByText('10 TOKEN')).toBeInTheDocument();
    });

    it('shows No limit for min burn when null or empty', () => {
        render(<BurnSettings config={{ ...defaultConfig, minBurnAmount: null }} />);

        expect(screen.getByText('No limit')).toBeInTheDocument();
    });

    it('shows max burn amount when provided', () => {
        render(<BurnSettings config={{ ...defaultConfig, maxBurnAmount: '1000' }} />);

        expect(screen.getByText('1000 TOKEN')).toBeInTheDocument();
    });

    it('shows Unlimited for max burn when null or empty', () => {
        render(<BurnSettings config={{ ...defaultConfig, maxBurnAmount: null }} />);

        expect(screen.getByText('Unlimited')).toBeInTheDocument();
    });

    it('displays transaction fee when provided', () => {
        render(<BurnSettings config={{ ...defaultConfig, burnFee: '0.5' }} />);

        expect(screen.getByText('0.5 XLM')).toBeInTheDocument();
    });

    it('displays No fee when burnFee is null or empty', () => {
        render(<BurnSettings config={{ ...defaultConfig, burnFee: null }} />);

        expect(screen.getByText('No fee')).toBeInTheDocument();
    });

    it('renders notification toggle with switch role', () => {
        render(<BurnSettings config={defaultConfig} />);

        const toggle = screen.getByRole('switch', { name: /burn notifications/i });
        expect(toggle).toBeInTheDocument();
    });

    it('toggles notification preference on click', () => {
        render(<BurnSettings config={defaultConfig} />);

        const toggle = screen.getByRole('switch', { name: /burn notifications/i });
        const initialState = toggle.getAttribute('aria-checked');
        fireEvent.click(toggle);
        const newState = toggle.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
    });

    it('calls onNotificationPrefChange when toggle changes', () => {
        const onNotificationPrefChange = vi.fn();
        render(
            <BurnSettings
                config={defaultConfig}
                onNotificationPrefChange={onNotificationPrefChange}
            />
        );

        const toggle = screen.getByRole('switch', { name: /burn notifications/i });
        fireEvent.click(toggle);
        expect(onNotificationPrefChange).toHaveBeenCalled();
    });

    it('displays policy link when policyUrl is provided', () => {
        const policyUrl = 'https://example.com/burn-policy';
        render(<BurnSettings config={defaultConfig} policyUrl={policyUrl} />);

        const link = screen.getByRole('link', { name: /view burn policy documentation/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', policyUrl);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('does not render policy section when policyUrl is not provided', () => {
        render(<BurnSettings config={defaultConfig} />);

        expect(screen.queryByText('Burn Policy')).not.toBeInTheDocument();
    });

    it('shows loading skeleton when loading is true', () => {
        render(<BurnSettings config={defaultConfig} loading />);

        expect(screen.queryByText('Burn Status')).not.toBeInTheDocument();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('shows burn statistics when stats are provided', () => {
        const stats: BurnStats = {
            totalBurned: '500',
            burnCount: 10,
            lastBurnAt: Date.now() - 3600000,
        };
        render(<BurnSettings config={defaultConfig} stats={stats} />);

        expect(screen.getByText('Burn Statistics')).toBeInTheDocument();
        expect(screen.getByText('500 TOKEN')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('has proper aria attributes for accessibility', () => {
        render(<BurnSettings config={defaultConfig} />);

        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('aria-checked');
        expect(toggle).toHaveAttribute('aria-label');
    });

    it('supports keyboard interaction with Enter on toggle', () => {
        const onNotificationPrefChange = vi.fn();
        render(
            <BurnSettings
                config={defaultConfig}
                onNotificationPrefChange={onNotificationPrefChange}
            />
        );

        const toggle = screen.getByRole('switch');
        fireEvent.keyDown(toggle, { key: 'Enter' });
        expect(onNotificationPrefChange).toHaveBeenCalled();
    });

    it('supports keyboard interaction with Space on toggle', () => {
        const onNotificationPrefChange = vi.fn();
        render(
            <BurnSettings
                config={defaultConfig}
                onNotificationPrefChange={onNotificationPrefChange}
            />
        );

        const toggle = screen.getByRole('switch');
        fireEvent.keyDown(toggle, { key: ' ' });
        expect(onNotificationPrefChange).toHaveBeenCalled();
    });

    it('uses token symbol from config for amounts', () => {
        render(<BurnSettings config={{ ...defaultConfig, tokenSymbol: 'MYTOKEN' }} />);

        expect(screen.getByText('1 MYTOKEN')).toBeInTheDocument();
    });
});
