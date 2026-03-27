import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTokenDeploy } from '../useTokenDeploy';
import { IPFSService } from '../../services/IPFSService';
import { StellarService } from '../../services/StellarService';
import { analytics } from '../../services/analytics';
import { ErrorCode } from '../../types';

vi.mock('../../services/IPFSService');
vi.mock('../../services/StellarService');
vi.mock('../../services/analytics');

describe('useTokenDeploy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(analytics.track).mockImplementation(() => {});
    });

    describe('initial state', () => {
        it('starts in idle state', () => {
            const { result } = renderHook(() => useTokenDeploy('testnet'));

            expect(result.current.status).toBe('idle');
            expect(result.current.error).toBeNull();
            expect(result.current.isDeploying).toBe(false);
            expect(result.current.statusMessage).toBe('');
        });
    });

    describe('deploy', () => {
        it('deploys token successfully without metadata', async () => {
            const mockResult = {
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                transactionHash: 'abc123',
                timestamp: Date.now(),
            };

            vi.mocked(StellarService.prototype.deployToken).mockResolvedValue(mockResult);

            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            };

            let deployResult;
            await act(async () => {
                deployResult = await result.current.deploy(params);
            });

            expect(deployResult).toEqual(mockResult);
            expect(result.current.status).toBe('success');
            expect(result.current.error).toBeNull();
        });

        it('deploys token with metadata', async () => {
            const mockMetadataUri = 'ipfs://QmTest123';
            const mockResult = {
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                transactionHash: 'abc123',
                timestamp: Date.now(),
            };

            vi.mocked(IPFSService.prototype.uploadMetadata).mockResolvedValue(mockMetadataUri);
            vi.mocked(StellarService.prototype.deployToken).mockResolvedValue(mockResult);

            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const mockImage = new File(['test'], 'test.png', { type: 'image/png' });
            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                metadata: {
                    image: mockImage,
                    description: 'Test description',
                },
            };

            await act(async () => {
                await result.current.deploy(params);
            });

            expect(result.current.status).toBe('success');
            expect(IPFSService.prototype.uploadMetadata).toHaveBeenCalledWith(
                mockImage,
                'Test description',
                'Test Token'
            );
        });

        it('validates token parameters', async () => {
            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const invalidParams = {
                name: '',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            };

            await act(async () => {
                await expect(result.current.deploy(invalidParams)).rejects.toThrow();
            });

            expect(result.current.status).toBe('error');
            expect(result.current.error?.code).toBe(ErrorCode.INVALID_INPUT);
        });

        it('handles IPFS upload failure', async () => {
            vi.mocked(IPFSService.prototype.uploadMetadata).mockRejectedValue(
                new Error('IPFS upload failed')
            );

            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const mockImage = new File(['test'], 'test.png', { type: 'image/png' });
            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                metadata: {
                    image: mockImage,
                    description: 'Test description',
                },
            };

            await act(async () => {
                await expect(result.current.deploy(params)).rejects.toThrow();
            });

            expect(result.current.status).toBe('error');
            expect(result.current.error?.code).toBe(ErrorCode.IPFS_UPLOAD_FAILED);
        });

        it('handles deployment failure', async () => {
            vi.mocked(StellarService.prototype.deployToken).mockRejectedValue(
                new Error('Transaction failed')
            );

            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            };

            await act(async () => {
                await expect(result.current.deploy(params)).rejects.toThrow();
            });

            expect(result.current.status).toBe('error');
            expect(result.current.error).toBeTruthy();
        });

        it('validates image file', async () => {
            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const invalidImage = new File(['test'], 'test.txt', { type: 'text/plain' });
            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                metadata: {
                    image: invalidImage,
                    description: 'Test description',
                },
            };

            await act(async () => {
                await expect(result.current.deploy(params)).rejects.toThrow();
            });

            expect(result.current.status).toBe('error');
        });

        it('validates description length', async () => {
            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const mockImage = new File(['test'], 'test.png', { type: 'image/png' });
            const longDescription = 'a'.repeat(501);
            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                metadata: {
                    image: mockImage,
                    description: longDescription,
                },
            };

            await act(async () => {
                await expect(result.current.deploy(params)).rejects.toThrow();
            });

            expect(result.current.status).toBe('error');
        });

        it('updates status during deployment', async () => {
            const mockMetadataUri = 'ipfs://QmTest123';
            const mockResult = {
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                transactionHash: 'abc123',
                timestamp: Date.now(),
            };

            vi.mocked(IPFSService.prototype.uploadMetadata).mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockMetadataUri), 100))
            );
            vi.mocked(StellarService.prototype.deployToken).mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockResult), 100))
            );

            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const mockImage = new File(['test'], 'test.png', { type: 'image/png' });
            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                metadata: {
                    image: mockImage,
                    description: 'Test description',
                },
            };

            act(() => {
                result.current.deploy(params);
            });

            await waitFor(() => {
                expect(result.current.status).toBe('uploading');
            });

            await waitFor(() => {
                expect(result.current.status).toBe('deploying');
            });

            await waitFor(() => {
                expect(result.current.status).toBe('success');
            });
        });

        it('saves deployment record to localStorage', async () => {
            const mockResult = {
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                transactionHash: 'abc123',
                timestamp: Date.now(),
            };

            vi.mocked(StellarService.prototype.deployToken).mockResolvedValue(mockResult);

            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            };

            await act(async () => {
                await result.current.deploy(params);
            });

            const storageKey = `tokens_${params.adminWallet}`;
            const stored = localStorage.getItem(storageKey);
            expect(stored).toBeTruthy();

            const tokens = JSON.parse(stored!);
            expect(tokens).toHaveLength(1);
            expect(tokens[0].address).toBe(mockResult.tokenAddress);
        });
    });

    describe('reset', () => {
        it('resets state to idle', async () => {
            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const invalidParams = {
                name: '',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            };

            await act(async () => {
                await expect(result.current.deploy(invalidParams)).rejects.toThrow();
            });

            expect(result.current.status).toBe('error');

            act(() => {
                result.current.reset();
            });

            expect(result.current.status).toBe('idle');
            expect(result.current.error).toBeNull();
        });
    });

    describe('isDeploying', () => {
        it('returns true during upload and deploy', async () => {
            const mockMetadataUri = 'ipfs://QmTest123';
            const mockResult = {
                tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                transactionHash: 'abc123',
                timestamp: Date.now(),
            };

            vi.mocked(IPFSService.prototype.uploadMetadata).mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockMetadataUri), 100))
            );
            vi.mocked(StellarService.prototype.deployToken).mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockResult), 100))
            );

            const { result } = renderHook(() => useTokenDeploy('testnet'));

            const mockImage = new File(['test'], 'test.png', { type: 'image/png' });
            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
                metadata: {
                    image: mockImage,
                    description: 'Test description',
                },
            };

            act(() => {
                result.current.deploy(params);
            });

            await waitFor(() => {
                expect(result.current.isDeploying).toBe(true);
            });

            await waitFor(() => {
                expect(result.current.isDeploying).toBe(false);
            });
        });
    });

    describe('retry', () => {
        it('retries failed deployment', async () => {
            let callCount = 0;
            vi.mocked(StellarService.prototype.deployToken).mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.reject(new Error('Transaction failed'));
                }
                return Promise.resolve({
                    tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                    transactionHash: 'abc123',
                    timestamp: Date.now(),
                });
            });

            const { result } = renderHook(() => useTokenDeploy('testnet', { retryDelay: 0 }));

            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            };

            // First attempt fails
            await act(async () => {
                await expect(result.current.deploy(params)).rejects.toThrow();
            });

            expect(result.current.status).toBe('error');
            expect(result.current.canRetry).toBe(true);
            expect(result.current.retryCount).toBe(0);

            // Retry succeeds
            await act(async () => {
                await result.current.retry();
            });

            expect(result.current.status).toBe('success');
            expect(result.current.retryCount).toBe(1);
        });

        it('respects maxRetries limit', async () => {
            vi.mocked(StellarService.prototype.deployToken).mockRejectedValue(
                new Error('Transaction failed')
            );

            const { result } = renderHook(() => useTokenDeploy('testnet', { maxRetries: 2, retryDelay: 0 }));

            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            };

            // First attempt
            await act(async () => {
                await expect(result.current.deploy(params)).rejects.toThrow();
            });

            // Retry 1
            await act(async () => {
                await expect(result.current.retry()).rejects.toThrow();
            });
            expect(result.current.retryCount).toBe(1);

            // Retry 2
            await act(async () => {
                await expect(result.current.retry()).rejects.toThrow();
            });
            expect(result.current.retryCount).toBe(2);

            // Retry 3 should fail with max retries error
            await act(async () => {
                const retryResult = await result.current.retry();
                expect(retryResult).toBeNull();
            });
            expect(result.current.error?.message).toContain('Maximum retry attempts');
        });

        it('returns null when no previous deployment to retry', async () => {
            const { result } = renderHook(() => useTokenDeploy('testnet'));

            await act(async () => {
                const retryResult = await result.current.retry();
                expect(retryResult).toBeNull();
            });

            expect(result.current.error?.code).toBe(ErrorCode.INVALID_INPUT);
        });

        it('resets retry count on successful deployment', async () => {
            let callCount = 0;
            vi.mocked(StellarService.prototype.deployToken).mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.reject(new Error('Transaction failed'));
                }
                return Promise.resolve({
                    tokenAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
                    transactionHash: 'abc123',
                    timestamp: Date.now(),
                });
            });

            const { result } = renderHook(() => useTokenDeploy('testnet', { retryDelay: 0 }));

            const params = {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12',
            };

            // First attempt fails
            await act(async () => {
                await expect(result.current.deploy(params)).rejects.toThrow();
            });

            // Retry succeeds
            await act(async () => {
                await result.current.retry();
            });

            expect(result.current.retryCount).toBe(1);

            // New deployment should reset retry count
            await act(async () => {
                await result.current.deploy(params);
            });

            expect(result.current.retryCount).toBe(0);
        });
    });
});
