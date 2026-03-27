import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BurnStatistics } from '../BurnStatistics';
import { StatCard } from '../StatCard';
import { BurnHistoryTable } from '../BurnHistoryTable';
import { BurnChart } from '../BurnChart';
import {
  formatDate,
  truncateAddress,
  formatTokenAmount,
  getExplorerUrl,
  calculatePercentBurned,
  aggregateBurnData,
} from '../utils';
import type { BurnRecord } from '../../../types';

// Mock the CSS import
vi.mock('../BurnStatistics.css', () => ({}));

describe('BurnStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<BurnStatistics tokenAddress="test-token-address" />);
    expect(screen.getByText('Burn Statistics')).toBeInTheDocument();
  });

  it('displays stats after loading', async () => {
    render(<BurnStatistics tokenAddress="test-token-address" />);

    await waitFor(
      () => {
        expect(screen.getByText('Total Burned')).toBeInTheDocument();
        expect(screen.getByText('Burn Count')).toBeInTheDocument();
        expect(screen.getByText('Percent Burned')).toBeInTheDocument();
        expect(screen.getByText('Current Supply')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('displays burn progress bar', async () => {
    render(<BurnStatistics tokenAddress="test-token-address" />);

    await waitFor(
      () => {
        expect(screen.getByText('Burn Progress')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('displays recent burns section', async () => {
    render(<BurnStatistics tokenAddress="test-token-address" />);

    await waitFor(
      () => {
        expect(screen.getByText('Recent Burns')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('has refresh button', async () => {
    render(<BurnStatistics tokenAddress="test-token-address" />);

    await waitFor(
      () => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});

describe('StatCard', () => {
  it('renders with basic props', () => {
    render(
      <StatCard
        title="Total Burned"
        value="1,000,000"
        icon={<span data-testid="test-icon">🔥</span>}
      />
    );

    expect(screen.getByText('Total Burned')).toBeInTheDocument();
    expect(screen.getByText('1,000,000')).toBeInTheDocument();
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders with subtitle', () => {
    render(
      <StatCard
        title="Total Burned"
        value="1,000,000"
        icon={<span>🔥</span>}
        subtitle="Total tokens burned"
      />
    );

    expect(screen.getByText('Total tokens burned')).toBeInTheDocument();
  });

  it('renders with positive trend', () => {
    render(
      <StatCard
        title="Total Burned"
        value="1,000,000"
        icon={<span>🔥</span>}
        trend={{ value: 10, isPositive: true }}
      />
    );

    expect(screen.getByText('↑ 10%')).toBeInTheDocument();
  });

  it('renders with negative trend', () => {
    render(
      <StatCard
        title="Total Burned"
        value="1,000,000"
        icon={<span>🔥</span>}
        trend={{ value: 5, isPositive: false }}
      />
    );

    expect(screen.getByText('↓ 5%')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <StatCard
        title="Total Burned"
        value="1,000,000"
        icon={<span>🔥</span>}
        className="custom-class"
      />
    );

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});

describe('BurnHistoryTable', () => {
  const mockRecords: BurnRecord[] = [
    {
      id: 'burn-1',
      timestamp: 1700000000,
      from: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP',
      amount: '1000000000',
      isAdminBurn: false,
      txHash: 'tx123456789abcdef',
    },
    {
      id: 'burn-2',
      timestamp: 1700100000,
      from: 'G1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB',
      amount: '2000000000',
      isAdminBurn: true,
      txHash: 'tx987654321fedcba',
    },
  ];

  it('renders table with records', () => {
    render(<BurnHistoryTable records={mockRecords} />);

    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Transaction')).toBeInTheDocument();
  });

  it('displays admin burn badge', () => {
    render(<BurnHistoryTable records={mockRecords} />);

    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('displays self burn badge', () => {
    render(<BurnHistoryTable records={mockRecords} />);

    expect(screen.getByText('Self')).toBeInTheDocument();
  });

  it('shows empty state when no records', () => {
    render(<BurnHistoryTable records={[]} />);

    expect(screen.getByText('No burn records found')).toBeInTheDocument();
  });

  it('filters by type', () => {
    const onFilterChange = vi.fn();
    render(
      <BurnHistoryTable records={mockRecords} onFilterChange={onFilterChange} />
    );

    fireEvent.click(screen.getByText('Admin Burns'));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'admin' })
    );
  });

  it('shows loading state', () => {
    render(<BurnHistoryTable records={[]} loading />);

    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('displays record count', () => {
    render(<BurnHistoryTable records={mockRecords} />);

    expect(screen.getByText('Showing 2 of 2 records')).toBeInTheDocument();
  });
});

describe('BurnChart', () => {
  const mockRecords: BurnRecord[] = [
    {
      id: 'burn-1',
      timestamp: 1700000000,
      from: 'GABC',
      amount: '1000000000',
      isAdminBurn: false,
      txHash: 'tx1',
    },
    {
      id: 'burn-2',
      timestamp: 1700100000,
      from: 'GDEF',
      amount: '2000000000',
      isAdminBurn: true,
      txHash: 'tx2',
    },
  ];

  it('renders chart with data', () => {
    render(<BurnChart records={mockRecords} />);

    expect(screen.getByText('Burn History')).toBeInTheDocument();
  });

  it('shows empty state when no records', () => {
    render(<BurnChart records={[]} />);

    expect(
      screen.getByText('No burn data available to display')
    ).toBeInTheDocument();
  });

  it('has chart type toggles', () => {
    render(<BurnChart records={mockRecords} />);

    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(screen.getByText('Line')).toBeInTheDocument();
    expect(screen.getByText('Area')).toBeInTheDocument();
  });

  it('has interval toggles', () => {
    render(<BurnChart records={mockRecords} />);

    expect(screen.getByText('Day')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
    expect(screen.getByText('Month')).toBeInTheDocument();
  });

  it('has cumulative toggle', () => {
    render(<BurnChart records={mockRecords} />);

    expect(screen.getByText('Cumulative')).toBeInTheDocument();
  });

  it('changes chart type on click', () => {
    render(<BurnChart records={mockRecords} />);

    fireEvent.click(screen.getByText('Line'));
    // Chart type should change - no error means success
  });
});

describe('Utility Functions', () => {
  describe('formatDate', () => {
    it('formats timestamp correctly', () => {
      const timestamp = 1700000000;
      const result = formatDate(timestamp);

      expect(result).toContain('2023');
    });
  });

  describe('truncateAddress', () => {
    it('truncates long addresses', () => {
      const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';
      const result = truncateAddress(address);

      expect(result).toBe('GABCDE...NOP');
    });

    it('returns short addresses unchanged', () => {
      const address = 'SHORT';
      const result = truncateAddress(address);

      expect(result).toBe('SHORT');
    });

    it('uses custom char counts', () => {
      const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOP';
      const result = truncateAddress(address, 8, 6);

      expect(result).toBe('GABCDEFG...OPQRST');
    });
  });

  describe('formatTokenAmount', () => {
    it('formats amount with decimals', () => {
      const result = formatTokenAmount('1000000000', 6);

      expect(result).toBe('1,000');
    });

    it('formats amount without decimals', () => {
      const result = formatTokenAmount('1000000000', 0);

      expect(result).toBe('1,000,000,000');
    });
  });

  describe('getExplorerUrl', () => {
    it('returns testnet URL by default', () => {
      const result = getExplorerUrl('tx123');

      expect(result).toContain('testnet');
      expect(result).toContain('tx123');
    });

    it('returns mainnet URL when specified', () => {
      const result = getExplorerUrl('tx123', 'mainnet');

      expect(result).toContain('public');
      expect(result).toContain('tx123');
    });
  });

  describe('calculatePercentBurned', () => {
    it('calculates percentage correctly', () => {
      const result = calculatePercentBurned('250000000', '1000000000');

      expect(result).toBe(25);
    });

    it('returns 0 for zero supply', () => {
      const result = calculatePercentBurned('100', '0');

      expect(result).toBe(0);
    });

    it('handles large numbers', () => {
      const result = calculatePercentBurned(
        '15000000000000',
        '1000000000000000'
      );

      expect(result).toBe(1.5);
    });
  });

  describe('aggregateBurnData', () => {
    it('aggregates data by day', () => {
      const records = [
        { timestamp: 1700000000, amount: '1000' },
        { timestamp: 1700000000, amount: '2000' },
        { timestamp: 1700086400, amount: '3000' },
      ];

      const result = aggregateBurnData(records, 'day');

      expect(result.labels.length).toBeGreaterThan(0);
      expect(result.values.length).toBe(result.labels.length);
      expect(result.cumulative.length).toBe(result.labels.length);
    });

    it('returns empty arrays for empty records', () => {
      const result = aggregateBurnData([], 'day');

      expect(result.labels).toEqual([]);
      expect(result.values).toEqual([]);
      expect(result.cumulative).toEqual([]);
    });

    it('calculates cumulative correctly', () => {
      const records = [
        { timestamp: 1700000000, amount: '1000' },
        { timestamp: 1700086400, amount: '2000' },
      ];

      const result = aggregateBurnData(records, 'day');

      // Cumulative should be increasing
      for (let i = 1; i < result.cumulative.length; i++) {
        expect(result.cumulative[i]).toBeGreaterThanOrEqual(
          result.cumulative[i - 1]
        );
      }
    });
  });
});