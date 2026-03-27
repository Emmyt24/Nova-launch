export interface BurnRecord {
  id: string;
  tokenAddress: string;
  amount: string;
  from: string;
  type: "self" | "admin";
  transactionHash: string;
  blockNumber: string | null;
  timestamp: Date;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AppliedFilters {
  tokenAddress?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  sortBy: string;
  sortOrder: string;
}

export interface BurnHistoryResponse {
  success: boolean;
  data: BurnRecord[];
  pagination: PaginationMeta;
  filters: AppliedFilters;
}
