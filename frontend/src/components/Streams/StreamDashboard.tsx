import React, { useEffect, useState } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { streamsApi } from '../../services/streamsApi';
import type { StreamProjection, StreamStats } from '../../types';
import { truncateAddress } from '../../hooks/useVaultContract';

export const StreamDashboard: React.FC = () => {
  const { wallet } = useWallet();
  const address = wallet.address;
  const [streams, setStreams] = useState<StreamProjection[]>([]);
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const [streamsData, statsData] = await Promise.all([
        streamsApi.getByCreator(address),
        streamsApi.getStats(address)
      ]);
      setStreams(streamsData);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch stream data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [address]);

  if (!address) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold mb-4">Streams Dashboard</h2>
        <p className="text-gray-600">Please connect your wallet to view your streams.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Streams Dashboard</h1>
        <button 
          onClick={fetchData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Streams" value={stats.totalStreams} />
          <StatCard title="Active Streams" value={stats.activeStreams} />
          <StatCard title="Claimed Volume" value={`${stats.claimedVolume} USDC`} />
          <StatCard title="Cancelled Volume" value={`${stats.cancelledVolume} USDC`} />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-800">Your Streams</h2>
        </div>
        
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading streams...</div>
        ) : streams.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {error ? error : "No streams found for this wallet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-6 py-3">Stream ID</th>
                  <th className="px-6 py-3">Recipient</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Created At</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {streams.map((stream) => (
                  <tr key={stream.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-mono text-sm text-gray-900">
                      {stream.streamId}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {truncateAddress(stream.recipient)}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {stream.amount} USDC
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={stream.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(stream.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string | number }> = ({ title, value }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
    <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles = {
    CREATED: 'bg-green-100 text-green-800',
    CLAIMED: 'bg-blue-100 text-blue-800',
    CANCELLED: 'bg-red-100 text-red-800',
  }[status] || 'bg-gray-100 text-gray-800';

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
};
