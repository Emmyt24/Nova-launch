import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService, GovernanceProposalCache } from './cache';

describe('CacheService', () => {
  let cache: CacheService<any>;

  beforeEach(() => {
    cache = new CacheService(1000);
  });

  afterEach(() => {
    cache.destroy();
  });

  it('should set and get values', () => {
    cache.set('key1', { data: 'value1' });
    expect(cache.get('key1')).toEqual({ data: 'value1' });
  });

  it('should return null for missing keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should track cache hits and misses', () => {
    cache.set('key1', 'value1');
    cache.get('key1');
    cache.get('nonexistent');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should expire entries after TTL', async () => {
    cache.set('key1', 'value1', 100);
    expect(cache.get('key1')).toBe('value1');

    await new Promise(resolve => setTimeout(resolve, 150));
    expect(cache.get('key1')).toBeNull();
  });

  it('should invalidate specific keys', () => {
    cache.set('key1', 'value1');
    cache.invalidate('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('should invalidate by pattern', () => {
    cache.set('proposal:1', 'data1');
    cache.set('proposal:2', 'data2');
    cache.set('other:1', 'data3');

    cache.invalidatePattern(/^proposal:/);

    expect(cache.get('proposal:1')).toBeNull();
    expect(cache.get('proposal:2')).toBeNull();
    expect(cache.get('other:1')).toBe('data3');
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
    expect(cache.getStats().size).toBe(0);
  });

  it('should handle concurrent operations', () => {
    for (let i = 0; i < 100; i++) {
      cache.set(`key${i}`, `value${i}`);
    }

    for (let i = 0; i < 100; i++) {
      expect(cache.get(`key${i}`)).toBe(`value${i}`);
    }

    expect(cache.getStats().size).toBe(100);
  });
});

describe('GovernanceProposalCache', () => {
  let cache: GovernanceProposalCache;

  beforeEach(() => {
    cache = new GovernanceProposalCache(1000);
  });

  afterEach(() => {
    cache.destroy();
  });

  it('should cache and retrieve proposals', () => {
    const proposal = { id: '1', title: 'Test', status: 'active' };
    cache.setProposal('1', proposal);
    expect(cache.getProposal('1')).toEqual(proposal);
  });

  it('should cache and retrieve proposals list', () => {
    const proposals = [
      { id: '1', title: 'Test1' },
      { id: '2', title: 'Test2' },
    ];
    cache.setProposalsList(proposals, 'active');
    expect(cache.getProposalsList('active')).toEqual(proposals);
  });

  it('should invalidate proposal and all lists', () => {
    const proposal = { id: '1', title: 'Test' };
    const proposals = [proposal];

    cache.setProposal('1', proposal);
    cache.setProposalsList(proposals, 'active');
    cache.setProposalsList(proposals, 'pending');

    cache.invalidateProposal('1');

    expect(cache.getProposal('1')).toBeNull();
    expect(cache.getProposalsList('active')).toBeNull();
    expect(cache.getProposalsList('pending')).toBeNull();
  });

  it('should track cache statistics', () => {
    cache.setProposal('1', { id: '1' });
    cache.getProposal('1');
    cache.getProposal('2');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should clear all cache', () => {
    cache.setProposal('1', { id: '1' });
    cache.setProposalsList([{ id: '1' }], 'active');

    cache.clear();

    expect(cache.getProposal('1')).toBeNull();
    expect(cache.getProposalsList('active')).toBeNull();
  });
});
