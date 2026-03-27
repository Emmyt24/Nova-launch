import axios, { AxiosInstance } from 'axios';

export interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

class IPFSService {
  private client: AxiosInstance;

  constructor() {
    // 1. Requirement: Configure Pinata API client & Auth
    const apiKey = process.env.REACT_APP_PINATA_API_KEY;
    const apiSecret = process.env.REACT_APP_PINATA_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.warn('IPFSService: Pinata credentials missing from environment.');
    }

    this.client = axios.create({
      baseURL: 'https://api.pinata.cloud',
      headers: {
        pinata_api_key: apiKey,
        pinata_secret_api_key: apiSecret,
      },
    });
  }

  /**
   * Uploads JSON metadata to IPFS
   * @param metadata The object to pin (e.g., Token metadata)
   */
  async uploadJSON(metadata: object): Promise<string> {
    try {
      const response = await this.client.post<PinataResponse>('/pinning/pinJSONToIPFS', {
        pinataContent: metadata,
      });
      return response.data.IpfsHash;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  // 2. Requirement: Handle API errors
  private handleError(error: any) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error || error.message;
      console.error(`IPFS Service Error: ${message}`);
    } else {
      console.error('An unexpected error occurred in IPFSService');
    }
  }
}

export const ipfsService = new IPFSService();
