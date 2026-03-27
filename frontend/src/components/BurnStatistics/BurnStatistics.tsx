import React, { useState, useEffect, useCallback } from 'react';
import { Flame, Hash, Percent, Coins, RefreshCw, AlertCircle } from 'lucide-react';
import type { BurnStats, BurnRecord, BurnHistoryFilter } from '../../types';
import { StatCard, StatCardSkeleton } from './StatCard';
import { BurnHistoryTable } from './BurnHistoryTable';
import { BurnChart, BurnChartSkeleton } from './BurnChart';
import { formatTokenAmount, calculatePercentBurned } from './utils';
import './BurnStatistics.css';

interface BurnStatisticsProps {
  tokenAddress: string;
  decimals?: number;
  symbol?: string;
  className?: string;
}

// Mock service for demo - in production, this would use stellarService
const mockBurnService = {
  getTokenInfo: async () => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      total_burned: '15000000000000',
      burn_count: 42,
      initial_supply: '1000000000000000',
      total_supply: '850000000000000',
      decimals: 0,
      symbol: 'NOVA',
    };
  },
  getBurnHistory: async () => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    // Generate mock burn records
    const records: BurnRecord[] = [];
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 0; i < 20; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      records.push({
        id: `burn-${i}`,
        timestamp: now - daysAgo * 86400 + Math.floor(Math.random() * 86400),
        from: `G${Math.random().toString(36).substring(2, 12).toUpperCase()}${Math.random().toString(36).substring(2, 44).toUpperCase()}`,
        amount: String(Math.floor(Math.random() * 1000000000000) + 10000000000),
        isAdminBurn: Math.random() > 0.7,
        txHash: `${Math.random().toString(36).substring(2, 64)}`,
      });
    }
    
    return records.sort((a, b) => b.timestamp - a.timestamp);
  },
};

export function BurnStatistics({
  tokenAddress,
  decimals = 0,
  symbol = '',
  className = '',
}: BurnStatisticsProps) {
  const [stats, setStats] = useState<BurnStats | null>(null);
  const [history, setHistory] = useState<BurnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BurnHistoryFilter>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadBurnData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [tokenInfo, burnHistory] = await Promise.all([
        mockBurnService.getTokenInfo(),
        mockBurnService.getBurnHistory(),
      ]);

      const percentBurned = calculatePercentBurned(
        tokenInfo.total_burned,
        tokenInfo.initial_supply
      );

      setStats({
        totalBurned: tokenInfo.total_burned,
        burnCount: tokenInfo.burn_count,
        initialSupply: tokenInfo.initial_supply,
        currentSupply: tokenInfo.total_supply,
        percentBurned,
      });

      setHistory(burnHistory);
    } catch (err) {
      console.error('Failed to load burn data:', err);
      setError('Failed to load burn statistics. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tokenAddress]);

  useEffect(() => {
    loadBurnData();
  }, [loadBurnData]);

  const handleRefresh = () => {
    loadBurnData(true);
  };

  const handleFilterChange = (newFilter: BurnHistoryFilter) => {
    setFilter(newFilter);
  };

  if (loading) {
    return (
      <div className={`burn-statistics ${className}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Burn Statistics</h2>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        
        <BurnChartSkeleton className="mb-6" />
        
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-32" />
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="h-4 bg-gray-200 rounded w-20" />
                <div className="h-4 bg-gray-200 rounded w-16" />
                <div className="h-4 bg-gray-200 rounded w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`burn-statistics ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`burn-statistics ${className}`}>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-500">No burn data available for this token.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`burn-statistics ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Burn Statistics</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Burned"
          value={`${formatTokenAmount(stats.totalBurned, decimals)} ${symbol}`}
          icon={<Flame className="w-6 h-6" />}
          subtitle="Total tokens burned"
        />
        
        <StatCard
          title="Burn Count"
          value={stats.burnCount.toLocaleString()}
          icon={<Hash className="w-6 h-6" />}
          subtitle="Number of burn transactions"
        />
        
        <StatCard
          title="Percent Burned"
          value={`${stats.percentBurned.toFixed(2)}%`}
          icon={<Percent className="w-6 h-6" />}
          subtitle="Of initial supply"
        />
        
        <StatCard
          title="Current Supply"
          value={`${formatTokenAmount(stats.currentSupply, decimals)} ${symbol}`}
          icon={<Coins className="w-6 h-6" />}
          subtitle="Remaining tokens"
        />
      </div>

      {/* Burn Progress Bar */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Burn Progress</h3>
        <div className="relative">
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(stats.percentBurned, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-600">
            <span>0%</span>
            <span className="font-medium text-orange-600">{stats.percentBurned.toFixed(2)}%</span>
            <span>100%</span>
          </div>
        </div>
        <div className="flex justify-between mt-4 text-sm">
          <div>
            <span className="text-gray-500">Initial Supply: </span>
            <span className="font-medium text-gray-900">
              {formatTokenAmount(stats.initialSupply, decimals)} {symbol}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Remaining: </span>
            <span className="font-medium text-gray-900">
              {formatTokenAmount(stats.currentSupply, decimals)} {symbol}
            </span>
          </div>
        </div>
      </div>

      {/* Burn Chart */}
      <BurnChart
        records={history}
        decimals={decimals}
        symbol={symbol}
        className="mb-6"
      />

      {/* Burn History Table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Burns</h3>
        <BurnHistoryTable
          records={history}
          filter={filter}
          onFilterChange={handleFilterChange}
          decimals={decimals}
          symbol={symbol}
        />
      </div>
    </div>
  );
}

export default BurnStatistics;
