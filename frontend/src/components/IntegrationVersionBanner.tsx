import React from 'react';

export type CompatibilityStatus = 'ok' | 'warning' | 'error' | 'loading';

export interface CompatibilityInfo {
  status: CompatibilityStatus;
  /** Human-readable description of the mismatch, if any. */
  message?: string;
  /** When true, write operations should be blocked. */
  blockWrites: boolean;
}

interface Props {
  info: CompatibilityInfo;
}

/**
 * Non-blocking banner shown when frontend, backend, and contract versions
 * are out of sync during staged rollouts.
 *
 * Renders nothing when status is 'ok' or 'loading'.
 * Renders a yellow warning for minor mismatches.
 * Renders a red blocking banner for dangerous write mismatches.
 */
export function IntegrationVersionBanner({ info }: Props) {
  if (info.status === 'ok' || info.status === 'loading') return null;

  const isBlocking = info.blockWrites;
  const bg = isBlocking ? 'bg-red-600' : 'bg-yellow-500';
  const text = isBlocking ? 'text-white' : 'text-yellow-900';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`w-full px-4 py-2 text-sm font-medium text-center ${bg} ${text}`}
    >
      {isBlocking ? '🚫 ' : '⚠️ '}
      {info.message ?? 'Version mismatch detected between frontend, backend, and contract.'}
      {isBlocking && ' Write operations are disabled until the issue is resolved.'}
    </div>
  );
}
