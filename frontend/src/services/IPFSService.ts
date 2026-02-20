import { IPFS_CONFIG } from '../config/ipfs';
import type { TokenMetadata } from '../types';

const GATEWAYS = [
    IPFS_CONFIG.pinataGateway,
    'https://ipfs.io/ipfs',
    'https://cloudflare-ipfs.com/ipfs',
];

const metadataCache = new Map<string, TokenMetadata>();

export class IPFSService {
    private apiKey: string;
    private apiSecret: string;

    constructor() {
        this.apiKey = IPFS_CONFIG.apiKey;
        this.apiSecret = IPFS_CONFIG.apiSecret;
    }

    async uploadMetadata(
        image: File,
        description: string,
        tokenName: string
    ): Promise<string> {
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('IPFS credentials not configured');
        }

        const imageHash = await this.uploadFile(image);
        const imageUri = `ipfs://${imageHash}`;

        const metadata: TokenMetadata = {
            name: tokenName,
            description,
            image: imageUri,
        };

        const metadataBlob = new Blob([JSON.stringify(metadata)], {
            type: 'application/json',
        });
        const metadataFile = new File([metadataBlob], 'metadata.json');
        const metadataHash = await this.uploadFile(metadataFile);

        return `ipfs://${metadataHash}`;
    }

    async getMetadata(uri: string): Promise<TokenMetadata> {
        if (metadataCache.has(uri)) {
            return metadataCache.get(uri)!;
        }

        const hash = uri.replace('ipfs://', '');
        
        for (const gateway of GATEWAYS) {
            try {
                const url = `${gateway}/${hash}`;
                const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
                
                if (!response.ok) continue;

                const metadata = await response.json() as TokenMetadata;
                
                if (!metadata.name || !metadata.description || !metadata.image) {
                    throw new Error('Invalid metadata structure');
                }

                metadataCache.set(uri, metadata);
                return metadata;
            } catch {
                continue;
            }
        }

        throw new Error('Failed to fetch metadata from all gateways');
    }

    private async uploadFile(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${IPFS_CONFIG.pinataApiUrl}/pinning/pinFileToIPFS`, {
            method: 'POST',
            headers: {
                pinata_api_key: this.apiKey,
                pinata_secret_api_key: this.apiSecret,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`IPFS upload failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.IpfsHash;
    }
}

export const ipfsService = new IPFSService();
