import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockGetContractFees = vi.fn();

vi.mock('../../services/stellar.service', () => ({
  StellarService: vi.fn().mockImplementation(function(this: any) {
    this.getContractFees = mockGetContractFees;
  }),
}));

import { useFactoryFees, _clearFeesCache } from '../useFactoryFees';
import { FALLBACK_BASE_FEE, FALLBACK_METADATA_FEE } from '../../utils/feeCalculation';

describe('useFactoryFees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearFeesCache();
  });

  it('returns contract fees on success', async () => {
    mockGetContractFees.mockResolvedValue({ baseFee: 5, metadataFee: 2 });
    const { result } = renderHook(() => useFactoryFees('testnet'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.baseFee).toBe(5);
    expect(result.current.metadataFee).toBe(2);
    expect(result.current.isFallback).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('falls back to static values on contract read failure', async () => {
    mockGetContractFees.mockRejectedValue(new Error('RPC unavailable'));
    const { result } = renderHook(() => useFactoryFees('testnet'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.baseFee).toBe(FALLBACK_BASE_FEE);
    expect(result.current.metadataFee).toBe(FALLBACK_METADATA_FEE);
    expect(result.current.isFallback).toBe(true);
    expect(result.current.error).toMatch(/RPC unavailable/);
  });

  it('starts in loading state', () => {
    mockGetContractFees.mockResolvedValue({ baseFee: 7, metadataFee: 3 });
    const { result } = renderHook(() => useFactoryFees('testnet'));
    expect(result.current.loading).toBe(true);
  });

  it('re-fetches when network changes', async () => {
    mockGetContractFees
      .mockResolvedValueOnce({ baseFee: 7, metadataFee: 3 })
      .mockResolvedValueOnce({ baseFee: 8, metadataFee: 4 });

    const { result, rerender } = renderHook(
      ({ net }: { net: 'testnet' | 'mainnet' }) => useFactoryFees(net),
      { initialProps: { net: 'testnet' as const } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.baseFee).toBe(7);

    rerender({ net: 'mainnet' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.baseFee).toBe(8);
  });

  it('exposes refresh to force re-fetch', async () => {
    mockGetContractFees
      .mockResolvedValueOnce({ baseFee: 7, metadataFee: 3 })
      .mockResolvedValueOnce({ baseFee: 9, metadataFee: 5 });

    const { result } = renderHook(() => useFactoryFees('testnet'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.baseFee).toBe(7);

    result.current.refresh();
    await waitFor(() => expect(result.current.baseFee).toBe(9));
    expect(result.current.loading).toBe(false);
  });
});
