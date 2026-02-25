import { Tooltip } from '../UI/Tooltip';
import { formatXLM } from '../../utils/formatting';

interface FeeBreakdownProps {
    baseFee: number;
    metadataFee?: number;
    currency?: 'XLM' | 'USD';
    xlmToUsdRate?: number;
    className?: string;
}

interface FeeRowProps {
    label: string;
    amount: number;
    tooltip: string;
    isTotal?: boolean;
    formatAmount: (amount: number) => string;
}

function FeeRow({ label, amount, tooltip, isTotal = false, formatAmount }: FeeRowProps) {
    return (
        <div
            className={`flex justify-between items-center py-2 ${
                isTotal ? 'border-t-2 border-gray-300 pt-3 mt-2 font-semibold text-gray-900' : 'text-gray-700'
            }`}
        >
            <div className="flex items-center gap-2">
                <span className={isTotal ? 'text-base' : 'text-sm'}>{label}</span>
                <Tooltip content={tooltip} position="right">
                    <svg
                        className="w-4 h-4 text-gray-400 cursor-help"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-label="More information"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </Tooltip>
            </div>
            <span className={isTotal ? 'text-base' : 'text-sm'}>{formatAmount(amount)}</span>
        </div>
    );
}

export function FeeBreakdown({
    baseFee,
    metadataFee = 0,
    currency = 'XLM',
    xlmToUsdRate,
    className = '',
}: FeeBreakdownProps) {
    const totalFee = baseFee + metadataFee;

    const formatAmount = (amount: number): string => {
        if (currency === 'USD' && xlmToUsdRate) {
            return `$${(amount * xlmToUsdRate).toFixed(2)}`;
        }
        return `${formatXLM(amount)} XLM`;
    };

    return (
        <div className={`bg-gray-50 rounded-lg p-4 border border-gray-200 ${className}`}>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Fee Breakdown</h3>

            <div className="space-y-1">
                <FeeRow
                    label="Base Fee"
                    amount={baseFee}
                    tooltip="Network transaction fee required to deploy the token contract on Stellar"
                    formatAmount={formatAmount}
                />

                {metadataFee > 0 && (
                    <FeeRow
                        label="Metadata Fee"
                        amount={metadataFee}
                        tooltip="Additional fee for storing token metadata (image and description) on IPFS"
                        formatAmount={formatAmount}
                    />
                )}

                <FeeRow
                    label="Total Fee"
                    amount={totalFee}
                    tooltip="Total cost to deploy your token including all fees"
                    isTotal
                    formatAmount={formatAmount}
                />
            </div>

            {currency === 'XLM' && xlmToUsdRate !== undefined && xlmToUsdRate !== null && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500 text-center">
                        ≈ ${(totalFee * xlmToUsdRate).toFixed(2)} USD
                    </p>
                </div>
            )}
        </div>
    );
}
