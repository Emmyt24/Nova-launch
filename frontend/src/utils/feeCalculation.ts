import type { FeeBreakdown } from '../types';

/** Fallback fees (XLM) used when contract read is unavailable */
export const FALLBACK_BASE_FEE = 7;
export const FALLBACK_METADATA_FEE = 3;

export function getDeploymentFeeBreakdown(
    hasMetadata: boolean,
    baseFee = FALLBACK_BASE_FEE,
    metadataFee = FALLBACK_METADATA_FEE,
): FeeBreakdown {
    const meta = hasMetadata ? metadataFee : 0;
    return { baseFee, metadataFee: meta, totalFee: baseFee + meta };
}

export function formatFeeAmount(amount: number): string {
    return `${amount} XLM`;
}
