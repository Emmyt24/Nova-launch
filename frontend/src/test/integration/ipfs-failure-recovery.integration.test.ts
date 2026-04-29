import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTokenDeploy } from '../../hooks/useTokenDeploy';
import { IPFSService, isValidIpfsUri } from '../../services/IPFSService';
import { StellarService } from '../../services/stellar.service';
import { ErrorCode } from '../../types';

// Mock the services but keep the utility functions
vi.mock('../../services/IPFSService', async () => {
    const actual = await vi.importActual('../../services/IPFSService') as any;
    return {
        ...actual,
        IPFSService: vi.fn().mockImplementation(class {
            uploadMetadata = vi.fn();
            uploadImage = vi.fn();
            getMetadata = vi.fn();
        }),
    };
});
vi.mock('../../services/stellar.service');
vi.mock('../../services/analytics');

describe('IPFS Failure and Recovery Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    const mockParams = {
        name: 'Test Token',
        symbol: 'TST',
        decimals: 7,
        initialSupply: '1000000',
        adminWallet: 'GABCDEF234567ABCDEF234567ABCDEF234567ABCDEF234567ABCDEFG',
        metadata: {
            image: new File(['test'], 'test.png', { type: 'image/png' }),
            description: 'Test description',
        },
    };

    // Helper to get mocked instance
    const getIPFSServiceMock = () => {
        return (IPFSService as any).mock.results[0].value;
    };

    it('should show a retryable error when IPFS upload times out', async () => {
        const { result } = renderHook(() => useTokenDeploy('testnet', { retryDelay: 0 }));
        
        // Wait for next tick so ipfsService is initialized
        await act(async () => {
            const mock = getIPFSServiceMock();
            mock.uploadMetadata.mockRejectedValue(
                new Error('IPFS upload timed out. Please check your connection and try again.')
            );

            try {
                await result.current.deploy(mockParams);
            } catch (e) {
                // Expected
            }
        });

        await waitFor(() => {
            expect(result.current.status).toBe('error');
        });
        
        expect(result.current.error?.code).toBe(ErrorCode.IPFS_UPLOAD_FAILED);
        expect(result.current.error?.details).toContain('timed out');
        expect(result.current.canRetry).toBe(true);
    });

    it('should fail before upload when metadata payload is invalid', async () => {
        const invalidParams = {
            ...mockParams,
            metadata: {
                ...mockParams.metadata,
                description: 'a'.repeat(600), // Too long, limit is 500
            },
        };

        const { result } = renderHook(() => useTokenDeploy('testnet'));

        await act(async () => {
            try {
                await result.current.deploy(invalidParams);
            } catch (e) {
                // Expected
            }
        });

        await waitFor(() => {
            expect(result.current.status).toBe('error');
        });

        expect(result.current.error?.code).toBe(ErrorCode.INVALID_INPUT);
        // We might not have a mock instance yet if it failed before useMemo's constructor call or during first use
        // But useMemo(..., []) runs on first render.
        const mock = getIPFSServiceMock();
        if (mock) {
            expect(mock.uploadMetadata).not.toHaveBeenCalled();
        }
    });

    it('should preserve metadata URI and skip upload on retry if contract submission fails', async () => {
        const mockMetadataUri = 'ipfs://QmSuccessfullyUploadedMetadata';
        const { result } = renderHook(() => useTokenDeploy('testnet', { retryDelay: 0 }));

        await act(async () => {
            const mock = getIPFSServiceMock();
            mock.uploadMetadata.mockResolvedValue(mockMetadataUri);
            
            vi.mocked(StellarService.prototype.deployToken).mockRejectedValue(new Error('Stellar transaction failed'));
            vi.mocked(StellarService.prototype.isPaused).mockResolvedValue(false);

            try {
                await result.current.deploy(mockParams);
            } catch (e) {
                // Expected
            }
        });

        await waitFor(() => {
            expect(result.current.status).toBe('error');
        });
        
        const mock = getIPFSServiceMock();
        expect(mock.uploadMetadata).toHaveBeenCalledTimes(1);
        mock.uploadMetadata.mockClear();
        
        // 2. Retry: should NOT call uploadMetadata again, but SHOULD call deployToken with the same URI
        vi.mocked(StellarService.prototype.deployToken).mockResolvedValue({
            tokenAddress: 'CAT...',
            transactionHash: '0xabc...',
            timestamp: Date.now(),
        } as any);

        await act(async () => {
            await result.current.retry();
        });

        await waitFor(() => {
            expect(result.current.status).toBe('success');
        });

        expect(mock.uploadMetadata).not.toHaveBeenCalled();
        expect(StellarService.prototype.deployToken).toHaveBeenCalledWith(expect.objectContaining({
            metadataUri: mockMetadataUri
        }));
    });

    it('should handle mixed failure recovery: image success, metadata failure, then retry', async () => {
        const mockMetadataUri = 'ipfs://QmNewMetadataUri';
        const { result } = renderHook(() => useTokenDeploy('testnet', { retryDelay: 0 }));

        await act(async () => {
            const mock = getIPFSServiceMock();
            mock.uploadMetadata
                .mockRejectedValueOnce(new Error('IPFS gateway timeout'))
                .mockResolvedValueOnce(mockMetadataUri);
                
            vi.mocked(StellarService.prototype.deployToken).mockResolvedValue({
                tokenAddress: 'CAT...',
                transactionHash: '0xabc...',
                timestamp: Date.now(),
            } as any);
            vi.mocked(StellarService.prototype.isPaused).mockResolvedValue(false);

            try {
                await result.current.deploy(mockParams);
            } catch (e) {
                // Expected
            }
        });

        await waitFor(() => {
            expect(result.current.status).toBe('error');
        });
        
        expect(result.current.error?.code).toBe(ErrorCode.IPFS_UPLOAD_FAILED);

        // Retry should attempt IPFS again because it failed there
        await act(async () => {
            await result.current.retry();
        });

        await waitFor(() => {
            expect(result.current.status).toBe('success');
        });

        const mock = getIPFSServiceMock();
        expect(mock.uploadMetadata).toHaveBeenCalledTimes(2);
    });
});
