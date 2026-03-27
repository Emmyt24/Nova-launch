// Metadata structure as per issue requirements
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string; // IPFS CID or URL
  decimals: number;
  properties?: Record<string, any>;
}

export interface UploadResponse {
  success: boolean;
  cid: string;
}

export interface MetadataResponse {
  success: boolean;
  data?: TokenMetadata;
  error?: string;
}
