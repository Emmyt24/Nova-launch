import React, { useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';
import { Card } from '../UI/Card';
import { Spinner } from '../UI/Spinner';

/**
 * Time period filter options
 */
type TimePeriod = '7d' | '30d' | '90d' | 'all';

/**
 * Burn record interface
 */
export interface BurnRecord {
  id: string;
  timestamp: number; // Unix timestamp in seconds
  from: string;
  amount: string; // Raw amount as string
  isAdminBurn: boolean;
  txHash: string;
}

/**
 * Aggregated data point for chart
 */
interface ChartDataPoint {
  date: string;
  burnAmount: number;
  cumulativeTotal: number;
  count: number;
  timestamp: number;
}

/**
 * Props for BurnChart component
 */
export interface BurnChartProps {
  records: BurnRecord[];
  decimals?: number;
  symbol?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Format large numbers with compact notation (K, M, B)
 */
function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

/**
 * Format date for display
 */
function formatDate(timestamp: number, period: TimePeriod): string {
  const date = new Date(timestamp * 1000);
  
  if (period === '7d') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  
  if (period === '30d' || period === '90d') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  
  // For 'all', show month/year for longer periods
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/**
 * Aggregate burn data by time period
 */
function aggregateBurnData(
  records: BurnRecord[],
  period: TimePeriod,
  decimals: number
): ChartDataPoint[] {
  if (records.length === 0) return [];

  // Filter records by time period
  const now = Date.now() / 1000;
  const cutoffMap: Record<TimePeriod, number> = {
    '7d': now - 7 * 24 * 60 * 60,
    '30d': now - 30 * 24 * 60 * 60,
    '90d': now - 90 * 24 * 60 * 60,
    'all': 0,
  };

  const filtered = records.filter((r) => r.timestamp >= cutoffMap[period]);
  
  if (filtered.length === 0) return [];

  // Sort by timestamp
  const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);

  // Determine aggregation interval
  const timeRange = now - sorted[0].timestamp;
  const daysRange = timeRange / (24 * 60 * 60);
  
  let intervalSeconds: number;
  if (period === '7d' || daysRange <= 7) {
    intervalSeconds = 24 * 60 * 60; // Daily
  } else if (period === '30d' || daysRange <= 30) {
    intervalSeconds = 24 * 60 * 60; // Daily
  } else if (period === '90d' || daysRange <= 90) {
    intervalSeconds = 7 * 24 * 60 * 60; // Weekly
  } else {
    intervalSeconds = 30 * 24 * 60 * 60; // Monthly
  }

  // Group by interval
  const groups = new Map<number, { amount: bigint; count: number }>();
  
  sorted.forEach((record) => {
    const intervalKey = Math.floor(record.timestamp / intervalSeconds) * intervalSeconds;
    const current = groups.get(intervalKey) || { amount: BigInt(0), count: 0 };
    groups.set(intervalKey, {
      amount: current.amount + BigInt(record.amount),
      count: current.count + 1,
    });
  });

  // Convert to chart data points with cumulative totals
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a - b);
  let cumulativeTotal = 0;
  
  return sortedKeys.map((timestamp) => {
    const group = groups.get(timestamp)!;
    const burnAmount = Number(group.amount) / Math.pow(10, decimals);
    cumulativeTotal += burnAmount;
    
    return {
      date: formatDate(timestamp, period),
      burnAmount,
      cumulativeTotal,
      count: group.count,
      timestamp,
    };
  });
}

/**
 * Custom tooltip component
 */
function CustomTooltip({
  active,
  payload,
  symbol,
}: TooltipProps<number, string> & { symbol: string }) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload as ChartDataPoint;
  const fullDate = new Date(data.timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-2">{fullDate}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-600">Burn Amount:</span>
          <span className="font-medium text-orange-600">
            {data.burnAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} {symbol}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-600">Cumulative Total:</span>
          <span className="font-medium text-purple-600">
            {data.cumulativeTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} {symbol}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-600">Burn Events:</span>
          <span className="font-medium text-gray-900">{data.count}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <svg
        className="w-16 h-16 text-gray-300 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <h3 className="text-lg font-medium text-gray-900 mb-1">No Burn Data Available</h3>
      <p className="text-sm text-gray-500">
        Burn history will appear here once tokens are burned
      </p>
    </div>
  );
}

/**
 * BurnChart Component
 * 
 * Visualizes burn history over time with:
 * - Bar chart for individual burn events
 * - Cumulative line overlay
 * - Time period filters (7d, 30d, 90d, all)
 * - Dynamic aggregation by day/week/month
 * - Responsive design
 * - Loading and empty states
 */
export function BurnChart({
  records,
  decimals = 7,
  symbol = 'TOKEN',
  loading = false,
  className = '',
}: BurnChartProps) {
  const [period, setPeriod] = useState<TimePeriod>('30d');

  // Memoize aggregated data to avoid unnecessary recalculations
  const chartData = useMemo(
    () => aggregateBurnData(records, period, decimals),
    [records, period, decimals]
  );

  // Loading state
  if (loading) {
    return (
      <Card className={className}>
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  // Empty state
  if (records.length === 0) {
    return (
      <Card className={className}>
        <EmptyState />
      </Card>
    );
  }

  // No data for selected period
  if (chartData.length === 0) {
    return (
      <Card className={className}>
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-900">Burn History</h3>
            <div className="flex gap-2">
              {(['7d', '30d', '90d', 'all'] as TimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    period === p
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p === 'all' ? 'All Time' : p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-gray-500">No burn data available for the selected period</p>
          <button
            onClick={() => setPeriod('all')}
            className="mt-4 text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            View all time data
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={className}>
      {/* Header with filters */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-900">Burn History</h3>
          <div className="flex gap-2">
            {(['7d', '30d', '90d', 'all'] as TimePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  period === p
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p === 'all' ? 'All Time' : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              angle={chartData.length > 10 ? -45 : 0}
              textAnchor={chartData.length > 10 ? 'end' : 'middle'}
              height={chartData.length > 10 ? 60 : 30}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickFormatter={formatCompactNumber}
              label={{
                value: `Burn Amount (${symbol})`,
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#6b7280', fontSize: 12 },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickFormatter={formatCompactNumber}
              label={{
                value: `Cumulative (${symbol})`,
                angle: 90,
                position: 'insideRight',
                style: { fill: '#6b7280', fontSize: 12 },
              }}
            />
            <Tooltip content={<CustomTooltip symbol={symbol} />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="rect"
              formatter={(value) => (
                <span className="text-sm text-gray-700">{value}</span>
              )}
            />
            <Bar
              yAxisId="left"
              dataKey="burnAmount"
              fill="#f97316"
              name="Burn Amount"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulativeTotal"
              stroke="#8b5cf6"
              strokeWidth={2}
              name="Cumulative Total"
              dot={{ fill: '#8b5cf6', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Total Burns</p>
            <p className="text-lg font-semibold text-gray-900">
              {chartData.reduce((sum, d) => sum + d.count, 0)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Total Burned</p>
            <p className="text-lg font-semibold text-orange-600">
              {chartData[chartData.length - 1]?.cumulativeTotal.toLocaleString('en-US', {
                maximumFractionDigits: 2,
              })}{' '}
              {symbol}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Average per Burn</p>
            <p className="text-lg font-semibold text-gray-900">
              {(
                chartData.reduce((sum, d) => sum + d.burnAmount, 0) /
                chartData.reduce((sum, d) => sum + d.count, 0)
              ).toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
              {symbol}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default BurnChart;
