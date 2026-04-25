import React, { useEffect, useState } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { useVaultContract } from '../../hooks/useVaultContract';
import { truncateAddress, formatInterval, formatCountdown } from '../../hooks/useVaultContract';

export const VaultDashboard: React.FC = () => {
  const { wallet } = useWallet();
  const address = wallet.address;
  const { payments, loading, error, refreshPayments } = useVaultContract({ walletAddress: address || undefined });
  const [filter, setFilter] = useState<'all' | 'active' | 'due' | 'paused'>('all');

  useEffect(() => {
    if (address) {
      refreshPayments();
    }
  }, [address, refreshPayments]);

  const filteredPayments = payments.filter(p => {
    if (filter === 'all') return true;
    return p.status === filter;
  });

  if (!address) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold mb-4">Vaults Dashboard</h2>
        <p className="text-gray-600">Please connect your wallet to view your recurring payment vaults.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vaults Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage your automated recurring payments</p>
        </div>
        <div className="flex gap-4">
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">All Vaults</option>
            <option value="active">Active</option>
            <option value="due">Due Now</option>
            <option value="paused">Paused</option>
          </select>
          <button 
            onClick={refreshPayments}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="lg:col-span-3 p-12 text-center text-gray-500">Loading vaults...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="lg:col-span-3 bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-500 mb-4">No {filter !== 'all' ? filter : ''} vaults found.</p>
            <button className="text-blue-600 font-medium hover:underline">
              Schedule your first payment
            </button>
          </div>
        ) : (
          filteredPayments.map((payment) => (
            <VaultCard key={payment.id} payment={payment} />
          ))
        )}
      </div>
    </div>
  );
};

const VaultCard: React.FC<{ payment: any }> = ({ payment }) => {
  const isDue = payment.status === 'due';
  
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${isDue ? 'border-amber-200 bg-amber-50/10' : 'border-gray-200'} overflow-hidden`}>
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              payment.status === 'active' ? 'bg-green-100 text-green-700' :
              payment.status === 'due' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {payment.status}
            </span>
            <h3 className="mt-2 font-bold text-gray-900 truncate">
              {payment.memo || 'Recurring Payment'}
            </h3>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {payment.amount} <span className="text-sm font-normal text-gray-500">{payment.tokenSymbol}</span>
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Recipient</span>
            <span className="font-mono text-gray-900">{truncateAddress(payment.recipient)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Interval</span>
            <span className="text-gray-900">{formatInterval(payment.interval, payment.intervalSeconds)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Next Payment</span>
            <span className={`font-medium ${isDue ? 'text-amber-600' : 'text-gray-900'}`}>
              {formatCountdown(payment.nextPaymentTime)}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {isDue ? (
            <button className="flex-1 bg-amber-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-amber-700 transition">
              Process Now
            </button>
          ) : (
            <button className="flex-1 bg-gray-50 text-gray-700 text-sm font-bold py-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition">
              Details
            </button>
          )}
          <button className="px-3 bg-white text-gray-400 border border-gray-200 rounded-lg hover:text-red-500 hover:border-red-200 transition">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
