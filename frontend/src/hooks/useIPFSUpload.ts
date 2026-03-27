import { useState, useCallback } from 'react';
import { IPFSService } from '../services/IPFSService';

interface UseIPFSUploadReturn {
    upload: (image: File, description: string, tokenName: string) => Promise<string>;
    uploading: boolean;
    progress: number;
    estimatedTimeMs?: number;
    error: string | null;
    reset: () => void;
}

export function useIPFSUpload(): UseIPFSUploadReturn {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [estimatedTimeMs, setEstimatedTimeMs] = useState<number | undefined>();
    const [error, setError] = useState<string | null>(null);

    const upload = useCallback(async (
        image: File,
        description: string,
        tokenName: string
    ): Promise<string> => {
        setUploading(true);
        setProgress(0);
        setError(null);
        
        const startTime = Date.now();
        const ipfsService = new IPFSService();

        try {
            // Simulate progress for image upload (0-50%)
            setProgress(10);
            const imageUploadPromise = ipfsService.uploadImage(image);
            
            // Estimate time based on file size (rough estimate: 100KB/s)
            const estimatedMs = (image.size / 100000) * 1000;
            setEstimatedTimeMs(estimatedMs);

            const progressInterval = setInterval(() => {
                setProgress(prev => {
                    if (prev < 45) return prev + 5;
                    return prev;
                });
                
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, estimatedMs - elapsed);
                setEstimatedTimeMs(remaining);
            }, 200);

            await imageUploadPromise;
            clearInterval(progressInterval);
            setProgress(50);

            // Upload metadata (50-100%)
            setProgress(60);
            const metadataUri = await ipfsService.uploadMetadata(image, description, tokenName);
            
            setProgress(100);
            setEstimatedTimeMs(0);
            
            return metadataUri;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'IPFS upload failed';
            setError(message);
            throw err;
        } finally {
            setUploading(false);
        }
    }, []);

    const reset = useCallback(() => {
        setUploading(false);
        setProgress(0);
        setEstimatedTimeMs(undefined);
        setError(null);
    }, []);

    return {
        upload,
        uploading,
        progress,
        estimatedTimeMs,
        error,
        reset,
    };
}
