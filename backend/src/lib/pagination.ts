import { Buffer } from 'buffer';

export interface PaginationParams {
  cursor?: string;
  limit?: number;
  direction?: 'forward' | 'backward';
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
  total?: number;
}

export class CursorPagination {
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;

  static encodeCursor(value: string | number): string {
    return Buffer.from(String(value)).toString('base64');
  }

  static decodeCursor(cursor: string): string {
    try {
      return Buffer.from(cursor, 'base64').toString('utf-8');
    } catch {
      throw new Error('Invalid cursor format');
    }
  }

  static validateLimit(limit?: number): number {
    if (!limit) return this.DEFAULT_LIMIT;
    if (limit < 1) return this.DEFAULT_LIMIT;
    if (limit > this.MAX_LIMIT) return this.MAX_LIMIT;
    return limit;
  }

  static parsePaginationParams(params: PaginationParams) {
    const limit = this.validateLimit(params.limit);
    const direction = params.direction || 'forward';
    let decodedCursor: string | null = null;

    if (params.cursor) {
      try {
        decodedCursor = this.decodeCursor(params.cursor);
      } catch {
        throw new Error('Invalid cursor');
      }
    }

    return { limit, direction, cursor: decodedCursor };
  }

  static paginate<T extends { id: string | number }>(
    items: T[],
    params: PaginationParams
  ): PaginatedResult<T> {
    const { limit, direction, cursor } = this.parsePaginationParams(params);

    let startIndex = 0;
    if (cursor) {
      startIndex = items.findIndex(item => String(item.id) === cursor);
      if (startIndex === -1) {
        throw new Error('Cursor not found');
      }
      startIndex = direction === 'forward' ? startIndex + 1 : Math.max(0, startIndex - limit - 1);
    }

    const endIndex = startIndex + limit;
    const paginatedItems = items.slice(startIndex, endIndex);

    const nextCursor =
      endIndex < items.length
        ? this.encodeCursor(String(paginatedItems[paginatedItems.length - 1]?.id))
        : undefined;

    const prevCursor =
      startIndex > 0
        ? this.encodeCursor(String(paginatedItems[0]?.id))
        : undefined;

    return {
      items: paginatedItems,
      nextCursor,
      prevCursor,
      hasMore: endIndex < items.length,
      total: items.length,
    };
  }

  static async paginateAsync<T extends { id: string | number }>(
    fetchFn: (offset: number, limit: number) => Promise<T[]>,
    params: PaginationParams
  ): Promise<PaginatedResult<T>> {
    const { limit } = this.parsePaginationParams(params);

    let offset = 0;
    if (params.cursor) {
      offset = parseInt(this.decodeCursor(params.cursor), 10);
    }

    const items = await fetchFn(offset, limit + 1);
    const hasMore = items.length > limit;
    const paginatedItems = items.slice(0, limit);

    const nextCursor = hasMore
      ? this.encodeCursor(String(offset + limit))
      : undefined;

    const prevCursor = offset > 0
      ? this.encodeCursor(String(Math.max(0, offset - limit)))
      : undefined;

    return {
      items: paginatedItems,
      nextCursor,
      prevCursor,
      hasMore,
    };
  }
}
