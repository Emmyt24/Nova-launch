export interface TokenSearchResult {
  id: string;
  address: string;
  creator: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  initialSupply: string;
  totalBurned: string;
  burnCount: number;
  metadataUri: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SearchFilters {
  q?: string;
  creator?: string;
  startDate?: string;
  endDate?: string;
  minSupply?: string;
  maxSupply?: string;
  hasBurns?: "true" | "false";
  sortBy: "created" | "burned" | "supply" | "name";
  sortOrder: "asc" | "desc";
}

export interface TokenSearchResponse {
  success: boolean;
  data: TokenSearchResult[];
  pagination: SearchPagination;
  filters: SearchFilters;
}

export interface TokenSearchErrorResponse {
  success: false;
  error: string;
  message?: string;
  details?: any[];
}
