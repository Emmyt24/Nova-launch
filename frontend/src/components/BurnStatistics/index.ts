// Main component
export { BurnStatistics, default } from './BurnStatistics';

// Sub-components
export { StatCard, StatCardSkeleton } from './StatCard';
export { BurnHistoryTable } from './BurnHistoryTable';
export { BurnChart, BurnChartSkeleton } from './BurnChart';

// Utility functions
export {
  formatDate,
  truncateAddress,
  formatTokenAmount,
  getExplorerUrl,
  formatPercentage,
  calculatePercentBurned,
  aggregateBurnData,
} from './utils';

// Re-export types
export type { BurnStats, BurnRecord, BurnHistoryFilter, BurnChartData } from '../../types';