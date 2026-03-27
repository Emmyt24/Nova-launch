import { useState, useCallback, useEffect, useRef } from 'react';
import { useVaultContract, formatInterval, formatCountdown } from '../../hooks/useVaultContract';
import { CreateRecurringPaymentModal } from '../../components/CreateRecurringPaymentModal';
import { Modal } from '../../components/UI/Modal';
import { Button } from '../../components/UI/Button';
import { EmptyState } from '../../components/UI/EmptyState';
import { Spinner } from '../../components/UI/Spinner';
import { useToast } from '../../hooks/useToast';
import type { 
  RecurringPayment, 
  RecurringPaymentHistory, 
  CreateRecurringPaymentParams,
  RecurringPaymentStatus 
} from '../../types';

// Status badge component with color coding
function StatusBadge({ status }: { status: RecurringPaymentStatus }) {
  const statusConfig = {
    active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
    due: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Due' },
    paused: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Paused' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
  };

  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

// Truncate address for display
function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

// Format date for display
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Progress bar component that updates over time
function ProgressBar({ 
  lastPaymentTime, 
  intervalSeconds, 
  isDue 
}: { 
  lastPaymentTime: number; 
  intervalSeconds: number; 
  isDue: boolean;
}) {
  const [progress, setProgress] = useState(() => {
    const elapsed = Date.now() - lastPaymentTime;
    return Math.min(100, Math.max(0, (elapsed / (intervalSeconds * 1000)) * 100));
  });

  useEffect(() => {
    const updateProgress = () => {
      const elapsed = Date.now() - lastPaymentTime;
      setProgress(Math.min(100, Math.max(0, (elapsed / (intervalSeconds * 1000)) * 100)));
    };

    // Update every minute
    const interval = setInterval(updateProgress, 60000);
    return () => clearInterval(interval);
  }, [lastPaymentTime, intervalSeconds]);

  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-500 ${
          isDue ? 'bg-yellow-500' : 'bg-blue-500'
        }`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// Payment card component
interface PaymentCardProps {
  payment: RecurringPayment;
  onExecute: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onViewHistory: (payment: RecurringPayment) => void;
  isLoading: boolean;
  executingId: string | null;
}

function PaymentCard({
  payment,
  onExecute,
  onCancel,
  onPause,
  onResume,
  onViewHistory,
  isLoading,
  executingId,
}: PaymentCardProps) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const isExecuting = executingId === payment.id;
  const isDue = payment.status === 'due';
  const isPaused = payment.status === 'paused';
  const isCancelled = payment.status === 'cancelled';

  const handleExecute = useCallback(async () => {
    await onExecute(payment.id);
  }, [onExecute, payment.id]);

  const handlePause = useCallback(async () => {
    await onPause(payment.id);
  }, [onPause, payment.id]);

  const handleResume = useCallback(async () => {
    await onResume(payment.id);
  }, [onResume, payment.id]);

  const handleCancelConfirm = useCallback(async () => {
    await onCancel(payment.id);
    setShowConfirmCancel(false);
  }, [onCancel, payment.id]);

  return (
    <div 
      className={`bg-white rounded-xl shadow-sm border-2 transition-all duration-200 hover:shadow-md cursor-pointer ${
        isDue ? 'border-yellow-400 ring-2 ring-yellow-100' : 'border-gray-100'
      }`}
      onClick={() => onViewHistory(payment)}
    >
      {/* Due indicator banner */}
      {isDue && (
        <div className="bg-yellow-50 px-4 py-2 rounded-t-xl border-b border-yellow-100">
          <div className="flex items-center gap-2 text-yellow-800 text-sm font-medium">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Payment Due
          </div>
        </div>
      )}

      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={payment.status} />
              {payment.memo && (
                <span className="text-xs text-gray-500 truncate">{payment.memo}</span>
              )}
            </div>
            <p className="text-sm text-gray-500 font-mono truncate" title={payment.recipient}>
              To: {truncateAddress(payment.recipient)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">
              {payment.amount} {payment.tokenSymbol || 'tokens'}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Interval</span>
            <span className="text-gray-900 font-medium">
              {formatInterval(payment.interval, payment.intervalSeconds)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Next Payment</span>
            <span className={`font-medium ${isDue ? 'text-yellow-700' : 'text-gray-900'}`}>
              {isPaused ? 'Paused' : formatCountdown(payment.nextPaymentTime)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Payments Made</span>
            <span className="text-gray-900 font-medium">{payment.paymentCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total Paid</span>
            <span className="text-gray-900 font-medium">
              {payment.totalPaid} {payment.tokenSymbol || 'tokens'}
            </span>
          </div>
        </div>

        {/* Countdown progress bar for active payments */}
        {!isPaused && !isCancelled && payment.lastPaymentTime && (
          <div className="mb-4">
            <ProgressBar 
              lastPaymentTime={payment.lastPaymentTime}
              intervalSeconds={payment.intervalSeconds}
              isDue={isDue}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
          {isDue && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleExecute}
              loading={isExecuting}
              disabled={isLoading}
              className="flex-1"
            >
              Execute Now
            </Button>
          )}
          {isPaused ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleResume}
              disabled={isLoading}
              className="flex-1"
            >
              Resume
            </Button>
          ) : !isCancelled && !isDue && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePause}
              disabled={isLoading}
              className="flex-1"
            >
              Pause
            </Button>
          )}
          {!isCancelled && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowConfirmCancel(true)}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Cancel confirmation modal */}
      <Modal
        isOpen={showConfirmCancel}
        onClose={() => setShowConfirmCancel(false)}
        title="Cancel Recurring Payment"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowConfirmCancel(false)}>
              Keep Active
            </Button>
            <Button variant="danger" onClick={handleCancelConfirm} loading={isLoading}>
              Cancel Payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
            <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-red-800">
              This will permanently stop all future payments to {truncateAddress(payment.recipient)}.
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Are you sure you want to cancel this recurring payment of <strong>{payment.amount} {payment.tokenSymbol}</strong>?
          </p>
        </div>
      </Modal>
    </div>
  );
}

// Payment history modal
interface PaymentHistoryModalProps {
  payment: RecurringPayment | null;
  isOpen: boolean;
  onClose: () => void;
}

function PaymentHistoryModal({ payment, isOpen, onClose }: PaymentHistoryModalProps) {
  const [history, setHistory] = useState<RecurringPaymentHistory[]>([]);
  const [loading, setHistoryLoading] = useState(false);
  const { getPaymentHistory } = useVaultContract();
  const hasFetchedRef = useRef(false);

  // Fetch history when modal opens
  const fetchHistory = useCallback(async () => {
    if (!payment) return;
    hasFetchedRef.current = true;
    setHistoryLoading(true);
    try {
      const result = await getPaymentHistory(payment.id);
      setHistory(result);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, [payment, getPaymentHistory]);

  useEffect(() => {
    if (isOpen && payment && !hasFetchedRef.current) {
      fetchHistory();
    }
    if (!isOpen) {
      // Reset for next open
      hasFetchedRef.current = false;
    }
  }, [isOpen, payment, fetchHistory]);

  if (!payment) return null;

  // Generate Stellar Expert URL for transaction
  const getStellarExpertUrl = (txHash: string) => {
    return `https://stellar.expert/explorer/public/tx/${txHash}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Payment History"
      size="lg"
    >
      <div className="space-y-4">
        {/* Payment summary */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Recipient</span>
              <p className="font-mono text-gray-900 truncate" title={payment.recipient}>
                {truncateAddress(payment.recipient)}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Amount</span>
              <p className="text-gray-900 font-medium">
                {payment.amount} {payment.tokenSymbol || 'tokens'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Interval</span>
              <p className="text-gray-900">
                {formatInterval(payment.interval, payment.intervalSeconds)}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Total Paid</span>
              <p className="text-gray-900 font-medium">
                {payment.totalPaid} {payment.tokenSymbol || 'tokens'}
              </p>
            </div>
          </div>
        </div>

        {/* History list */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p>No payment history yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.map((item) => (
              <div 
                key={item.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    item.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.amount} {payment.tokenSymbol || 'tokens'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(item.timestamp)}
                    </p>
                  </div>
                </div>
                <a
                  href={getStellarExpertUrl(item.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  View TX
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Empty state icon for no payments
function NoPaymentsIcon() {
  return (
    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={1.5} 
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
      />
    </svg>
  );
}

// Main RecurringPayments component
export default function RecurringPayments() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<RecurringPayment | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  
  const { success, error: showError } = useToast();
  
  const {
    payments,
    loading,
    error,
    getRecurringPayments,
    schedulePayment,
    executeRecurringPayment,
    cancelRecurringPayment,
    pauseRecurringPayment,
    resumeRecurringPayment,
    refreshPayments,
  } = useVaultContract();

  // Fetch payments on mount
  useEffect(() => {
    getRecurringPayments().catch(console.error);
  }, [getRecurringPayments]);

  // Handle create payment
  const handleCreatePayment = useCallback(async (params: CreateRecurringPaymentParams) => {
    try {
      await schedulePayment(params);
      success('Recurring payment created successfully');
      await refreshPayments();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create payment');
      throw err;
    }
  }, [schedulePayment, success, showError, refreshPayments]);

  // Handle execute payment
  const handleExecutePayment = useCallback(async (paymentId: string) => {
    setExecutingId(paymentId);
    try {
      const result = await executeRecurringPayment(paymentId);
      success(`Payment executed successfully. TX: ${result.txHash.slice(0, 8)}...`);
      await refreshPayments();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to execute payment');
    } finally {
      setExecutingId(null);
    }
  }, [executeRecurringPayment, success, showError, refreshPayments]);

  // Handle cancel payment
  const handleCancelPayment = useCallback(async (paymentId: string) => {
    try {
      await cancelRecurringPayment(paymentId);
      success('Recurring payment cancelled');
      await refreshPayments();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to cancel payment');
    }
  }, [cancelRecurringPayment, success, showError, refreshPayments]);

  // Handle pause payment
  const handlePausePayment = useCallback(async (paymentId: string) => {
    try {
      await pauseRecurringPayment(paymentId);
      success('Recurring payment paused');
      await refreshPayments();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to pause payment');
    }
  }, [pauseRecurringPayment, success, showError, refreshPayments]);

  // Handle resume payment
  const handleResumePayment = useCallback(async (paymentId: string) => {
    try {
      await resumeRecurringPayment(paymentId);
      success('Recurring payment resumed');
      await refreshPayments();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to resume payment');
    }
  }, [resumeRecurringPayment, success, showError, refreshPayments]);

  // View payment history
  const handleViewHistory = useCallback((payment: RecurringPayment) => {
    setSelectedPayment(payment);
  }, []);

  // Stats calculation - using a ref to avoid recalculation on every render
  const statsRef = useRef({ active: 0, due: 0, paused: 0, totalMonthly: 0 });
  
  useEffect(() => {
    const active = payments.filter(p => p.status === 'active').length;
    const due = payments.filter(p => p.status === 'due').length;
    const paused = payments.filter(p => p.status === 'paused').length;
    const totalMonthly = payments
      .filter(p => p.status !== 'cancelled' && p.status !== 'paused')
      .reduce((sum, p) => {
        const monthlyAmount = p.interval === 'monthly' 
          ? parseFloat(p.amount)
          : p.interval === 'weekly'
            ? parseFloat(p.amount) * 4
            : p.interval === 'daily'
              ? parseFloat(p.amount) * 30
              : parseFloat(p.amount) * 24 * 30; // hourly
        return sum + monthlyAmount;
      }, 0);

    statsRef.current = { active, due, paused, totalMonthly };
  }, [payments]);

  const stats = statsRef.current;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Recurring Payments
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage your automated payment schedules
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
              className="w-full sm:w-auto"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Payment
              </span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Active</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.active}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Due</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.due}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Paused</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.paused}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Monthly Volume</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {stats.totalMonthly.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && payments.length === 0 && (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        )}

        {/* Empty state */}
        {!loading && payments.length === 0 && (
          <EmptyState
            icon={<NoPaymentsIcon />}
            title="No recurring payments"
            description="Create your first recurring payment to automate your transfers. Perfect for payroll, subscriptions, or regular transfers."
            action={{
              label: 'Create Payment',
              onClick: () => setIsCreateModalOpen(true),
            }}
          />
        )}

        {/* Payment grid */}
        {!loading && payments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Show due payments first */}
            {payments
              .filter(p => p.status === 'due')
              .map(payment => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  onExecute={handleExecutePayment}
                  onCancel={handleCancelPayment}
                  onPause={handlePausePayment}
                  onResume={handleResumePayment}
                  onViewHistory={handleViewHistory}
                  isLoading={loading}
                  executingId={executingId}
                />
              ))}
            {/* Then active payments */}
            {payments
              .filter(p => p.status === 'active')
              .map(payment => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  onExecute={handleExecutePayment}
                  onCancel={handleCancelPayment}
                  onPause={handlePausePayment}
                  onResume={handleResumePayment}
                  onViewHistory={handleViewHistory}
                  isLoading={loading}
                  executingId={executingId}
                />
              ))}
            {/* Then paused payments */}
            {payments
              .filter(p => p.status === 'paused')
              .map(payment => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  onExecute={handleExecutePayment}
                  onCancel={handleCancelPayment}
                  onPause={handlePausePayment}
                  onResume={handleResumePayment}
                  onViewHistory={handleViewHistory}
                  isLoading={loading}
                  executingId={executingId}
                />
              ))}
            {/* Finally cancelled payments */}
            {payments
              .filter(p => p.status === 'cancelled')
              .map(payment => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  onExecute={handleExecutePayment}
                  onCancel={handleCancelPayment}
                  onPause={handlePausePayment}
                  onResume={handleResumePayment}
                  onViewHistory={handleViewHistory}
                  isLoading={loading}
                  executingId={executingId}
                />
              ))}
          </div>
        )}
      </main>

      {/* Create Payment Modal */}
      <CreateRecurringPaymentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreatePayment}
        isLoading={loading}
      />

      {/* Payment History Modal */}
      <PaymentHistoryModal
        payment={selectedPayment}
        isOpen={selectedPayment !== null}
        onClose={() => setSelectedPayment(null)}
      />
    </div>
  );
}
