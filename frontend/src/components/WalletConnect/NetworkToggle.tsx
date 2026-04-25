import { useCallback } from 'react';

type Network = 'testnet' | 'mainnet';

interface NetworkToggleProps {
    network: Network;
    onNetworkChange: (network: Network) => void;
    disabled?: boolean;
    className?: string;
    /** Warning message shown when the wallet network doesn't match the app config. */
    mismatchWarning?: string | null;
}

export function NetworkToggle({
    network,
    onNetworkChange,
    disabled = false,
    className = '',
    mismatchWarning,
}: NetworkToggleProps) {
    const isMainnet = network === 'mainnet';

    const handleToggle = useCallback(() => {
        if (disabled) return;
        onNetworkChange(isMainnet ? 'testnet' : 'mainnet');
    }, [disabled, isMainnet, onNetworkChange]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggle();
            }
        },
        [handleToggle]
    );

    return (
        <div
            className={`flex items-center gap-2 ${className}`}
            role="region"
            aria-label="Network selection"
        >
            {/* Testnet warning badge */}
            {!isMainnet && (
                <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200"
                    aria-label="Testnet mode active"
                >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    Test
                </span>
            )}

            {/* Toggle switch */}
            <div className="flex items-center gap-1.5">
                <span
                    className={`text-xs font-medium transition-colors ${
                        !isMainnet ? 'text-amber-700' : 'text-gray-400'
                    }`}
                    id="testnet-label"
                >
                    Testnet
                </span>

                <button
                    type="button"
                    role="switch"
                    aria-checked={isMainnet}
                    aria-label={`Switch to ${isMainnet ? 'testnet' : 'mainnet'}`}
                    aria-describedby={isMainnet ? 'mainnet-label' : 'testnet-label'}
                    disabled={disabled}
                    onClick={handleToggle}
                    onKeyDown={handleKeyDown}
                    className={`
                        relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                        transition-colors duration-200 ease-in-out
                        focus:outline-none focus:ring-2 focus:ring-offset-2
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${isMainnet
                            ? 'bg-green-500 focus:ring-green-400'
                            : 'bg-amber-400 focus:ring-amber-300'
                        }
                    `}
                >
                    <span
                        className={`
                            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0
                            transition duration-200 ease-in-out
                            ${isMainnet ? 'translate-x-5' : 'translate-x-0'}
                        `}
                    />
                </button>

                <span
                    className={`text-xs font-medium transition-colors ${
                        isMainnet ? 'text-green-700' : 'text-gray-400'
                    }`}
                    id="mainnet-label"
                >
                    Mainnet
                </span>
            </div>

            {/* Mainnet active indicator */}
            {isMainnet && (
                <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200"
                    aria-label="Mainnet mode active"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    Live
                </span>
            )}

            {/* Network / contract mismatch warning — blocks mutations */}
            {mismatchWarning && (
                <span
                    role="alert"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300"
                    aria-live="assertive"
                >
                    <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    {mismatchWarning}
                </span>
            )}
        </div>
    );
}
