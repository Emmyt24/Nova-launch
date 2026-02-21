import { useState, useEffect, useCallback } from 'react';
import { Button } from '../UI/Button';
import { TokenCard } from './TokenCard';
import { NoTokensEmptyState, NoWalletEmptyState } from '../UI';
import type { TokenInfo, WalletState } from '../../types';

interface TokenListProps {
  wallet: WalletState;
}

export function TokenList({ wallet }: TokenListProps) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTokens = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return;

    setLoading(true);
    try {
      // Load from localStorage for now
      const stored = localStorage.getItem(`tokens_${wallet.address}`);
      if (stored) {
        setTokens(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load tokens:', error);
    } finally {
      setLoading(false);
    }
  }, [wallet.address, wallet.connected]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  if (!wallet.connected) {
    return <NoWalletEmptyState />;
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading tokens...</p>
      </div>
    );
  }

  if (tokens.length === 0) {
    return <NoTokensEmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Your Tokens ({tokens.length})
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={loadTokens}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tokens.map((token) => (
          <TokenCard
            key={token.address}
            token={token}
            network={wallet.network}
          />
        ))}
      </div>
    </div>
  );
}
