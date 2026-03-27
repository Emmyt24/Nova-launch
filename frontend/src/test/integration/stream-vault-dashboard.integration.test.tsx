import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { StreamDashboard } from '../../components/Streams/StreamDashboard';
import { VaultDashboard } from '../../components/Vaults/VaultDashboard';
import { useWallet } from '../../hooks/useWallet';
import { streamsApi } from '../../services/streamsApi';
import { vaultsApi } from '../../services/vaultsApi';
import { BrowserRouter } from 'react-router-dom';

// Mock hooks and services
vi.mock('../../hooks/useWallet');
vi.mock('../../services/streamsApi');
vi.mock('../../services/vaultsApi');

const mockAddress = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';

describe('Stream and Vault Dashboards Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useWallet as any).mockReturnValue({ wallet: { address: mockAddress }, connected: true });
  });

  describe('StreamDashboard', () => {
    it('renders streams from API', async () => {
      const mockStreams = [
        {
          id: '1',
          streamId: 101,
          creator: mockAddress,
          recipient: 'GRECIPIENT',
          amount: '100',
          status: 'CREATED',
          txHash: 'tx123',
          createdAt: new Date().toISOString(),
        }
      ];

      const mockStats = {
        totalStreams: 1,
        activeStreams: 1,
        claimedVolume: '0',
        cancelledVolume: '0'
      };

      (streamsApi.getByCreator as any).mockResolvedValue(mockStreams);
      (streamsApi.getStats as any).mockResolvedValue(mockStats);

      render(
        <BrowserRouter>
          <StreamDashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('101')).toBeInTheDocument();
        expect(screen.getByText('100 USDC')).toBeInTheDocument();
        expect(screen.getByText('CREATED')).toBeInTheDocument();
      });
    });

    it('shows empty state when no streams exist', async () => {
      (streamsApi.getByCreator as any).mockResolvedValue([]);
      (streamsApi.getStats as any).mockResolvedValue({
        totalStreams: 0,
        activeStreams: 0,
        claimedVolume: '0',
        cancelledVolume: '0'
      });

      render(
        <BrowserRouter>
          <StreamDashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('No streams found for this wallet.')).toBeInTheDocument();
      });
    });
  });

  describe('VaultDashboard', () => {
    it('renders vaults from API', async () => {
      const mockVaults = [
        {
          id: '1',
          streamId: 201,
          creator: mockAddress,
          recipient: 'GRECIPIENT',
          amount: '50',
          status: 'CREATED',
          txHash: 'tx456',
          createdAt: new Date().toISOString(),
        }
      ];

      (vaultsApi.getByCreator as any).mockResolvedValue(mockVaults);

      render(
        <BrowserRouter>
          <VaultDashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('50')).toBeInTheDocument();
        expect(screen.getByText('CREATED')).toBeInTheDocument();
      });
    });
  });
});
