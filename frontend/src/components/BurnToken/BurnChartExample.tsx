import { useState, useEffect } from 'react';
import { BurnChart, type BurnRecord } from './BurnChart';

/**
 * Example component demonstrating BurnChart usage
 */
export function BurnChartExample() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<BurnRecord[]>([]);

  // Simulate data fetching
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Generate sample data
      const sampleRecords: BurnRecord[] = generateSampleData();
      setRecords(sampleRecords);
      setLoading(false);
    };

    fetchData();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Burn Chart Example
        </h1>
        <p className="text-gray-600">
          Interactive visualization of token burn history
        </p>
      </div>

      <BurnChart
        records={records}
        decimals={7}
        symbol="XLM"
        loading={loading}
      />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Features Demonstrated:</h3>
        <ul className="list-disc list-inside text-blue-800 space-y-1">
          <li>Time period filtering (7d, 30d, 90d, all)</li>
          <li>Bar chart for individual burn amounts</li>
          <li>Cumulative line overlay</li>
          <li>Interactive tooltips on hover</li>
          <li>Responsive design</li>
          <li>Loading state</li>
          <li>Summary statistics</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Generate sample burn data for demonstration
 */
function generateSampleData(): BurnRecord[] {
  const now = Math.floor(Date.now() / 1000);
  const records: BurnRecord[] = [];

  // Generate 90 days of data with varying burn amounts
  for (let i = 0; i < 90; i++) {
    const daysAgo = 90 - i;
    const timestamp = now - daysAgo * 86400;
    
    // Random number of burns per day (0-3)
    const burnsPerDay = Math.floor(Math.random() * 4);
    
    for (let j = 0; j < burnsPerDay; j++) {
      const amount = Math.floor(Math.random() * 10000000000) + 1000000000; // 100-1000 tokens
      
      records.push({
        id: `${i}-${j}`,
        timestamp: timestamp + j * 3600, // Spread throughout the day
        from: `G${Math.random().toString(36).substring(2, 15).toUpperCase()}`,
        amount: amount.toString(),
        isAdminBurn: Math.random() > 0.7,
        txHash: `${Math.random().toString(36).substring(2, 15)}`,
      });
    }
  }

  return records;
}

/**
 * Example with empty state
 */
export function BurnChartEmptyExample() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Empty State Example
      </h2>
      <BurnChart records={[]} decimals={7} symbol="TOKEN" />
    </div>
  );
}

/**
 * Example with loading state
 */
export function BurnChartLoadingExample() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Loading State Example
      </h2>
      <BurnChart records={[]} decimals={7} symbol="TOKEN" loading={true} />
    </div>
  );
}

/**
 * Example with custom styling
 */
export function BurnChartStyledExample() {
  const records = generateSampleData();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Custom Styling Example
      </h2>
      <BurnChart
        records={records}
        decimals={7}
        symbol="USDC"
        className="shadow-2xl border-2 border-purple-200"
      />
    </div>
  );
}

/**
 * Example with different token decimals
 */
export function BurnChartDecimalsExample() {
  const records: BurnRecord[] = [
    {
      id: '1',
      timestamp: Math.floor(Date.now() / 1000) - 86400 * 5,
      from: 'GXXX',
      amount: '1000000000000000000', // 1 token with 18 decimals
      isAdminBurn: false,
      txHash: 'hash1',
    },
    {
      id: '2',
      timestamp: Math.floor(Date.now() / 1000) - 86400 * 3,
      from: 'GYYY',
      amount: '2500000000000000000', // 2.5 tokens with 18 decimals
      isAdminBurn: true,
      txHash: 'hash2',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        18 Decimals Example (ERC-20 style)
      </h2>
      <BurnChart records={records} decimals={18} symbol="DAI" />
    </div>
  );
}

export default BurnChartExample;
