import { IPFS_CONFIG } from '../config/ipfs';
import type { TokenMetadata } from '../types';

/**
 * Result from IPFS upload
 */
export interface IpfsUploadResult {
    cid: string;
    url: string;
}

/**
 * Service for interacting with IPFS (via Pinata)
 */
export class IpfsService {
    private apiKey: string;
    private apiSecret: string;
    private gateway: string;

    constructor() {
        this.apiKey = IPFS_CONFIG.apiKey;
        this.apiSecret = IPFS_CONFIG.apiSecret;
        this.gateway = IPFS_CONFIG.pinataGateway;
    }

    /**
     * Upload image to IPFS
     */
    async uploadImage(file: File): Promise<IpfsUploadResult> {
        if (!this.apiKey || !this.apiSecret) {
            // Return mock data when no API key is configured
            return this.mockUploadImage(file);
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${IPFS_CONFIG.pinataApiUrl}/pinning/pinFileToIPFS`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.getJwt()}`,
                },
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`IPFS upload failed: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                cid: data.IpfsHash,
                url: `${this.gateway}/${data.IpfsHash}`,
            };
        } catch (error) {
            console.error('IPFS image upload error:', error);
            throw error;
        }
    }

    /**
     * Upload metadata JSON to IPFS
     */
    async uploadMetadata(metadata: TokenMetadata): Promise<IpfsUploadResult> {
        if (!this.apiKey || !this.apiSecret) {
            // Return mock data when no API key is configured
            return this.mockUploadMetadata(metadata);
        }

        try {
            const response = await fetch(`${IPFS_CONFIG.pinataApiUrl}/pinning/pinJSONToIPFS`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.getJwt()}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pinataContent: metadata,
                    pinataMetadata: {
                        name: `token-metadata-${Date.now()}.json`,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`IPFS metadata upload failed: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                cid: data.IpfsHash,
                url: `${this.gateway}/${data.IpfsHash}`,
            };
        } catch (error) {
            console.error('IPFS metadata upload error:', error);
            throw error;
        }
    }

    /**
     * Upload metadata with image to IPFS
     * Returns the metadata IPFS URL after uploading both image and metadata
     */
    async uploadTokenMetadata(
        name: string,
        description: string,
        imageFile: File
    ): Promise<IpfsUploadResult> {
        // First upload the image
        const imageResult = await this.uploadImage(imageFile);

        // Then create and upload metadata
        const metadata: TokenMetadata = {
            name,
            description,
            image: imageResult.url,
        };

        return this.uploadMetadata(metadata);
    }

    /**
     * Get content from IPFS
     */
    async getContent<T>(cid: string): Promise<T> {
        const response = await fetch(`${this.gateway}/${cid}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Generate JWT token for Pinata API
     * In production, this should be handled server-side
     */
    private getJwt(): string {
        // This is a placeholder - in production, you'd generate this server-side
        // or use the API key directly with Pinata's SDK
        return this.apiKey;
    }

    /**
     * Mock upload for development without API keys
     */
    private mockUploadImage(file: File): IpfsUploadResult {
        const mockCid = `mock-${Date.now()}-${file.name.replace(/\s/g, '')}`;
        return {
            cid: mockCid,
            url: `${this.gateway}/${mockCid}`,
        };
    }

    /**
     * Mock metadata upload for development
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private mockUploadMetadata(metadata: TokenMetadata): IpfsUploadResult {
        const mockCid = `mock-metadata-${Date.now()}`;
        return {
            cid: mockCid,
            url: `${this.gateway}/${mockCid}`,
        };
    }
}

// Singleton instance
let ipfsServiceInstance: IpfsService | null = null;

export function getIpfsService(): IpfsService {
    if (!ipfsServiceInstance) {
        ipfsServiceInstance = new IpfsService();
    }
    return ipfsServiceInstance;
}
