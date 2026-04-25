import React, { useRef, useState } from 'react';
import { useStellar } from '../../hooks/useStellar';
import { useWallet } from '../../hooks/useWallet';
import { TransactionMonitor } from '../../services/transactionMonitor';

interface ExecuteStepButtonProps {
  campaignId: number;
  currentStep: number;
  stepAmount: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  onSuccess?: (txHash: string) => void;
  onError?: (error: Error) => void;
}

type TxState = 'idle' | 'submitting' | 'confirming' | 'success' | 'failure';

export const ExecuteStepButton: React.FC<ExecuteStepButtonProps> = ({
  campaignId,
  currentStep,
  stepAmount,
  status,
  onSuccess,
  onError,
}) => {
  const { wallet } = useWallet();
  const { executeBuybackStep } = useStellar();
  const [txState, setTxState] = useState<TxState>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const isPending = txState === 'submitting' || txState === 'confirming';
  const isDisabled = !wallet || status !== 'ACTIVE' || isPending || txState === 'success';

  const handleExecute = async () => {
    if (inFlight.current || isDisabled || !wallet) return;
    inFlight.current = true;

    try {
      setTxState('submitting');
      setError(null);
      setTxHash(null);

      const { txHash: hash } = await executeBuybackStep(campaignId, wallet.address);
      setTxHash(hash);
      setTxState('confirming');

      await new Promise<void>((resolve, reject) => {
        const monitor = new TransactionMonitor();
        monitor.startMonitoring(
          hash,
          (update) => {
            if (update.status === 'success') {
              monitor.stopMonitoring(hash);
              resolve();
            } else if (update.status === 'failed' || update.status === 'timeout') {
              monitor.stopMonitoring(hash);
              reject(new Error(`Transaction ${update.status}: ${update.error ?? ''}`));
            }
          },
          (err) => {
            monitor.stopMonitoring(hash);
            reject(err);
          }
        );
      });

      setTxState('success');
      onSuccess?.(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setError(msg);
      setTxState('failure');
      if (err instanceof Error) onError?.(err);
    } finally {
      inFlight.current = false;
    }
  };

  const buttonLabel =
    txState === 'submitting' ? 'Submitting...' :
    txState === 'confirming' ? 'Confirming...' :
    txState === 'success'    ? 'Executed ✓' :
    txState === 'failure'    ? 'Retry' :
    `Execute Step ${currentStep + 1}`;

  const buttonClass = [
    'px-6 py-3 rounded-lg font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
    isDisabled                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' :
    isPending                 ? 'bg-blue-500 text-white cursor-wait' :
    txState === 'success'     ? 'bg-green-500 text-white' :
    txState === 'failure'     ? 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500' :
                                'bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500',
  ].join(' ');

  return (
    <div className="space-y-4">
      <button
        onClick={handleExecute}
        disabled={isDisabled}
        className={buttonClass}
        aria-label={`Execute buyback step ${currentStep + 1}`}
      >
        {isPending && <span className="inline-block mr-2 animate-spin">⏳</span>}
        {buttonLabel}
      </button>

      {isPending && (
        <div className="text-sm text-gray-600 animate-pulse">
          {txState === 'submitting' ? 'Submitting transaction...' : 'Processing transaction...'}
        </div>
      )}

      {txState === 'success' && txHash && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800 mb-2">Transaction Successful!</p>
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
          >
            View on Stellar Expert: {txHash.slice(0, 16)}...
          </a>
        </div>
      )}

      {txState === 'failure' && error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800 mb-1">Transaction Failed</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {status !== 'ACTIVE' && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-600">
            Campaign is {status.toLowerCase()}. Cannot execute steps.
          </p>
        </div>
      )}
    </div>
  );
};
