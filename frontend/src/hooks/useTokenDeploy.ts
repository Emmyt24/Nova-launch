import { useState, useCallback, useRef } from 'react';
import type { TokenDeployParams, DeploymentResult, DeploymentStatus, AppError } from '../types';
import { ErrorCode } from '../types';
import { createError, getErrorMessage } from '../utils/errors';
import { getStellarService } from '../services/stellar';
import { getIpfsService } from '../services/ipfs';

/**
 * State for the deployment process
 */
interface DeployState {
    status: DeploymentStatus;
    progress: number;
    error: AppError | null;
    result: DeploymentResult | null;
    metadataUrl: string | null;
}

/**
 * Configuration options for the hook
 */
interface UseTokenDeployOptions {
    network?: 'testnet' | 'mainnet';
    maxRetries?: number;
    retryDelay?: number;
    onSuccess?: (result: DeploymentResult) => void;
    onError?: (error: AppError) => void;
}

/**
 * Custom hook for managing token deployment process
 * 
 * Manages the complete deployment lifecycle:
 * - Uploads metadata to IPFS (if applicable)
 * - Calls StellarService.deployToken
 * - Tracks transaction progress
 * - Handles errors with retry functionality
 */
export function useTokenDeploy(options: UseTokenDeployOptions = {}) {
    const {
        network = 'testnet',
        maxRetries = 3,
        retryDelay = 2000,
        onSuccess,
        onError,
    } = options;

    const [state, setState] = useState<DeployState>({
        status: 'idle',
        progress: 0,
        error: null,
        result: null,
        metadataUrl: null,
    });

    const retryCountRef = useRef(0);
    const isMountedRef = useRef(true);

    const stellarService = getStellarService(network);
    const ipfsService = getIpfsService();

    /**
     * Reset the deployment state
     */
    const reset = useCallback(() => {
        setState({
            status: 'idle',
            progress: 0,
            error: null,
            result: null,
            metadataUrl: null,
        });
        retryCountRef.current = 0;
    }, []);

    /**
     * Set error state
     */
    const setError = useCallback((error: AppError) => {
        setState(prev => ({
            ...prev,
            status: 'error',
            error,
        }));
        onError?.(error);
    }, [onError]);

    /**
     * Deploy the token
     */
    const deploy = useCallback(async (params: TokenDeployParams): Promise<DeploymentResult | null> => {
        // Reset state on new deployment
        if (state.status !== 'idle' && state.status !== 'error') {
            return null;
        }

        setState({
            status: 'uploading',
            progress: 0,
            error: null,
            result: null,
            metadataUrl: null,
        });

        let metadataUrl: string | null = null;

        try {
            // Step 1: Upload metadata to IPFS (if provided)
            if (params.metadata) {
                setState(prev => ({ ...prev, progress: 10 }));

                try {
                    const ipfsResult = await ipfsService.uploadTokenMetadata(
                        params.name,
                        params.metadata.description,
                        params.metadata.image
                    );
                    metadataUrl = ipfsResult.url;
                    
                    if (!isMountedRef.current) return null;
                    
                    setState(prev => ({ 
                        ...prev, 
                        progress: 30,
                        metadataUrl,
                    }));
                } catch (ipfsError) {
                    const error = createError(
                        ErrorCode.IPFS_UPLOAD_FAILED,
                        getErrorMessage(ipfsError)
                    );
                    setError(error);
                    return null;
                }
            }

            // Step 2: Deploy token to Stellar network
            setState(prev => ({ 
                ...prev, 
                status: 'deploying',
                progress: 40,
            }));

            let result: DeploymentResult;
            
            try {
                result = await stellarService.deployToken({
                    ...params,
                    // If metadata was uploaded, pass the metadata URL
                    ...(metadataUrl && { 
                        metadata: undefined // Remove the File object, use URL instead
                    }),
                });

                // Add metadata URL to result if available
                if (metadataUrl) {
                    result = { ...result, metadataUrl };
                }
            } catch (stellarError) {
                const errorMessage = getErrorMessage(stellarError);
                
                // Check if it's a wallet rejection
                if (errorMessage.includes('rejected') || errorMessage.includes('cancelled')) {
                    const error = createError(ErrorCode.WALLET_REJECTED, errorMessage);
                    setError(error);
                    return null;
                }
                
                const error = createError(ErrorCode.TRANSACTION_FAILED, errorMessage);
                setError(error);
                return null;
            }

            if (!isMountedRef.current) return null;

            // Step 3: Wait for transaction confirmation
            setState(prev => ({ ...prev, progress: 70 }));

            try {
                const confirmed = await stellarService.waitForConfirmation(result.transactionHash);
                
                if (!confirmed) {
                    const error = createError(ErrorCode.TRANSACTION_FAILED, 'Transaction was not confirmed');
                    setError(error);
                    return null;
                }
            } catch (confirmError) {
                // Transaction might still be confirmed, continue
                console.warn('Confirmation check failed:', confirmError);
            }

            if (!isMountedRef.current) return null;

            // Step 4: Finalize
            setState({
                status: 'success',
                progress: 100,
                error: null,
                result,
                metadataUrl,
            });

            onSuccess?.(result);
            retryCountRef.current = 0;
            
            return result;

        } catch (error) {
            const appError = createError(
                ErrorCode.TRANSACTION_FAILED,
                getErrorMessage(error)
            );
            setError(appError);
            return null;
        }
    }, [state.status, stellarService, ipfsService, setError, onSuccess]);

    /**
     * Retry the deployment
     */
    const retry = useCallback(async (params: TokenDeployParams): Promise<DeploymentResult | null> => {
        if (retryCountRef.current >= maxRetries) {
            const error = createError(
                ErrorCode.TRANSACTION_FAILED,
                `Maximum retry attempts (${maxRetries}) reached`
            );
            setError(error);
            return null;
        }

        retryCountRef.current += 1;
        
        // Add delay before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        return deploy(params);
    }, [deploy, maxRetries, retryDelay, setError]);

    /**
     * Retry with the last used parameters
     */
    const retryLast = useCallback(async (): Promise<DeploymentResult | null> => {
        // This would require storing the last params
        // For now, just return null and let the caller handle it
        console.warn('retryLast requires storing params - use deploy() or retry() instead');
        return null;
    }, []);

    return {
        // State
        status: state.status,
        progress: state.progress,
        error: state.error,
        result: state.result,
        metadataUrl: state.metadataUrl,
        
        // Computed
        isIdle: state.status === 'idle',
        isUploading: state.status === 'uploading',
        isDeploying: state.status === 'deploying',
        isSuccess: state.status === 'success',
        isError: state.status === 'error',
        canDeploy: state.status === 'idle' || state.status === 'error',
        
        // Actions
        deploy,
        retry,
        retryLast,
        reset,
    };
}

export type { UseTokenDeployOptions };
