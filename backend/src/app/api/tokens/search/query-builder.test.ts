import { describe, it, expect } from "vitest";
import { buildTokenSearchQuery } from "./query-builder";
import type { ValidatedSearchTokensQuery } from "./schema";

describe("Query Builder", () => {
  it("should build query with full-text search", () => {
    const params: ValidatedSearchTokensQuery = {
      q: "test",
      sortBy: "created",
      sortOrder: "desc",
      page: "1",
      limit: "20",
    };

    const { where } = buildTokenSearchQuery(params);

    expect(where.OR).toEqual([
      { name: { contains: "test", mode: "insensitive" } },
      { symbol: { contains: "test", mode: "insensitive" } },
    ]);
  });

  it("should build query with creator filter", () => {
    const params: ValidatedSearchTokensQuery = {
      creator: "GCREATOR1",
      sortBy: "created",
      sortOrder: "desc",
      page: "1",
      limit: "20",
    };

    const { where } = buildTokenSearchQuery(params);

    expect(where.creator).toEqual({
      equals: "GCREATOR1",
      mode: "insensitive",
    });
  });

  it("should build query with date range", () => {
    const params: ValidatedSearchTokensQuery = {
      startDate: "2024-01-01T00:00:00.000Z",
      endDate: "2024-12-31T23:59:59.999Z",
      sortBy: "created",
      sortOrder: "desc",
      page: "1",
      limit: "20",
    };

    const { where } = buildTokenSearchQuery(params);

    expect(where.createdAt).toEqual({
      gte: new Date("2024-01-01T00:00:00.000Z"),
      lte: new Date("2024-12-31T23:59:59.999Z"),
    });
  });

  it("should build query with supply range", () => {
    const params: ValidatedSearchTokensQuery = {
      minSupply: "1000",
      maxSupply: "10000",
      sortBy: "created",
      sortOrder: "desc",
      page: "1",
      limit: "20",
    };

    const { where } = buildTokenSearchQuery(params);

    expect(where.totalSupply).toEqual({
      gte: BigInt(1000),
      lte: BigInt(10000),
    });
  });

  it("should build query with hasBurns filter", () => {
    const paramsWithBurns: ValidatedSearchTokensQuery = {
      hasBurns: "true",
      sortBy: "created",
      sortOrder: "desc",
      page: "1",
      limit: "20",
    };

    const { where: whereWithBurns } = buildTokenSearchQuery(paramsWithBurns);
    expect(whereWithBurns.burnCount).toEqual({ gt: 0 });

    const paramsWithoutBurns: ValidatedSearchTokensQuery = {
      hasBurns: "false",
      sortBy: "created",
      sortOrder: "desc",
      page: "1",
      limit: "20",
    };

    const { where: whereWithoutBurns } =
      buildTokenSearchQuery(paramsWithoutBurns);
    expect(whereWithoutBurns.burnCount).toEqual({ equals: 0 });
  });

  it("should build correct orderBy for different sort options", () => {
    const sortTests = [
      { sortBy: "created" as const, expected: { createdAt: "desc" } },
      { sortBy: "burned" as const, expected: { totalBurned: "desc" } },
      { sortBy: "supply" as const, expected: { totalSupply: "desc" } },
      { sortBy: "name" as const, expected: { name: "desc" } },
    ];

    for (const test of sortTests) {
      const params: ValidatedSearchTokensQuery = {
        sortBy: test.sortBy,
        sortOrder: "desc",
        page: "1",
        limit: "20",
      };

      const { orderBy } = buildTokenSearchQuery(params);
      expect(orderBy).toEqual(test.expected);
    }
  });

  it("should handle ascending sort order", () => {
    const params: ValidatedSearchTokensQuery = {
      sortBy: "name",
      sortOrder: "asc",
      page: "1",
      limit: "20",
    };

    const { orderBy } = buildTokenSearchQuery(params);
    expect(orderBy).toEqual({ name: "asc" });
  });

  it("should combine multiple filters", () => {
    const params: ValidatedSearchTokensQuery = {
      q: "token",
      creator: "GCREATOR1",
      startDate: "2024-01-01T00:00:00.000Z",
      minSupply: "1000",
      hasBurns: "true",
      sortBy: "burned",
      sortOrder: "desc",
      page: "1",
      limit: "20",
    };

    const { where, orderBy } = buildTokenSearchQuery(params);

    expect(where.OR).toBeDefined();
    expect(where.creator).toBeDefined();
    expect(where.createdAt).toBeDefined();
    expect(where.totalSupply).toBeDefined();
    expect(where.burnCount).toBeDefined();
    expect(orderBy).toEqual({ totalBurned: "desc" });
  });
});
