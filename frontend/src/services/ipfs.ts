/**
 * IPFS Upload Service
 * Handles image uploads to IPFS with validation
 */

import { IPFS_CONFIG } from '../config/ipfs';
import { validateImage } from '../utils/validation';
import type { ImageValidationResult } from '../types';

export interface IPFSUploadResult {
    success: boolean;
    ipfsHash?: string;
    ipfsUrl?: string;
    error?: string;
}

/**
 * Upload image to IPFS via Pinata
 */
export async function uploadImageToIPFS(file: File): Promise<IPFSUploadResult> {
    try {
        // Validate image before upload
        const validation: ImageValidationResult = await validateImage(file);
        
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error || 'Image validation failed',
            };
        }

        // Prepare form data
        const formData = new FormData();
        formData.append('file', file);

        // Optional: Add metadata
        const metadata = JSON.stringify({
            name: file.name,
            keyvalues: {
                size: validation.size.toString(),
                type: validation.type,
                ...(validation.dimensions && {
                    width: validation.dimensions.width.toString(),
                    height: validation.dimensions.height.toString(),
                }),
            },
        });
        formData.append('pinataMetadata', metadata);

        // Upload to Pinata
        const response = await fetch(`${IPFS_CONFIG.pinataApiUrl}/pinning/pinFileToIPFS`, {
            method: 'POST',
            headers: {
                'pinata_api_key': IPFS_CONFIG.apiKey,
                'pinata_secret_api_key': IPFS_CONFIG.apiSecret,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Upload failed: ${response.statusText}`);
        }

        const data = await response.json();
        const ipfsHash = data.IpfsHash;
        const ipfsUrl = `${IPFS_CONFIG.pinataGateway}/${ipfsHash}`;

        return {
            success: true,
            ipfsHash,
            ipfsUrl,
        };
    } catch (error) {
        console.error('IPFS upload error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed',
        };
    }
}

/**
 * Upload image with progress tracking
 */
export async function uploadImageWithProgress(
    file: File,
    onProgress?: (progress: number) => void
): Promise<IPFSUploadResult> {
    try {
        // Validate first
        const validation = await validateImage(file);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error || 'Image validation failed',
            };
        }

        onProgress?.(10); // Validation complete

        const formData = new FormData();
        formData.append('file', file);

        onProgress?.(20); // Form data prepared

        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = 20 + (e.loaded / e.total) * 70; // 20-90%
                    onProgress?.(Math.round(percentComplete));
                }
            });

            xhr.addEventListener('load', async () => {
                onProgress?.(95);
                
                if (xhr.status === 200) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        const ipfsHash = data.IpfsHash;
                        const ipfsUrl = `${IPFS_CONFIG.pinataGateway}/${ipfsHash}`;
                        
                        onProgress?.(100);
                        resolve({
                            success: true,
                            ipfsHash,
                            ipfsUrl,
                        });
                    } catch {
                        resolve({
                            success: false,
                            error: 'Failed to parse response',
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        error: `Upload failed: ${xhr.statusText}`,
                    });
                }
            });

            xhr.addEventListener('error', () => {
                resolve({
                    success: false,
                    error: 'Network error during upload',
                });
            });

            xhr.open('POST', `${IPFS_CONFIG.pinataApiUrl}/pinning/pinFileToIPFS`);
            xhr.setRequestHeader('pinata_api_key', IPFS_CONFIG.apiKey);
            xhr.setRequestHeader('pinata_secret_api_key', IPFS_CONFIG.apiSecret);
            xhr.send(formData);
        });
    } catch (err: unknown) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Upload failed',
        };
    }
}

/**
 * Validate and prepare image for upload
 */
export async function prepareImageForUpload(file: File): Promise<{
    valid: boolean;
    file?: File;
    validation?: ImageValidationResult;
    error?: string;
}> {
    const validation = await validateImage(file);
    
    if (!validation.valid) {
        return {
            valid: false,
            validation,
            error: validation.error,
        };
    }

    return {
        valid: true,
        file,
        validation,
    };
}
