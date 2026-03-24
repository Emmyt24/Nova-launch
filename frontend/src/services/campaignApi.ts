/**
 * Typed campaign API client.
 * All paths are relative to the canonical /api/campaigns mount point.
 */

const BASE = "/api/campaigns";

export interface CampaignProjection {
  id: string;
  campaignId: number;
  tokenId: string;
  creator: string;
  type: string;
  status: string;
  targetAmount: string;
  currentAmount: string;
  executionCount: number;
  progress: number;
  startTime: string;
  endTime?: string;
  metadata?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface CampaignStats {
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  totalVolume: string;
  totalExecutions: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Campaign API error: ${res.status}`);
  return res.json();
}

export const campaignApi = {
  getById: (campaignId: number) =>
    get<CampaignProjection>(`/${campaignId}`),

  getByToken: (tokenId: string) =>
    get<CampaignProjection[]>(`/token/${tokenId}`),

  getByCreator: (creator: string) =>
    get<CampaignProjection[]>(`/creator/${creator}`),

  getExecutions: (campaignId: number, limit = 50, offset = 0) =>
    get<{ executions: unknown[]; total: number }>(
      `/${campaignId}/executions?limit=${limit}&offset=${offset}`
    ),

  getStats: (tokenId?: string) =>
    get<CampaignStats>(tokenId ? `/stats/${tokenId}` : "/stats"),
};
