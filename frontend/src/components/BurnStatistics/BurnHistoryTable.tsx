import React from 'react';
import { BurnRecord, BurnHistoryFilter } from '../../types';
import { Card } from '../UI/Card';
import { ExternalLink, ArrowUpDown, Filter } from 'lucide-react';
import { formatDate, truncateAddress, formatTokenAmount, getExplorerUrl } from './utils';

interface BurnHistoryTableProps {
  records: BurnRecord[];
  filter?: BurnHistoryFilter;
  onFilterChange?: (filter: BurnHistoryFilter) => void;
  loading?: boolean;
  decimals?: number;
  symbol?: string;
}

export function BurnHistoryTable({
  records,
  filter = {},
  onFilterChange,
  loading = false,
  decimals = 0,
  symbol = '',
}: BurnHistoryTableProps) {
  const handleSort = (field: 'timestamp' | 'amount') => {
    const newSortOrder = filter.sortBy === field && filter.sortOrder === 'desc' ? 'asc' : 'desc';
    onFilterChange?.({
      ...filter,
      sortBy: field,
      sortOrder: newSortOrder,
    });
  };

  const handleTypeFilter = (type: 'all' | 'admin' | 'self') => {
    onFilterChange?.({
      ...filter,
      type,
    });
  };

  const filteredRecords = records.filter((record) => {
    if (filter.type === 'admin' && !record.isAdminBurn) return false;
    if (filter.type === 'self' && record.isAdminBurn) return false;
    if (filter.startDate && record.timestamp * 1000 < filter.startDate.getTime()) return false;
    if (filter.endDate && record.timestamp * 1000 > filter.endDate.getTime()) return false;
    return true;
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (!filter.sortBy) return 0;
    const multiplier = filter.sortOrder === 'desc' ? -1 : 1;
    
    if (filter.sortBy === 'timestamp') {
      return multiplier * (a.timestamp - b.timestamp);
    }
    if (filter.sortBy === 'amount') {
      return multiplier * (BigInt(a.amount) > BigInt(b.amount) ? 1 : -1);
    }
    return 0;
  });

  if (loading) {
    return (
      <Card className="burn-history-table">
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
      </Card>
    );
  }

  return (
    <Card className="burn-history-table">
      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters:</span>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => handleTypeFilter('all')}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              (filter.type || 'all') === 'all'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleTypeFilter('admin')}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              filter.type === 'admin'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Admin Burns
          </button>
          <button
            onClick={() => handleTypeFilter('self')}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              filter.type === 'self'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Self Burns
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm font-medium text-gray-500 border-b border-gray-200">
              <th className="pb-3 pr-4">
                <button
                  onClick={() => handleSort('timestamp')}
                  className="flex items-center gap-1 hover:text-gray-700"
                >
                  Date
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="pb-3 pr-4">From</th>
              <th className="pb-3 pr-4">
                <button
                  onClick={() => handleSort('amount')}
                  className="flex items-center gap-1 hover:text-gray-700"
                >
                  Amount
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="pb-3 pr-4">Type</th>
              <th className="pb-3">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {sortedRecords.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">
                  No burn records found
                </td>
              </tr>
            ) : (
              sortedRecords.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="py-3 pr-4 text-sm text-gray-600">
                    {formatDate(record.timestamp)}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className="font-mono text-sm text-gray-700"
                      title={record.from}
                    >
                      {truncateAddress(record.from)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-sm font-medium text-gray-900">
                    {formatTokenAmount(record.amount, decimals)} {symbol}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        record.isAdminBurn
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {record.isAdminBurn ? 'Admin' : 'Self'}
                    </span>
                  </td>
                  <td className="py-3">
                    <a
                      href={getExplorerUrl(record.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700"
                    >
                      View
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Record count */}
      {sortedRecords.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
          Showing {sortedRecords.length} of {records.length} records
        </div>
      )}
    </Card>
  );
}