import { useCallback } from 'react';
import { Tooltip } from '../UI/Tooltip';
import { useBurnNotificationPrefs } from './useBurnNotificationPrefs';
import type { BurnConfig, BurnStats } from './types';

interface BurnSettingsProps {
    config: BurnConfig;
    stats?: BurnStats;
    tokenAddress?: string;
    policyUrl?: string;
    loading?: boolean;
    onNotificationPrefChange?: (enabled: boolean) => void;
}

function Badge({ enabled }: { enabled: boolean }) {
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                enabled
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200'
            }`}
        >
            {enabled ? 'Yes' : 'No'}
        </span>
    );
}

function SettingRow({
    label,
    tooltip,
    children,
}: {
    label: string;
    tooltip: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-gray-900">{label}</span>
                <Tooltip content={tooltip} position="right">
                    <span
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 cursor-help"
                        aria-label={tooltip}
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </span>
                </Tooltip>
            </div>
            <div className="flex-shrink-0">{children}</div>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="pt-6 border-t border-gray-200 first:pt-0 first:border-0">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                    <div className="h-6 bg-gray-200 rounded w-1/2" />
                </div>
            ))}
        </div>
    );
}

export function BurnSettings({
    config,
    stats,
    policyUrl,
    loading = false,
    onNotificationPrefChange,
}: BurnSettingsProps) {
    const { enabled: notificationsEnabled, setEnabled: setNotificationsEnabled } =
        useBurnNotificationPrefs(onNotificationPrefChange);

    const handleNotificationToggle = useCallback(() => {
        setNotificationsEnabled(!notificationsEnabled);
    }, [notificationsEnabled, setNotificationsEnabled]);

    const handleNotificationKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleNotificationToggle();
            }
        },
        [handleNotificationToggle]
    );

    const tokenSymbol = config.tokenSymbol || 'tokens';
    const formatLastBurn = (ts?: number) => {
        if (!ts) return '—';
        const d = new Date(ts);
        try {
            return d.toLocaleDateString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        } catch {
            return d.toLocaleString();
        }
    };

    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="space-y-6">
            {/* Burn Status */}
            <section aria-labelledby="burn-status-heading" className="pt-6 border-t border-gray-200 first:pt-0 first:border-t-0">
                <h3 id="burn-status-heading" className="text-sm font-semibold text-gray-900 mb-2">
                    Burn Status
                </h3>
                <SettingRow
                    label="Burn enabled"
                    tooltip="Whether token burning is enabled for this token"
                >
                    <Badge enabled={config.burnEnabled} />
                </SettingRow>
            </section>

            {/* Burn Type */}
            <section aria-labelledby="burn-type-heading" className="pt-6 border-t border-gray-200">
                <h3 id="burn-type-heading" className="text-sm font-semibold text-gray-900 mb-2">
                    Burn Type
                </h3>
                <div className="space-y-2">
                    <SettingRow
                        label="Admin burn"
                        tooltip="Administrators can burn tokens from any holder"
                    >
                        <Badge enabled={config.adminBurnEnabled} />
                    </SettingRow>
                    <SettingRow
                        label="Self burn"
                        tooltip="Token holders can burn their own tokens"
                    >
                        <Badge enabled={config.selfBurnEnabled} />
                    </SettingRow>
                </div>
            </section>

            {/* Limits */}
            <section aria-labelledby="limits-heading" className="pt-6 border-t border-gray-200">
                <h3 id="limits-heading" className="text-sm font-semibold text-gray-900 mb-2">
                    Limits
                </h3>
                <div className="space-y-2">
                    <SettingRow
                        label="Min burn amount"
                        tooltip="Minimum amount per burn transaction"
                    >
                        <span className="text-sm text-gray-700">
                            {config.minBurnAmount != null && config.minBurnAmount !== ''
                                ? `${config.minBurnAmount} ${tokenSymbol}`
                                : 'No limit'}
                        </span>
                    </SettingRow>
                    <SettingRow
                        label="Max burn amount"
                        tooltip="Maximum amount per burn transaction"
                    >
                        <span className="text-sm text-gray-700">
                            {config.maxBurnAmount != null && config.maxBurnAmount !== ''
                                ? `${config.maxBurnAmount} ${tokenSymbol}`
                                : 'Unlimited'}
                        </span>
                    </SettingRow>
                </div>
            </section>

            {/* Fees */}
            <section aria-labelledby="fees-heading" className="pt-6 border-t border-gray-200">
                <h3 id="fees-heading" className="text-sm font-semibold text-gray-900 mb-2">
                    Fees
                </h3>
                <SettingRow
                    label="Transaction fee"
                    tooltip="Fee charged per burn transaction"
                >
                    <span className="text-sm text-gray-700">
                        {config.burnFee != null && config.burnFee !== ''
                            ? `${config.burnFee} XLM`
                            : 'No fee'}
                    </span>
                </SettingRow>
            </section>

            {/* Notifications */}
            <section aria-labelledby="notifications-heading" className="pt-6 border-t border-gray-200">
                <h3 id="notifications-heading" className="text-sm font-semibold text-gray-900 mb-2">
                    Notifications
                </h3>
                <SettingRow
                    label="Burn alerts"
                    tooltip="Receive alerts when burns occur"
                >
                    <div className="flex items-center gap-1.5">
                        <span
                            className={`text-xs font-medium transition-colors ${
                                !notificationsEnabled ? 'text-gray-700' : 'text-gray-400'
                            }`}
                        >
                            Off
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={notificationsEnabled ? 'true' : 'false'}
                            aria-label={`Burn notifications ${notificationsEnabled ? 'on' : 'off'}`}
                            onClick={handleNotificationToggle}
                            onKeyDown={handleNotificationKeyDown}
                            className={`
                                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                                transition-colors duration-200 ease-in-out
                                focus:outline-none focus:ring-2 focus:ring-offset-2
                                disabled:opacity-50 disabled:cursor-not-allowed
                                ${notificationsEnabled
                                    ? 'bg-blue-500 focus:ring-blue-400'
                                    : 'bg-gray-200 focus:ring-gray-300'
                                }
                            `}
                        >
                            <span
                                className={`
                                    pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0
                                    transition duration-200 ease-in-out
                                    ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0'}
                                `}
                            />
                        </button>
                        <span
                            className={`text-xs font-medium transition-colors ${
                                notificationsEnabled ? 'text-gray-700' : 'text-gray-400'
                            }`}
                        >
                            On
                        </span>
                    </div>
                </SettingRow>
            </section>

            {/* Statistics */}
            {stats && (
                <section aria-labelledby="stats-heading" className="pt-6 border-t border-gray-200">
                    <h3 id="stats-heading" className="text-sm font-semibold text-gray-900 mb-2">
                        Burn Statistics
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                            {stats.totalBurned != null && (
                                <div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        {stats.totalBurned} {tokenSymbol}
                                    </div>
                                    <div className="text-xs text-gray-600">Total burned</div>
                                </div>
                            )}
                            {stats.burnCount != null && (
                                <div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        {stats.burnCount}
                                    </div>
                                    <div className="text-xs text-gray-600">Burn count</div>
                                </div>
                            )}
                            {stats.lastBurnAt != null && (
                                <div>
                                    <div className="text-sm font-bold text-gray-900">
                                        {formatLastBurn(stats.lastBurnAt)}
                                    </div>
                                    <div className="text-xs text-gray-600">Last burn</div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* Policy */}
            {policyUrl && (
                <section aria-labelledby="policy-heading" className="pt-6 border-t border-gray-200">
                    <h3 id="policy-heading" className="text-sm font-semibold text-gray-900 mb-2">
                        Burn Policy
                    </h3>
                    <a
                        href={policyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                        View burn policy documentation
                    </a>
                </section>
            )}
        </div>
    );
}
