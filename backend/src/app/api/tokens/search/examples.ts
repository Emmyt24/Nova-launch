/**
 * Example usage of the Token Search API
 *
 * This file demonstrates various ways to use the search endpoint
 */

// Example 1: Basic search by name or symbol
export const basicSearchExample = {
  url: "/api/tokens/search?q=stellar",
  description: "Search for tokens containing 'stellar' in name or symbol",
};

// Example 2: Filter by creator
export const creatorFilterExample = {
  url: "/api/tokens/search?creator=GCREATOR123ABC",
  description: "Find all tokens created by a specific address",
};

// Example 3: Date range filter
export const dateRangeExample = {
  url: "/api/tokens/search?startDate=2024-01-01T00:00:00.000Z&endDate=2024-12-31T23:59:59.999Z",
  description: "Find tokens created in 2024",
};

// Example 4: Supply range filter
export const supplyRangeExample = {
  url: "/api/tokens/search?minSupply=1000000&maxSupply=10000000",
  description: "Find tokens with supply between 1M and 10M",
};

// Example 5: Tokens with burns
export const withBurnsExample = {
  url: "/api/tokens/search?hasBurns=true&sortBy=burned&sortOrder=desc",
  description: "Find tokens that have been burned, sorted by burn amount",
};

// Example 6: Tokens without burns
export const withoutBurnsExample = {
  url: "/api/tokens/search?hasBurns=false",
  description: "Find tokens that have never been burned",
};

// Example 7: Sort by highest supply
export const highestSupplyExample = {
  url: "/api/tokens/search?sortBy=supply&sortOrder=desc&limit=10",
  description: "Get top 10 tokens by total supply",
};

// Example 8: Sort alphabetically
export const alphabeticalExample = {
  url: "/api/tokens/search?sortBy=name&sortOrder=asc",
  description: "Get tokens sorted alphabetically by name",
};

// Example 9: Newest tokens
export const newestTokensExample = {
  url: "/api/tokens/search?sortBy=created&sortOrder=desc&limit=20",
  description: "Get 20 most recently created tokens",
};

// Example 10: Complex query
export const complexQueryExample = {
  url: "/api/tokens/search?q=token&creator=GCREATOR123&hasBurns=true&minSupply=100000&sortBy=burned&sortOrder=desc&page=1&limit=10",
  description: "Complex search with multiple filters",
};

// Example 11: Pagination
export const paginationExample = {
  url: "/api/tokens/search?page=2&limit=25",
  description: "Get second page with 25 results per page",
};

// Example 12: Creator's burned tokens
export const creatorBurnedTokensExample = {
  url: "/api/tokens/search?creator=GCREATOR123&hasBurns=true&sortBy=burned&sortOrder=desc",
  description:
    "Find all burned tokens by a specific creator, sorted by burn amount",
};

/**
 * TypeScript usage example
 */
export async function searchTokensExample() {
  const params = new URLSearchParams({
    q: "stellar",
    sortBy: "created",
    sortOrder: "desc",
    page: "1",
    limit: "20",
  });

  const response = await fetch(`/api/tokens/search?${params}`);
  const data = await response.json();

  if (data.success) {
    console.log(`Found ${data.pagination.total} tokens`);
    data.data.forEach((token: any) => {
      console.log(`${token.name} (${token.symbol}): ${token.totalSupply}`);
    });
  } else {
    console.error("Search failed:", data.error);
  }
}

/**
 * React hook example
 */
export function useTokenSearch() {
  // This is a conceptual example - adapt to your React setup
  const searchTokens = async (params: Record<string, string>) => {
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`/api/tokens/search?${searchParams}`);
    return response.json();
  };

  return { searchTokens };
}

/**
 * Advanced filtering example
 */
export async function findHighValueBurnedTokens() {
  const params = new URLSearchParams({
    hasBurns: "true",
    minSupply: "1000000",
    sortBy: "burned",
    sortOrder: "desc",
    limit: "50",
  });

  const response = await fetch(`/api/tokens/search?${params}`);
  const data = await response.json();

  return data.data.filter((token: any) => {
    const burnPercentage =
      (BigInt(token.totalBurned) * BigInt(100)) / BigInt(token.totalSupply);
    return burnPercentage > BigInt(10); // More than 10% burned
  });
}
