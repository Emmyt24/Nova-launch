import type { FeeBreakdown } from '../../types';
import { formatFeeAmount } from '../../utils/feeCalculation';

interface FeeDisplayProps {
    feeBreakdown: FeeBreakdown;
    hasMetadata: boolean;
    network: 'testnet' | 'mainnet';
    loading?: boolean;
    error?: string | null;
    isFallback?: boolean;
    onRetry?: () => void;
}

export function FeeDisplay({
    feeBreakdown,
    hasMetadata,
    network,
    loading = false,
    error = null,
    isFallback = false,
    onRetry,
}: FeeDisplayProps) {
    return (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-blue-900">Deployment Cost</h4>
                <span className="text-xs text-blue-600 uppercase tracking-wide">{network}</span>
            </div>

            {error && (
                <div className="mb-3 flex items-center justify-between rounded bg-yellow-100 px-3 py-2 text-xs text-yellow-800">
                    <span>Using estimated fees — contract read failed.</span>
                    {onRetry && (
                        <button onClick={onRetry} className="ml-2 underline hover:no-underline">
                            Retry
                        </button>
                    )}
                </div>
            )}

            <div className="space-y-2 text-sm">
                <div className="flex justify-between text-blue-800">
                    <span>Base Deployment:</span>
                    {loading
                        ? <span className="h-4 w-16 animate-pulse rounded bg-blue-200" />
                        : <span className="font-medium">
                            {formatFeeAmount(feeBreakdown.baseFee)}
                            {isFallback && <span className="ml-1 text-xs text-yellow-600">~</span>}
                          </span>
                    }
                </div>

                {hasMetadata && (
                    <div className="flex justify-between text-blue-800">
                        <span>Metadata Upload:</span>
                        {loading
                            ? <span className="h-4 w-16 animate-pulse rounded bg-blue-200" />
                            : <span className="font-medium">
                                +{formatFeeAmount(feeBreakdown.metadataFee)}
                                {isFallback && <span className="ml-1 text-xs text-yellow-600">~</span>}
                              </span>
                        }
                    </div>
                )}

                {!hasMetadata && !loading && (
                    <div className="flex justify-between text-blue-600 text-xs italic">
                        <span>Metadata Upload:</span>
                        <span>+{formatFeeAmount(feeBreakdown.metadataFee)} (if added)</span>
                    </div>
                )}

                <div className="border-t border-blue-300 pt-2 mt-2">
                    <div className="flex justify-between text-blue-900 font-semibold text-base">
                        <span>Total Cost:</span>
                        {loading
                            ? <span className="h-5 w-20 animate-pulse rounded bg-blue-200" />
                            : <span>{formatFeeAmount(feeBreakdown.totalFee)}</span>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
