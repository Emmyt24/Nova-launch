import { useMemo, useState } from 'react';
import type { AppError, DeploymentResult, DeploymentStatus, TokenDeployParams, TokenInfo } from '../types';
import { ErrorCode } from '../types';
import { createError, getErrorMessage } from '../utils/errors';
import {
    isValidDescription,
    isValidImageFile,
    validateTokenParams,
} from '../utils/validation';
import { IPFSService } from '../services/IPFSService';
import { StellarService, getDeploymentFeeBreakdown } from '../services/StellarService';
import { analytics, AnalyticsEvent } from '../services/analytics';
import { useAnalytics } from './useAnalytics';

const STATUS_MESSAGES: Record<DeploymentStatus, string> = {
    idle: '',
    uploading: 'Uploading metadata to IPFS...',
    deploying: 'Building transaction, requesting signature, and submitting to Stellar...',
    success: 'Deployment complete.',
    error: 'Deployment failed.',
};

export function useTokenDeploy(network: 'testnet' | 'mainnet') {
    const [status, setStatus] = useState<DeploymentStatus>('idle');
    const [error, setError] = useState<AppError | null>(null);

    const stellarService = useMemo(() => new StellarService(network), [network]);
    const ipfsService = useMemo(() => new IPFSService(), []);
    const { trackTokenDeployed, trackTokenDeployFailed } = useAnalytics();

    const deploy = async (params: TokenDeployParams): Promise<DeploymentResult> => {
        setError(null);
        setStatus('idle');

        // Track initiation (no PII). Do NOT include wallet or addresses.
        try {
            analytics.track('token_deploy_initiated', {
                network,
                name_length: params.name ? params.name.length : 0,
                symbol: params.symbol || '',
                decimals: params.decimals || 0,
                has_metadata: Boolean(params.metadata || params.metadataUri),
            });
        } catch {}

        const validation = validateTokenParams(params);
        if (!validation.valid) {
            const details = Object.values(validation.errors).join(' ');
            const appError = createError(ErrorCode.INVALID_INPUT, details);
            setError(appError);
            setStatus('error');
            try {
                analytics.track(AnalyticsEvent.TOKEN_DEPLOY_FAILED, {
                    network,
                    errorCode: appError.code,
                });
            } catch {}
            throw appError;
        }

        let metadataUri = params.metadataUri;
        if (params.metadata) {
            const imageValidation = isValidImageFile(params.metadata.image);
            if (!imageValidation.valid) {
                const appError = createError(
                    ErrorCode.INVALID_INPUT,
                    imageValidation.error || 'Invalid metadata image'
                );
                setError(appError);
                setStatus('error');
                throw appError;
            }

            if (!isValidDescription(params.metadata.description)) {
                const appError = createError(
                    ErrorCode.INVALID_INPUT,
                    'Metadata description must be 500 characters or fewer'
                );
                setError(appError);
                setStatus('error');
                throw appError;
            }

            setStatus('uploading');
            try {
                metadataUri = await ipfsService.uploadMetadata(
                    params.metadata.image,
                    params.metadata.description,
                    params.name
                );
            } catch (uploadError) {
                const appError = createError(ErrorCode.IPFS_UPLOAD_FAILED, getErrorMessage(uploadError));
                setError(appError);
                setStatus('error');
                try {
                    analytics.track(AnalyticsEvent.TOKEN_DEPLOY_FAILED, {
                        network,
                        errorCode: appError.code,
                    });
                } catch {}
                throw appError;
            }
        }

        setStatus('deploying');
        try {
            const result = await stellarService.deployToken({
                ...params,
                metadataUri,
            });
            try {
                analytics.track(AnalyticsEvent.TOKEN_DEPLOYED, {
                    network,
                    name_length: params.name ? params.name.length : 0,
                    symbol: params.symbol || '',
                    decimals: params.decimals || 0,
                });
            } catch {}
            saveDeploymentRecord(params, result, metadataUri);
            setStatus('success');
            trackTokenDeployed(params.symbol, network);
            return result;
        } catch (deployError) {
            const appError = mapDeploymentError(deployError);
            try {
                analytics.track(AnalyticsEvent.TOKEN_DEPLOY_FAILED, {
                    network,
                    errorCode: appError.code,
                });
            } catch {}
            setError(appError);
            setStatus('error');
            trackTokenDeployFailed(appError.message, network);
            throw appError;
        }
    };

    const reset = () => {
        setStatus('idle');
        setError(null);
    };

    return {
        deploy,
        reset,
        status,
        statusMessage: STATUS_MESSAGES[status],
        isDeploying: status === 'uploading' || status === 'deploying',
        error,
        getFeeBreakdown: getDeploymentFeeBreakdown,
    };
}

function saveDeploymentRecord(
    params: TokenDeployParams,
    result: DeploymentResult,
    metadataUri?: string
): void {
    const token: TokenInfo = {
        address: result.tokenAddress,
        name: params.name,
        symbol: params.symbol,
        decimals: params.decimals,
        totalSupply: params.initialSupply,
        creator: params.adminWallet,
        metadataUri,
        deployedAt: result.timestamp,
        transactionHash: result.transactionHash,
    };

    const storageKey = `tokens_${params.adminWallet}`;
    const existingRaw = localStorage.getItem(storageKey);
    const existing = existingRaw ? (JSON.parse(existingRaw) as TokenInfo[]) : [];
    localStorage.setItem(storageKey, JSON.stringify([token, ...existing]));
}

function mapDeploymentError(error: unknown): AppError {
    const message = getErrorMessage(error);
    const normalizedMessage = message.toLowerCase();

    if (normalizedMessage.includes('wallet') || normalizedMessage.includes('sign')) {
        return createError(ErrorCode.WALLET_REJECTED, message);
    }

    if (normalizedMessage.includes('network')) {
        return createError(ErrorCode.NETWORK_ERROR, message);
    }

    if (normalizedMessage.includes('simulate') || normalizedMessage.includes('transaction')) {
        return createError(ErrorCode.TRANSACTION_FAILED, message);
    }

    return createError(ErrorCode.TRANSACTION_FAILED, message);
}
