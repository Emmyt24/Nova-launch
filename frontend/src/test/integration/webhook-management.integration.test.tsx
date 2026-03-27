import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookManager } from '../../components/Webhooks/WebhookManager';
import { WebhookEventType } from '../../services/webhookApi';

// Mock the hooks and services
vi.mock('../../hooks/useWallet', () => ({
  useWallet: () => ({
    wallet: {
      connected: true,
      address: 'G_TEST_WALLET_123',
      network: 'testnet' as const,
    },
  }),
}));

// Mock fetch for API calls
globalThis.fetch = vi.fn() as any;

const mockSubscriptions = [
  {
    id: 'sub-1',
    url: 'https://api.test.com/webhook1',
    events: [WebhookEventType.TOKEN_BURN_SELF],
    active: true,
    createdBy: 'G_TEST_WALLET_123',
    secret: 'secret12...',
    createdAt: new Date().toISOString(),
    lastTriggered: null,
  },
  {
    id: 'sub-2',
    url: 'https://api.test.com/webhook2',
    events: [WebhookEventType.TOKEN_CREATED, WebhookEventType.TOKEN_METADATA_UPDATED],
    active: false,
    createdBy: 'G_TEST_WALLET_123',
    secret: 'secret34...',
    createdAt: new Date().toISOString(),
    lastTriggered: new Date().toISOString(),
  }
];

const mockLogs = [
  {
    id: 'log-1',
    subscriptionId: 'sub-1',
    event: WebhookEventType.TOKEN_BURN_SELF,
    success: true,
    statusCode: 200,
    attempts: 1,
    createdAt: new Date().toISOString(),
    errorMessage: null,
  }
];

describe('Webhook Management Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis.fetch as any).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should list existing webhook subscriptions', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockSubscriptions }),
    });

    render(<WebhookManager />);

    expect(screen.getByText('Webhook Management')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('https://api.test.com/webhook1')).toBeInTheDocument();
      expect(screen.getByText('https://api.test.com/webhook2')).toBeInTheDocument();
    });

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('should show the creation form when clicking "Create New Webhook"', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockSubscriptions }),
    });

    const user = userEvent.setup();
    render(<WebhookManager />);

    const createButton = screen.getByText('Create New Webhook');
    await user.click(createButton);

    expect(screen.getByText('Create Webhook Subscription')).toBeInTheDocument();
    expect(screen.getByLabelText(/Webhook URL/i)).toBeInTheDocument();
    expect(screen.getByText('Token Burn (Self)')).toBeInTheDocument();
  });

  it('should create a new subscription successfully', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockSubscriptions }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          success: true, 
          data: { ...mockSubscriptions[0], id: 'sub-new', url: 'https://new.url' } 
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [...mockSubscriptions, { id: 'sub-new', url: 'https://new.url', active: true, events: [WebhookEventType.TOKEN_BURN_SELF], createdBy: 'G_TEST_WALLET_123', secret: 'abc...', createdAt: new Date().toISOString() }] }),
      });

    const user = userEvent.setup();
    render(<WebhookManager />);

    await user.click(screen.getByText('Create New Webhook'));

    const urlInput = screen.getByLabelText(/Webhook URL/i);
    await user.type(urlInput, 'https://new.url');

    const eventOption = screen.getByText('Token Burn (Self)');
    await user.click(eventOption);

    const submitButton = screen.getByText('Create Subscription');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('https://new.url')).toBeInTheDocument();
    });
  });

  it('should toggle subscription status', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockSubscriptions }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Updated' }),
      });

    const user = userEvent.setup();
    render(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText('https://api.test.com/webhook1')).toBeInTheDocument();
    });

    const disableButton = screen.getByRole('button', { name: 'Disable' });
    await user.click(disableButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/webhooks/sub-1/toggle'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  it('should delete a subscription after confirmation', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockSubscriptions }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Deleted' }),
      });

    const user = userEvent.setup();
    render(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText('https://api.test.com/webhook1')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    expect(screen.getByText('Delete Webhook Subscription')).toBeInTheDocument();
    
    const confirmDelete = screen.getByRole('button', { name: 'Delete' }); // In the dialog
    await user.click(confirmDelete);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/webhooks/unsubscribe/sub-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('should show delivery logs in a modal', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockSubscriptions }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockLogs }),
      });

    const user = userEvent.setup();
    render(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText('https://api.test.com/webhook1')).toBeInTheDocument();
    });

    const viewLogsButton = screen.getAllByText('View Delivery Logs')[0];
    await user.click(viewLogsButton);

    await waitFor(() => {
      expect(screen.getByText('Webhook Delivery Logs')).toBeInTheDocument();
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText('token.burn.self')).toBeInTheDocument();
    });
  });
});
