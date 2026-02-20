import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPFSService } from '../IPFSService';
import type { TokenMetadata } from '../../types';

global.fetch = vi.fn();

describe('IPFSService', () => {
    let service: IPFSService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new IPFSService();
    });

    describe('uploadMetadata', () => {
        it('uploads image and metadata successfully', async () => {
            const mockImageHash = 'QmImageHash123';
            const mockMetadataHash = 'QmMetadataHash456';

            (global.fetch as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ IpfsHash: mockImageHash }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ IpfsHash: mockMetadataHash }),
                });

            const image = new File(['image'], 'test.png', { type: 'image/png' });
            const uri = await service.uploadMetadata(image, 'Test description', 'Test Token');

            expect(uri).toBe(`ipfs://${mockMetadataHash}`);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('throws error when upload fails', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                statusText: 'Unauthorized',
            });

            const image = new File(['image'], 'test.png', { type: 'image/png' });

            await expect(
                service.uploadMetadata(image, 'Test description', 'Test Token')
            ).rejects.toThrow('IPFS upload failed');
        });

        it('generates correct metadata structure', async () => {
            const mockImageHash = 'QmImageHash123';
            const mockMetadataHash = 'QmMetadataHash456';

            let capturedMetadata: TokenMetadata | null = null;

            (global.fetch as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ IpfsHash: mockImageHash }),
                })
                .mockImplementationOnce(async (url: string, options: any) => {
                    const formData = options.body as FormData;
                    const file = formData.get('file') as File;
                    const text = await file.text();
                    capturedMetadata = JSON.parse(text);

                    return {
                        ok: true,
                        json: async () => ({ IpfsHash: mockMetadataHash }),
                    };
                });

            const image = new File(['image'], 'test.png', { type: 'image/png' });
            await service.uploadMetadata(image, 'Test description', 'Test Token');

            expect(capturedMetadata).toEqual({
                name: 'Test Token',
                description: 'Test description',
                image: `ipfs://${mockImageHash}`,
            });
        });
    });

    describe('getMetadata', () => {
        it('fetches metadata successfully', async () => {
            const mockMetadata: TokenMetadata = {
                name: 'Test Token',
                description: 'Test description',
                image: 'ipfs://QmImageHash',
            };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockMetadata,
            });

            const result = await service.getMetadata('ipfs://QmMetadataHash');

            expect(result).toEqual(mockMetadata);
        });

        it('tries fallback gateways on failure', async () => {
            const mockMetadata: TokenMetadata = {
                name: 'Test Token',
                description: 'Test description',
                image: 'ipfs://QmImageHash',
            };

            (global.fetch as any)
                .mockRejectedValueOnce(new Error('Gateway 1 failed'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockMetadata,
                });

            const result = await service.getMetadata('ipfs://QmMetadataHash');

            expect(result).toEqual(mockMetadata);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('throws error when all gateways fail', async () => {
            (global.fetch as any).mockRejectedValue(new Error('Network error'));

            await expect(service.getMetadata('ipfs://QmMetadataHash')).rejects.toThrow(
                'Failed to fetch metadata from all gateways'
            );
        });

        it('validates metadata structure', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ name: 'Test' }),
            });

            await expect(service.getMetadata('ipfs://QmMetadataHash')).rejects.toThrow();
        });

        it('caches metadata after first fetch', async () => {
            const mockMetadata: TokenMetadata = {
                name: 'Test Token',
                description: 'Test description',
                image: 'ipfs://QmImageHash',
            };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockMetadata,
            });

            const uri = 'ipfs://QmMetadataHash';
            await service.getMetadata(uri);
            const cachedResult = await service.getMetadata(uri);

            expect(cachedResult).toEqual(mockMetadata);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
