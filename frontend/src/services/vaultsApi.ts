import type { VaultProjection } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
  error?: {
    code: string;
    message: string;
  };
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const body: ApiResponse<T> = await response.json();

  if (!response.ok || !body.success) {
    throw new Error(body.error?.message || `Vault API error: ${response.status}`);
  }

  return body.data;
}

export const vaultsApi = {
  getById: (id: number) => 
    request<VaultProjection>(`/vaults/${id}`),

  getByCreator: (address: string) => 
    request<VaultProjection[]>(`/vaults/creator/${address}`),
};
