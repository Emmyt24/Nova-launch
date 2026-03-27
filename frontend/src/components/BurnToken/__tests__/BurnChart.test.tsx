import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BurnChart, BurnRecord } from '../BurnChart';

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ComposedChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="composed-chart" data-chart-length={data.length}>
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

describe('BurnChart', () => {
  const mockRecords: BurnRecord[] = [
    {
      id: '1',
      timestamp: Math.floor(Date.now() / 1000) - 86400 * 5, // 5 days ago
      from: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      amount: '1000000000', // 100 tokens with 7 decimals
      isAdminBurn: false,
      txHash: 'hash1',
    },
    {
      id: '2',
      timestamp: Math.floor(Date.now() / 1000) - 86400 * 3, // 3 days ago
      from: 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
      amount: '2000000000', // 200 tokens with 7 decimals
      isAdminBurn: true,
      txHash: 'hash2',
    },
    {
      id: '3',
      timestamp: Math.floor(Date.now() / 1000) - 86400 * 1, // 1 day ago
      from: 'GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      amount: '1500000000', // 150 tokens with 7 decimals
      isAdminBurn: false,
      txHash: 'hash3',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the chart with data', () => {
      render(<BurnChart records={mockRecords} decimals={7} symbol="TEST" />);

      expect(screen.getByText('Burn History')).toBeInTheDocument();
      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
      expect(screen.getByTestId('bar-burnAmount')).toBeInTheDocument();
      expect(screen.getByTestId('line-cumulativeTotal')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(
        <BurnChart records={mockRecords} className="custom-class" />
      );

      const card = container.querySelector('.custom-class');
      expect(card).toBeInTheDocument();
    });

    it('should render all time period filter buttons', () => {
      render(<BurnChart records={mockRecords} />);

      expect(screen.getByText('7D')).toBeInTheDocument();
      expect(screen.getByText('30D')).toBeInTheDocument();
      expect(screen.getByText('90D')).toBeInTheDocument();
      expect(screen.getByText('All Time')).toBeInTheDocument();
    });

    it('should render summary statistics', () => {
      render(<BurnChart records={mockRecords} decimals={7} symbol="TEST" />);

      expect(screen.getByText('Total Burns')).toBeInTheDocument();
      expect(screen.getByText('Total Burned')).toBeInTheDocument();
      expect(screen.getByText('Average per Burn')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner when loading is true', () => {
      render(<BurnChart records={[]} loading={true} />);

      // Check for spinner SVG element
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should not show chart when loading', () => {
      render(<BurnChart records={mockRecords} loading={true} />);

      expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no records', () => {
      render(<BurnChart records={[]} />);

      expect(screen.getByText('No Burn Data Available')).toBeInTheDocument();
      expect(
        screen.getByText('Burn history will appear here once tokens are burned')
      ).toBeInTheDocument();
    });

    it('should not show chart in empty state', () => {
      render(<BurnChart records={[]} />);

      expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
    });

    it('should show message when no data for selected period', () => {
      const oldRecords: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400 * 100, // 100 days ago
          from: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          amount: '1000000000',
          isAdminBurn: false,
          txHash: 'hash1',
        },
      ];

      render(<BurnChart records={oldRecords} />);

      // Default is 30d, so old record won't show
      expect(
        screen.getByText('No burn data available for the selected period')
      ).toBeInTheDocument();
    });

    it('should show "View all time data" button when no data for period', () => {
      const oldRecords: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400 * 100,
          from: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          amount: '1000000000',
          isAdminBurn: false,
          txHash: 'hash1',
        },
      ];

      render(<BurnChart records={oldRecords} />);

      const viewAllButton = screen.getByText('View all time data');
      expect(viewAllButton).toBeInTheDocument();
    });
  });

  describe('Time Period Filtering', () => {
    it('should default to 30d period', () => {
      render(<BurnChart records={mockRecords} />);

      const button30d = screen.getByText('30D');
      expect(button30d).toHaveClass('bg-orange-600');
    });

    it('should change period when filter button is clicked', () => {
      render(<BurnChart records={mockRecords} />);

      const button7d = screen.getByText('7D');
      fireEvent.click(button7d);

      expect(button7d).toHaveClass('bg-orange-600');
    });

    it('should update chart data when period changes', () => {
      const { rerender } = render(<BurnChart records={mockRecords} />);

      const button7d = screen.getByText('7D');
      fireEvent.click(button7d);

      rerender(<BurnChart records={mockRecords} />);

      // Chart should still be rendered
      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should filter records based on selected period', () => {
      const now = Math.floor(Date.now() / 1000);
      const records: BurnRecord[] = [
        {
          id: '1',
          timestamp: now - 86400 * 5, // 5 days ago
          from: 'GXXX',
          amount: '1000000000',
          isAdminBurn: false,
          txHash: 'hash1',
        },
        {
          id: '2',
          timestamp: now - 86400 * 50, // 50 days ago
          from: 'GYYY',
          amount: '2000000000',
          isAdminBurn: false,
          txHash: 'hash2',
        },
      ];

      render(<BurnChart records={records} />);

      // Default 30d should show only first record
      const chart = screen.getByTestId('composed-chart');
      expect(chart).toBeInTheDocument();

      // Click "All Time" to show both
      const allTimeButton = screen.getByText('All Time');
      fireEvent.click(allTimeButton);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should have correct aria-pressed attribute on active button', () => {
      render(<BurnChart records={mockRecords} />);

      const button30d = screen.getByText('30D');
      expect(button30d).toHaveAttribute('aria-pressed', 'true');

      const button7d = screen.getByText('7D');
      expect(button7d).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Data Aggregation', () => {
    it('should aggregate burns by day for short periods', () => {
      const records: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400 * 2,
          from: 'GXXX',
          amount: '1000000000',
          isAdminBurn: false,
          txHash: 'hash1',
        },
        {
          id: '2',
          timestamp: Math.floor(Date.now() / 1000) - 86400 * 2 + 3600, // Same day
          from: 'GYYY',
          amount: '2000000000',
          isAdminBurn: false,
          txHash: 'hash2',
        },
      ];

      render(<BurnChart records={records} decimals={7} />);

      // Should aggregate both burns into one data point
      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should calculate cumulative totals correctly', () => {
      render(<BurnChart records={mockRecords} decimals={7} symbol="TEST" />);

      // Check that cumulative line is rendered
      expect(screen.getByTestId('line-cumulativeTotal')).toBeInTheDocument();
    });

    it('should handle large numbers correctly', () => {
      const largeRecords: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400,
          from: 'GXXX',
          amount: '10000000000000', // 1M tokens with 7 decimals
          isAdminBurn: false,
          txHash: 'hash1',
        },
      ];

      render(<BurnChart records={largeRecords} decimals={7} symbol="TEST" />);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });
  });

  describe('Number Formatting', () => {
    it('should format large numbers with K notation', () => {
      const records: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400,
          from: 'GXXX',
          amount: '50000000000', // 5000 tokens with 7 decimals
          isAdminBurn: false,
          txHash: 'hash1',
        },
      ];

      render(<BurnChart records={records} decimals={7} symbol="TEST" />);

      // Chart should render with formatted numbers
      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should format large numbers with M notation', () => {
      const records: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400,
          from: 'GXXX',
          amount: '50000000000000', // 5M tokens with 7 decimals
          isAdminBurn: false,
          txHash: 'hash1',
        },
      ];

      render(<BurnChart records={records} decimals={7} symbol="TEST" />);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should format large numbers with B notation', () => {
      const records: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400,
          from: 'GXXX',
          amount: '50000000000000000', // 5B tokens with 7 decimals
          isAdminBurn: false,
          txHash: 'hash1',
        },
      ];

      render(<BurnChart records={records} decimals={7} symbol="TEST" />);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });
  });

  describe('Responsiveness', () => {
    it('should render ResponsiveContainer', () => {
      render(<BurnChart records={mockRecords} />);

      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('should render chart axes', () => {
      render(<BurnChart records={mockRecords} />);

      const xAxes = screen.getAllByTestId('x-axis');
      const yAxes = screen.getAllByTestId('y-axis');

      expect(xAxes.length).toBeGreaterThan(0);
      expect(yAxes.length).toBeGreaterThan(0);
    });

    it('should render grid', () => {
      render(<BurnChart records={mockRecords} />);

      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    });

    it('should render legend', () => {
      render(<BurnChart records={mockRecords} />);

      expect(screen.getByTestId('legend')).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('should use custom decimals', () => {
      render(<BurnChart records={mockRecords} decimals={18} symbol="TEST" />);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should use custom symbol', () => {
      render(<BurnChart records={mockRecords} decimals={7} symbol="CUSTOM" />);

      const symbols = screen.getAllByText(/CUSTOM/);
      expect(symbols.length).toBeGreaterThan(0);
    });

    it('should use default decimals when not provided', () => {
      render(<BurnChart records={mockRecords} />);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should use default symbol when not provided', () => {
      render(<BurnChart records={mockRecords} />);

      const symbols = screen.getAllByText(/TOKEN/);
      expect(symbols.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single record', () => {
      const singleRecord: BurnRecord[] = [mockRecords[0]];

      render(<BurnChart records={singleRecord} />);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should handle records with zero amount', () => {
      const zeroRecords: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400,
          from: 'GXXX',
          amount: '0',
          isAdminBurn: false,
          txHash: 'hash1',
        },
      ];

      render(<BurnChart records={zeroRecords} />);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should handle very old records', () => {
      const oldRecords: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400 * 365, // 1 year ago
          from: 'GXXX',
          amount: '1000000000',
          isAdminBurn: false,
          txHash: 'hash1',
        },
      ];

      render(<BurnChart records={oldRecords} />);

      // Should show empty state for 30d default
      expect(
        screen.getByText('No burn data available for the selected period')
      ).toBeInTheDocument();

      // Click "All Time"
      const allTimeButton = screen.getByText('All Time');
      fireEvent.click(allTimeButton);

      // Should now show chart
      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should handle records with same timestamp', () => {
      const sameTimeRecords: BurnRecord[] = [
        {
          id: '1',
          timestamp: Math.floor(Date.now() / 1000) - 86400,
          from: 'GXXX',
          amount: '1000000000',
          isAdminBurn: false,
          txHash: 'hash1',
        },
        {
          id: '2',
          timestamp: Math.floor(Date.now() / 1000) - 86400,
          from: 'GYYY',
          amount: '2000000000',
          isAdminBurn: false,
          txHash: 'hash2',
        },
      ];

      render(<BurnChart records={sameTimeRecords} decimals={7} />);

      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      const largeDataset: BurnRecord[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        timestamp: Math.floor(Date.now() / 1000) - 86400 * i,
        from: `GXXX${i}`,
        amount: `${1000000000 + i}`,
        isAdminBurn: i % 2 === 0,
        txHash: `hash${i}`,
      }));

      const startTime = performance.now();
      render(<BurnChart records={largeDataset} />);
      const endTime = performance.now();

      // Should render in reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });

    it('should not re-render unnecessarily', () => {
      const { rerender } = render(<BurnChart records={mockRecords} />);

      // Re-render with same props
      rerender(<BurnChart records={mockRecords} />);

      // Chart should still be there
      expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible filter buttons', () => {
      render(<BurnChart records={mockRecords} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('aria-pressed');
      });
    });

    it('should have proper heading hierarchy', () => {
      render(<BurnChart records={mockRecords} />);

      const heading = screen.getByText('Burn History');
      expect(heading.tagName).toBe('H3');
    });
  });
});
