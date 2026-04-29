/**
 * Buyback Dashboard — Browser-Level E2E Tests
 *
 * Exercises the buyback dashboard UI in jsdom, covering:
 *   1. Loading state (spinner, error banner)
 *   2. Campaign data rendering (metrics, progress, steps)
 *   3. Execute step button interaction (submit → confirm → success / failure)
 *   4. Transaction linking (Stellar Expert URLs)
 *   5. Projection refresh behavior (polling banner, timeout, retry)
 *
 * All network, wallet, and contract dependencies are mocked at the module level.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignDashboard } from '../../components/BuybackCampaign/CampaignDashboard';
import type { BuybackCampaignModel, BuybackStepModel } from '../../types/campaign';

// ── Module-level mocks ─────────────────────────────────────────────────────────

vi.mock('../../hooks/useWallet');
vi.mock('../../hooks/useStellar');
vi.mock('../../services/transactionMonitor');
vi.mock('../../hooks/useProjectionRefresh');
vi.mock('../../services/campaignApi');
vi.mock('../../services/analytics', () => ({
  analytics: { track: vi.fn() },
  AnalyticsEvent: {},
}));

import { useWallet } from '../../hooks/useWallet';
import { useStellar } from '../../hooks/useStellar';
import { TransactionMonitor } from '../../services/transactionMonitor';
import { useProjectionRefresh } from '../../hooks/useProjectionRefresh';

// ── Deterministic fixtures ─────────────────────────────────────────────────────

const MOCK_WALLET_ADDRESS = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TX_HASH_STEP_0 = 'aaa111aaa111aaa111aaa111aaa111aaa111aaa111aaa111aaa111aaa111aaa1';
const TX_HASH_STEP_1 = 'bbb222bbb222bbb222bbb222bbb222bbb222bbb222bbb222bbb222bbb222bbb2';
const TX_HASH_EXEC = 'ccc333ccc333ccc333ccc333ccc333ccc333ccc333ccc333ccc333ccc333ccc3';

const mockSteps: BuybackStepModel[] = [
  { id: 1, stepNumber: 0, amount: '2000', status: 'COMPLETED', executedAt: '2026-01-15T12:30:00Z', txHash: TX_HASH_STEP_0 },
  { id: 2, stepNumber: 1, amount: '2000', status: 'COMPLETED', executedAt: '2026-01-15T13:00:00Z', txHash: TX_HASH_STEP_1 },
  { id: 3, stepNumber: 2, amount: '2000', status: 'PENDING' },
  { id: 4, stepNumber: 3, amount: '2000', status: 'PENDING' },
  { id: 5, stepNumber: 4, amount: '2000', status: 'PENDING' },
];

const mockCampaign: BuybackCampaignModel = {
  id: 1,
  tokenAddress: 'CTESTTOKEN000000000000000000000000000000000000000000000001',
  totalAmount: '10000',
  executedAmount: '4000',
  currentStep: 2,
  totalSteps: 5,
  status: 'ACTIVE',
  createdAt: '2026-01-15T12:00:00Z',
  steps: mockSteps,
  progressPercent: 40,
  isActive: true,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockFetchSuccess(data: BuybackCampaignModel = mockCampaign) {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => data,
  } as Response);
}

function mockFetchFailure(status = 500) {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: false,
    status,
  } as Response);
}

function mockFetchPending() {
  vi.mocked(global.fetch).mockImplementationOnce(() => new Promise(() => {}));
}

// ── Setup ──────────────────────────────────────────────────────────────────────

global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Default: wallet connected
  vi.mocked(useWallet).mockReturnValue({
    wallet: { connected: true, address: MOCK_WALLET_ADDRESS, network: 'testnet' },
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    error: null,
    networkMismatchWarning: null,
  } as any);

  // Default: useStellar with succeeding executeBuybackStep
  vi.mocked(useStellar).mockReturnValue({
    executeBuybackStep: vi.fn().mockResolvedValue({ txHash: TX_HASH_EXEC }),
    getCampaign: vi.fn(),
  });

  // Default: TransactionMonitor immediately succeeds
  vi.mocked(TransactionMonitor).mockImplementation(
    vi.fn().mockImplementation(() => ({
      startMonitoring: vi.fn((_hash: string, onStatus: any) => {
        onStatus({ status: 'success', hash: _hash, timestamp: Date.now() });
      }),
      stopMonitoring: vi.fn(),
    })) as any,
  );

  // Default: projection idle
  vi.mocked(useProjectionRefresh).mockReturnValue({
    status: 'idle',
    attempts: 0,
    retry: vi.fn(),
    elapsedMs: 0,
  });
});

// ── 1. Loading State ──────────────────────────────────────────────────────────

describe('Loading State', () => {
  it('shows a spinner with role="status" while fetch is pending', () => {
    mockFetchPending();
    render(<CampaignDashboard campaignId={1} />);

    const spinner = screen.getByRole('status', { hidden: true });
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('spinner disappears after campaign data resolves', async () => {
    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.queryByRole('status', { hidden: true })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Buyback Campaign #1/i)).toBeInTheDocument();
  });

  it('renders an error banner when fetch rejects', async () => {
    mockFetchFailure(500);
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch campaign/i)).toBeInTheDocument();
    });
  });
});

// ── 2. Campaign Data Rendering ────────────────────────────────────────────────

describe('Campaign Data Rendering', () => {
  beforeEach(() => {
    mockFetchSuccess();
  });

  it('renders campaign title, status badge, and token address', async () => {
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Buyback Campaign #1/i)).toBeInTheDocument();
    });
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText(mockCampaign.tokenAddress)).toBeInTheDocument();
  });

  it('progress bar width matches progressPercent', async () => {
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getByText('40%')).toBeInTheDocument();
    });
    // The progress bar inner div has inline width style
    const progressBar = document.querySelector('.bg-purple-600');
    expect(progressBar).toHaveStyle({ width: '40%' });
  });

  it('renders all steps with correct statuses', async () => {
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getAllByText('COMPLETED')).toHaveLength(2);
      expect(screen.getAllByText('PENDING')).toHaveLength(3);
    });
  });

  it('highlights the current step with "(Current)" label', async () => {
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getByText('(Current)')).toBeInTheDocument();
    });
    // Current step is step 3 (stepNumber 2, displayed as stepNumber + 1)
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });
});

// ── 3. Execute Step Button Interaction ────────────────────────────────────────

describe('Execute Step Button Interaction', () => {
  it('shows "Execute Step N" when idle with wallet connected', async () => {
    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Execute buyback step 3/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Execute Step 3')).toBeInTheDocument();
  });

  it('button is disabled when no wallet is connected', async () => {
    vi.mocked(useWallet).mockReturnValue({
      wallet: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnecting: false,
      error: null,
      networkMismatchWarning: null,
    } as any);

    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Execute buyback step 3/i });
      expect(btn).toBeDisabled();
    });
  });

  it('clicking execute transitions to success state on happy path', async () => {
    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} network="testnet" />);

    await waitFor(() => {
      expect(screen.getByText('Execute Step 3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Execute buyback step 3/i }));

    await waitFor(() => {
      expect(screen.getByText('Executed ✓')).toBeInTheDocument();
    });
    expect(screen.getByText('Transaction Successful!')).toBeInTheDocument();
  });

  it('on tx failure, button shows "Retry" with error message', async () => {
    // Make TransactionMonitor report failure
    vi.mocked(TransactionMonitor).mockImplementation(
      vi.fn().mockImplementation(() => ({
        startMonitoring: vi.fn((_hash: string, onStatus: any) => {
          onStatus({
            status: 'failed',
            hash: _hash,
            timestamp: Date.now(),
            error: 'Slippage exceeded',
          });
        }),
        stopMonitoring: vi.fn(),
      })) as any,
    );

    mockFetchSuccess();
    // Also mock fetchCampaign re-call on error (handleStepError calls fetchCampaign)
    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Execute Step 3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Execute buyback step 3/i }));

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Transaction Failed')).toBeInTheDocument();
    });
  });

  it('button is disabled for completed campaigns', async () => {
    const completedCampaign: BuybackCampaignModel = {
      ...mockCampaign,
      status: 'COMPLETED',
      isActive: false,
    };
    mockFetchSuccess(completedCampaign);
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Buyback Campaign #1/i)).toBeInTheDocument();
    });
    // Execute button should not appear for completed campaigns
    expect(screen.queryByRole('button', { name: /Execute buyback step/i })).not.toBeInTheDocument();
  });
});

// ── 4. Transaction Linking ────────────────────────────────────────────────────

describe('Transaction Linking', () => {
  it('completed steps with txHash render a "View Transaction" link', async () => {
    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} network="testnet" />);

    await waitFor(() => {
      const links = screen.getAllByText('View Transaction');
      expect(links).toHaveLength(2); // Steps 0 and 1 are completed with txHash
    });
  });

  it('link href matches the Stellar Expert testnet URL format', async () => {
    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} network="testnet" />);

    await waitFor(() => {
      const links = screen.getAllByText('View Transaction');
      expect(links[0]).toHaveAttribute(
        'href',
        `https://stellar.expert/explorer/testnet/tx/${TX_HASH_STEP_0}`,
      );
      expect(links[1]).toHaveAttribute(
        'href',
        `https://stellar.expert/explorer/testnet/tx/${TX_HASH_STEP_1}`,
      );
    });
  });

  it('success banner after execution shows the tx hash link', async () => {
    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} network="testnet" />);

    await waitFor(() => {
      expect(screen.getByText('Execute Step 3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Execute buyback step 3/i }));

    await waitFor(() => {
      const link = screen.getByText(/View on Stellar Expert/i);
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute(
        'href',
        `https://stellar.expert/explorer/testnet/tx/${TX_HASH_EXEC}`,
      );
    });
  });
});

// ── 5. Projection Refresh Behavior ────────────────────────────────────────────

describe('Projection Refresh Behavior', () => {
  it('shows "Waiting for backend to index…" when projection is polling', async () => {
    vi.mocked(useProjectionRefresh).mockReturnValue({
      status: 'polling',
      attempts: 2,
      retry: vi.fn(),
      elapsedMs: 6000,
    });

    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Waiting for backend to index the transaction/i),
      ).toBeInTheDocument();
    });
  });

  it('polling banner is absent when projection status is idle', async () => {
    vi.mocked(useProjectionRefresh).mockReturnValue({
      status: 'idle',
      attempts: 0,
      retry: vi.fn(),
      elapsedMs: 0,
    });

    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Buyback Campaign #1/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Waiting for backend to index/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Backend sync timed out/i)).not.toBeInTheDocument();
  });

  it('shows timeout warning with Retry button when projection fails', async () => {
    const mockRetry = vi.fn();
    vi.mocked(useProjectionRefresh).mockReturnValue({
      status: 'failed',
      attempts: 20,
      retry: mockRetry,
      elapsedMs: 60000,
    });

    mockFetchSuccess();
    render(<CampaignDashboard campaignId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Backend sync timed out/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
