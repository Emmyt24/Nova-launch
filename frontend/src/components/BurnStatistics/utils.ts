/**
 * Utility functions for Burn Statistics components
 */

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

export function formatTokenAmount(amount: string, decimals = 0): string {
  const value = BigInt(amount) / BigInt(10 ** decimals);
  return value.toLocaleString('en-US');
}

export function getExplorerUrl(txHash: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
  const baseUrl = network === 'testnet'
    ? 'https://stellar.expert/explorer/testnet/tx'
    : 'https://stellar.expert/explorer/public/tx';
  return `${baseUrl}/${txHash}`;
}

export function formatPercentage(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function calculatePercentBurned(totalBurned: string, initialSupply: string): number {
  if (!initialSupply || initialSupply === '0') return 0;
  const burned = BigInt(totalBurned);
  const supply = BigInt(initialSupply);
  // Calculate percentage with 2 decimal places
  return Number((burned * BigInt(10000)) / supply) / 100;
}

export function aggregateBurnData(
  records: { timestamp: number; amount: string }[],
  interval: 'day' | 'week' | 'month' = 'day'
): { labels: string[]; values: number[]; cumulative: number[] } {
  if (records.length === 0) {
    return { labels: [], values: [], cumulative: [] };
  }

  // Sort records by timestamp
  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);

  // Group by interval
  const groups = new Map<string, bigint>();
  
  sorted.forEach((record) => {
    const date = new Date(record.timestamp * 1000);
    let key: string;
    
    if (interval === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (interval === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      // month
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    const current = groups.get(key) || BigInt(0);
    groups.set(key, current + BigInt(record.amount));
  });

  const labels = Array.from(groups.keys());
  const values = Array.from(groups.values()).map((v) => Number(v));
  
  // Calculate cumulative
  const cumulative: number[] = [];
  let runningTotal = 0;
  values.forEach((v) => {
    runningTotal += v;
    cumulative.push(runningTotal);
  });

  return { labels, values, cumulative };
}
