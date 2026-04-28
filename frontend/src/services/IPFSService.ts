import { IPFS_CONFIG } from '../config/ipfs';
import type { TokenMetadata } from '../types';

const GATEWAYS = [
    IPFS_CONFIG.pinataGateway,
    'https://ipfs.io/ipfs',
    'https://cloudflare-ipfs.com/ipfs',
];

const metadataCache = new Map<string, TokenMetadata>();

/** Exposed for testing only */
export function _clearMetadataCache() { metadataCache.clear(); }

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

        try {
            const response = await fetch(`${IPFS_CONFIG.pinataApiUrl}/pinning/pinFileToIPFS`, {
                method: 'POST',
                headers: {
                    pinata_api_key: this.apiKey,
                    pinata_secret_api_key: this.apiSecret,
                },
                body: formData,
                signal: AbortSignal.timeout(30000), // 30s timeout for uploads
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`IPFS upload failed (${response.status}): ${errorText || response.statusText}`);
            }

            const data = await response.json();
            if (!data.IpfsHash) {
                throw new Error('IPFS upload succeeded but no hash was returned');
            }
            return data.IpfsHash;
        } catch (error) {
            if (error instanceof Error && error.name === 'TimeoutError') {
                throw new Error('IPFS upload timed out. Please check your connection and try again.');
            }
            throw error;
        }
    }

    async uploadImage(file: File): Promise<string> {
        return this.uploadFile(file);
    }
}

export const ipfsService = new IPFSService();

/** Validate that a string is a well-formed ipfs:// URI with a non-empty hash */
export function isValidIpfsUri(uri: string): boolean {
    return /^ipfs:\/\/[a-zA-Z0-9]{10,}/.test(uri);
}

export interface IPFSUploadResult {
    success: boolean;
    ipfsHash: string;
    ipfsUrl: string;
    error?: string;
}

export interface IPFSUploadHandle {
    promise: Promise<IPFSUploadResult>;
    cancel: () => void;
}

interface UploadProgress {
    percent: number;
    estimatedRemainingMs?: number;
}

export function uploadToIPFSWithProgress(
    file: File,
    _validationResult: unknown,
    metadata: { name: string; keyvalues: Record<string, string> },
    onProgress?: (progress: UploadProgress) => void,
): IPFSUploadHandle {
    let cancelled = false;

    const promise = (async (): Promise<IPFSUploadResult> => {
        try {
            onProgress?.({ percent: 10 });

            if (cancelled) throw new Error('Upload cancelled');

            const hash = await ipfsService.uploadImage(file);

            onProgress?.({ percent: 100 });

            return {
                success: true,
                ipfsHash: hash,
                ipfsUrl: `https://gateway.pinata.cloud/ipfs/${hash}`,
            };
        } catch (error) {
            return {
                success: false,
                ipfsHash: '',
                ipfsUrl: '',
                error: error instanceof Error ? error.message : 'Upload failed',
            };
        }
    })();

    return {
        promise,
        cancel: () => { cancelled = true; },
    };
}
