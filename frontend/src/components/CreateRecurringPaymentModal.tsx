import React, { useState, useCallback, useMemo } from 'react';
import { Modal } from './UI/Modal';
import { Button } from './UI/Button';
import { Input } from './UI/Input';
import type { PaymentInterval, CreateRecurringPaymentParams } from '../types';

// Interval presets in seconds
const INTERVAL_PRESETS: Record<Exclude<PaymentInterval, 'custom'>, number> = {
  hourly: 60 * 60,
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
};

const INTERVAL_LABELS: Record<PaymentInterval, string> = {
  hourly: 'Every Hour',
  daily: 'Every Day',
  weekly: 'Every Week',
  monthly: 'Every Month',
  custom: 'Custom',
};

interface CreateRecurringPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: CreateRecurringPaymentParams) => Promise<void>;
  isLoading?: boolean;
  defaultTokenAddress?: string;
}

interface FormErrors {
  recipient?: string;
  amount?: string;
  tokenAddress?: string;
  customInterval?: string;
}

export function CreateRecurringPaymentModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  defaultTokenAddress = '',
}: CreateRecurringPaymentModalProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [tokenAddress, setTokenAddress] = useState(defaultTokenAddress);
  const [memo, setMemo] = useState('');
  const [interval, setInterval] = useState<PaymentInterval>('monthly');
  const [customIntervalHours, setCustomIntervalHours] = useState('24');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Calculate next payment preview
  const nextPaymentPreview = useMemo(() => {
    const intervalSeconds = interval === 'custom' 
      ? parseFloat(customIntervalHours) * 60 * 60 
      : INTERVAL_PRESETS[interval];
    
    if (isNaN(intervalSeconds) || intervalSeconds <= 0) {
      return null;
    }

    // Use a fixed reference time to avoid impure Date.now() in useMemo
    const baseTime = new Date();
    baseTime.setSeconds(baseTime.getSeconds() + intervalSeconds);
    return baseTime;
  }, [interval, customIntervalHours]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Validate recipient address (Stellar public key is 56 characters)
    if (!recipient.trim()) {
      newErrors.recipient = 'Recipient address is required';
    } else if (recipient.length !== 56 || !recipient.startsWith('G')) {
      newErrors.recipient = 'Invalid Stellar address (must start with G and be 56 characters)';
    }

    // Validate amount
    if (!amount.trim()) {
      newErrors.amount = 'Amount is required';
    } else if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      newErrors.amount = 'Amount must be a positive number';
    }

    // Validate token address
    if (!tokenAddress.trim()) {
      newErrors.tokenAddress = 'Token address is required';
    }

    // Validate custom interval
    if (interval === 'custom') {
      const hours = parseFloat(customIntervalHours);
      if (isNaN(hours) || hours <= 0) {
        newErrors.customInterval = 'Custom interval must be a positive number';
      } else if (hours < 1) {
        newErrors.customInterval = 'Minimum interval is 1 hour';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [recipient, amount, tokenAddress, interval, customIntervalHours]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      return;
    }

    try {
      const params: CreateRecurringPaymentParams = {
        recipient: recipient.trim(),
        amount: amount.trim(),
        tokenAddress: tokenAddress.trim(),
        memo: memo.trim() || undefined,
        interval,
        customIntervalSeconds: interval === 'custom' 
          ? parseFloat(customIntervalHours) * 60 * 60 
          : undefined,
      };

      await onSubmit(params);
      
      // Reset form on success
      setRecipient('');
      setAmount('');
      setTokenAddress(defaultTokenAddress);
      setMemo('');
      setInterval('monthly');
      setCustomIntervalHours('24');
      setErrors({});
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create recurring payment');
    }
  }, [validateForm, recipient, amount, tokenAddress, memo, interval, customIntervalHours, onSubmit, onClose, defaultTokenAddress]);

  // Handle modal close
  const handleClose = useCallback(() => {
    if (!isLoading) {
      setErrors({});
      setSubmitError(null);
      onClose();
    }
  }, [isLoading, onClose]);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setRecipient('');
      setAmount('');
      setTokenAddress(defaultTokenAddress);
      setMemo('');
      setInterval('monthly');
      setCustomIntervalHours('24');
      setErrors({});
      setSubmitError(null);
    }
  }, [isOpen, defaultTokenAddress]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Recurring Payment"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit} 
            loading={isLoading}
            disabled={isLoading}
          >
            Create Payment
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Submit Error */}
        {submitError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {submitError}
          </div>
        )}

        {/* Recipient Address */}
        <div>
          <label htmlFor="recipient" className="block text-sm font-medium text-gray-700 mb-1">
            Recipient Address
          </label>
          <Input
            id="recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="G..."
            className={errors.recipient ? 'border-red-500' : ''}
            disabled={isLoading}
          />
          {errors.recipient && (
            <p className="mt-1 text-sm text-red-600">{errors.recipient}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Enter a valid Stellar public key (starts with G)
          </p>
        </div>

        {/* Amount */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
            Amount
          </label>
          <Input
            id="amount"
            type="number"
            step="0.0000001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={errors.amount ? 'border-red-500' : ''}
            disabled={isLoading}
          />
          {errors.amount && (
            <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
          )}
        </div>

        {/* Token Address */}
        <div>
          <label htmlFor="tokenAddress" className="block text-sm font-medium text-gray-700 mb-1">
            Token Address
          </label>
          <Input
            id="tokenAddress"
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="Token contract address"
            className={errors.tokenAddress ? 'border-red-500' : ''}
            disabled={isLoading}
          />
          {errors.tokenAddress && (
            <p className="mt-1 text-sm text-red-600">{errors.tokenAddress}</p>
          )}
        </div>

        {/* Memo (Optional) */}
        <div>
          <label htmlFor="memo" className="block text-sm font-medium text-gray-700 mb-1">
            Memo <span className="text-gray-400">(optional)</span>
          </label>
          <Input
            id="memo"
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Payment description or reference"
            disabled={isLoading}
          />
        </div>

        {/* Payment Interval */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Interval
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(INTERVAL_LABELS) as PaymentInterval[]).map((int) => (
              <button
                key={int}
                type="button"
                onClick={() => setInterval(int)}
                disabled={isLoading}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${interval === int
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {INTERVAL_LABELS[int]}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Interval Input */}
        {interval === 'custom' && (
          <div>
            <label htmlFor="customInterval" className="block text-sm font-medium text-gray-700 mb-1">
              Custom Interval (hours)
            </label>
            <Input
              id="customInterval"
              type="number"
              min="1"
              step="1"
              value={customIntervalHours}
              onChange={(e) => setCustomIntervalHours(e.target.value)}
              placeholder="24"
              className={errors.customInterval ? 'border-red-500' : ''}
              disabled={isLoading}
            />
            {errors.customInterval && (
              <p className="mt-1 text-sm text-red-600">{errors.customInterval}</p>
            )}
          </div>
        )}

        {/* Next Payment Preview */}
        {nextPaymentPreview && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Next payment:</span>{' '}
              {nextPaymentPreview.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-2">
          <h4 className="font-medium text-gray-900">Payment Summary</h4>
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              <span className="font-medium">Amount:</span> {amount || '0.00'} tokens
            </p>
            <p>
              <span className="font-medium">Interval:</span> {INTERVAL_LABELS[interval]}
              {interval === 'custom' && ` (${customIntervalHours} hours)`}
            </p>
            <p>
              <span className="font-medium">Recipient:</span>{' '}
              {recipient ? `${recipient.slice(0, 8)}...${recipient.slice(-8)}` : 'Not specified'}
            </p>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default CreateRecurringPaymentModal;