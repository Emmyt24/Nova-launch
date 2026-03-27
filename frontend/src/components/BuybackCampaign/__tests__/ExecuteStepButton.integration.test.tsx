import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExecuteStepButton } from '../ExecuteStepButton';
import * as useStellarHook from '../../../hooks/useStellar';
import * as useWalletHook from '../../../hooks/useWallet';

vi.mock('../../../hooks/useStellar');
vi.mock('../../../hooks/useWallet');

// Shared mutable callbacks so tests can control when the monitor fires
let capturedOnStatus: ((u: { hash: string; status: string; timestamp: number; error?: string }) => void) | null = null;

vi.mock('../../../services/transactionMonitor', () => {
  return {
    TransactionMonitor: function MockTransactionMonitor() {
      return {
        startMonitoring: function (_hash: string, onStatus: typeof capturedOnStatus) {
          capturedOnStatus = onStatus;
        },
        stopMonitoring: vi.fn(),
        destroy: vi.fn(),
      };
    },
  };
});

const mockWallet = { address: 'GTEST123456789', isConnected: true };
const mockExecuteBuybackStep = vi.fn();

const defaultProps = {
  campaignId: 1,
  currentStep: 0,
  stepAmount: '2000',
  status: 'ACTIVE' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnStatus = null;
  vi.mocked(useStellarHook.useStellar).mockReturnValue({
    executeBuybackStep: mockExecuteBuybackStep,
    getCampaign: vi.fn(),
  });
  vi.mocked(useWalletHook.useWallet).mockReturnValue({
    wallet: mockWallet,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    error: null,
  });
});

function fireMonitor(status: 'success' | 'failed' | 'timeout', hash: string) {
  capturedOnStatus?.({ hash, status, timestamp: Date.now() });
}

describe('ExecuteStepButton integration', () => {
  it('submits wallet transaction and confirms via monitor', async () => {
    const hash = 'abc123';
    mockExecuteBuybackStep.mockResolvedValue({ txHash: hash });
    const onSuccess = vi.fn();

    render(<ExecuteStepButton {...defaultProps} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button'));

    // Wait for monitor to be registered (after submit resolves)
    await waitFor(() => expect(capturedOnStatus).not.toBeNull());
    fireMonitor('success', hash);

    await waitFor(() => expect(screen.getByText(/transaction successful/i)).toBeInTheDocument());
    expect(mockExecuteBuybackStep).toHaveBeenCalledWith(1, mockWallet.address);
    expect(onSuccess).toHaveBeenCalledWith(hash);
  });

  it('locks button during pending state (no double-submit)', async () => {
    let resolveStep!: (v: { txHash: string }) => void;
    mockExecuteBuybackStep.mockReturnValue(new Promise((r) => { resolveStep = r; }));

    render(<ExecuteStepButton {...defaultProps} />);
    const btn = screen.getByRole('button');

    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(btn).toBeDisabled();

    resolveStep({ txHash: 'xyz' });
    await waitFor(() => expect(capturedOnStatus).not.toBeNull());
    fireMonitor('success', 'xyz');

    await waitFor(() => expect(screen.getByText(/transaction successful/i)).toBeInTheDocument());
    expect(mockExecuteBuybackStep).toHaveBeenCalledTimes(1);
  });

  it('shows confirming state between submit and monitor resolution', async () => {
    mockExecuteBuybackStep.mockResolvedValue({ txHash: 'hash1' });

    render(<ExecuteStepButton {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText(/processing transaction/i)).toBeInTheDocument());

    fireMonitor('success', 'hash1');
    await waitFor(() => expect(screen.getByText(/transaction successful/i)).toBeInTheDocument());
  });

  it('surfaces tx hash explorer link on success', async () => {
    const hash = 'deadbeef1234';
    mockExecuteBuybackStep.mockResolvedValue({ txHash: hash });

    render(<ExecuteStepButton {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(capturedOnStatus).not.toBeNull());
    fireMonitor('success', hash);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /view on stellar expert/i });
      expect(link).toHaveAttribute('href', `https://stellar.expert/explorer/testnet/tx/${hash}`);
    });
  });

  it('shows actionable error and allows retry on monitor failure', async () => {
    const hash = 'failhash';
    mockExecuteBuybackStep.mockResolvedValue({ txHash: hash });
    const onError = vi.fn();

    render(<ExecuteStepButton {...defaultProps} onError={onError} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(capturedOnStatus).not.toBeNull());
    fireMonitor('failed', hash);

    await waitFor(() => expect(screen.getAllByText(/transaction failed/i).length).toBeGreaterThan(0));
    expect(onError).toHaveBeenCalled();

    // Retry
    capturedOnStatus = null;
    mockExecuteBuybackStep.mockResolvedValue({ txHash: 'retry-hash' });
    fireEvent.click(screen.getByRole('button', { name: /execute buyback step 1/i }));

    await waitFor(() => expect(capturedOnStatus).not.toBeNull());
    fireMonitor('success', 'retry-hash');

    await waitFor(() => expect(screen.getByText(/transaction successful/i)).toBeInTheDocument());
  });

  it('shows actionable error when submit itself fails', async () => {
    mockExecuteBuybackStep.mockRejectedValue(new Error('Wallet rejected'));

    render(<ExecuteStepButton {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText(/wallet rejected/i)).toBeInTheDocument());
  });
});
