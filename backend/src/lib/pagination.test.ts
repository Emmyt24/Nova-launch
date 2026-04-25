import { describe, it, expect } from 'vitest';
import { CursorPagination } from './pagination';

describe('CursorPagination', () => {
  const mockItems = Array.from({ length: 100 }, (_, i) => ({
    id: String(i + 1),
    name: `Item ${i + 1}`,
  }));

  it('should encode and decode cursors', () => {
    const value = '42';
    const encoded = CursorPagination.encodeCursor(value);
    const decoded = CursorPagination.decodeCursor(encoded);

    expect(decoded).toBe(value);
  });

  it('should validate limit', () => {
    expect(CursorPagination.validateLimit(undefined)).toBe(20);
    expect(CursorPagination.validateLimit(0)).toBe(20);
    expect(CursorPagination.validateLimit(-5)).toBe(20);
    expect(CursorPagination.validateLimit(50)).toBe(50);
    expect(CursorPagination.validateLimit(200)).toBe(100);
  });

  it('should paginate items forward', () => {
    const result = CursorPagination.paginate(mockItems, { limit: 10 });

    expect(result.items).toHaveLength(10);
    expect(result.items[0].id).toBe('1');
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
    expect(result.prevCursor).toBeUndefined();
  });

  it('should paginate with cursor', () => {
    const firstPage = CursorPagination.paginate(mockItems, { limit: 10 });
    const secondPage = CursorPagination.paginate(mockItems, {
      limit: 10,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.items[0].id).toBe('11');
    expect(secondPage.prevCursor).toBeDefined();
  });

  it('should handle last page', () => {
    const result = CursorPagination.paginate(mockItems, {
      limit: 20,
      cursor: CursorPagination.encodeCursor('81'),
    });

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  it('should throw on invalid cursor', () => {
    expect(() => {
      CursorPagination.paginate(mockItems, { cursor: 'invalid!!!' });
    }).toThrow();
  });

  it('should throw on cursor not found', () => {
    expect(() => {
      CursorPagination.paginate(mockItems, {
        cursor: CursorPagination.encodeCursor('999'),
      });
    }).toThrow('Cursor not found');
  });

  it('should paginate backward', () => {
    const result = CursorPagination.paginate(mockItems, {
      limit: 10,
      cursor: CursorPagination.encodeCursor('50'),
      direction: 'backward',
    });

    expect(result.items.length).toBeLessThanOrEqual(10);
  });

  it('should handle async pagination', async () => {
    const fetchFn = async (offset: number, limit: number) => {
      return mockItems.slice(offset, offset + limit);
    };

    const result = await CursorPagination.paginateAsync(fetchFn, {
      limit: 10,
    });

    expect(result.items).toHaveLength(10);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
  });

  it('should handle async pagination with cursor', async () => {
    const fetchFn = async (offset: number, limit: number) => {
      return mockItems.slice(offset, offset + limit);
    };

    const firstPage = await CursorPagination.paginateAsync(fetchFn, {
      limit: 10,
    });

    expect(firstPage.items).toHaveLength(10);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await CursorPagination.paginateAsync(fetchFn, {
      limit: 10,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.items.length).toBeGreaterThan(0);
  });

  it('should include total count', () => {
    const result = CursorPagination.paginate(mockItems, { limit: 10 });
    expect(result.total).toBe(100);
  });

  it('should handle empty results', () => {
    const result = CursorPagination.paginate([], { limit: 10 });

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  it('should handle single item', () => {
    const result = CursorPagination.paginate([{ id: '1', name: 'Item' }], {
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });
});
