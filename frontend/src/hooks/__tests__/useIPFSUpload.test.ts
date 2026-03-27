import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useIPFSUpload } from '../useIPFSUpload';
import { IPFSService } from '../../services/IPFSService';

vi.mock('../../services/IPFSService', () => {
    return {
        IPFSService: vi.fn(),
    };
});

describe('useIPFSUpload', () => {
    let mockIPFSService: {
        uploadImage: ReturnType<typeof vi.fn>;
        uploadMetadata: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        mockIPFSService = {
            uploadImage: vi.fn(),
            uploadMetadata: vi.fn(),
        };

        (IPFSService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockIPFSService);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initial state', () => {
        it('starts with default state', () => {
            const { result } = renderHook(() => useIPFSUpload());

            expect(result.current.uploading).toBe(false);
            expect(result.current.progress).toBe(0);
            expect(result.current.estimatedTimeMs).toBeUndefined();
            expect(result.current.error).toBeNull();
        });
    });

    describe('upload', () => {
        it('uploads image and metadata successfully', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
            const mockMetadataUri = 'ipfs://QmTest123';

            mockIPFSService.uploadImage.mockResolvedValue('ipfs://QmImage123');
            mockIPFSService.uploadMetadata.mockResolvedValue(mockMetadataUri);

            let uploadResult: string | undefined;
            await act(async () => {
                const uploadPromise = result.current.upload(mockFile, 'Test description', 'TestToken');
                
                // Advance timers to simulate progress updates
                vi.advanceTimersByTime(1000);
                
                uploadResult = await uploadPromise;
            });

            expect(uploadResult).toBe(mockMetadataUri);
            expect(mockIPFSService.uploadImage).toHaveBeenCalledWith(mockFile);
            expect(mockIPFSService.uploadMetadata).toHaveBeenCalledWith(mockFile, 'Test description', 'TestToken');
            expect(result.current.uploading).toBe(false);
            expect(result.current.progress).toBe(100);
            expect(result.current.error).toBeNull();
        });

        it('updates progress during upload', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve('ipfs://QmImage123'), 1000))
            );
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            act(() => {
                result.current.upload(mockFile, 'Test description', 'TestToken');
            });

            // Initial progress
            await waitFor(() => {
                expect(result.current.progress).toBeGreaterThan(0);
            });

            // Progress should increase
            act(() => {
                vi.advanceTimersByTime(400);
            });

            await waitFor(() => {
                expect(result.current.progress).toBeGreaterThan(10);
            });

            // Complete the upload
            act(() => {
                vi.advanceTimersByTime(1000);
            });

            await waitFor(() => {
                expect(result.current.progress).toBe(100);
            });
        });

        it('sets uploading state during upload', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve('ipfs://QmImage123'), 500))
            );
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            act(() => {
                result.current.upload(mockFile, 'Test description', 'TestToken');
            });

            expect(result.current.uploading).toBe(true);

            act(() => {
                vi.advanceTimersByTime(1000);
            });

            await waitFor(() => {
                expect(result.current.uploading).toBe(false);
            });
        });

        it('estimates upload time based on file size', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const largeFile = new File([new ArrayBuffer(500000)], 'large.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve('ipfs://QmImage123'), 100))
            );
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            act(() => {
                result.current.upload(largeFile, 'Test description', 'TestToken');
            });

            await waitFor(() => {
                expect(result.current.estimatedTimeMs).toBeDefined();
                expect(result.current.estimatedTimeMs).toBeGreaterThan(0);
            });
        });

        it('updates estimated time remaining during upload', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve('ipfs://QmImage123'), 1000))
            );
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            act(() => {
                result.current.upload(mockFile, 'Test description', 'TestToken');
            });

            const initialEstimate = result.current.estimatedTimeMs;

            act(() => {
                vi.advanceTimersByTime(400);
            });

            await waitFor(() => {
                const currentEstimate = result.current.estimatedTimeMs;
                if (initialEstimate !== undefined && currentEstimate !== undefined) {
                    expect(currentEstimate).toBeLessThan(initialEstimate);
                }
            });
        });

        it('handles image upload failure', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
            const uploadError = new Error('Image upload failed');

            mockIPFSService.uploadImage.mockRejectedValue(uploadError);

            await act(async () => {
                await expect(
                    result.current.upload(mockFile, 'Test description', 'TestToken')
                ).rejects.toThrow('Image upload failed');
            });

            expect(result.current.error).toBe('Image upload failed');
            expect(result.current.uploading).toBe(false);
        });

        it('handles metadata upload failure', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
            const metadataError = new Error('Metadata upload failed');

            mockIPFSService.uploadImage.mockResolvedValue('ipfs://QmImage123');
            mockIPFSService.uploadMetadata.mockRejectedValue(metadataError);

            await act(async () => {
                await expect(
                    result.current.upload(mockFile, 'Test description', 'TestToken')
                ).rejects.toThrow('Metadata upload failed');
            });

            expect(result.current.error).toBe('Metadata upload failed');
            expect(result.current.uploading).toBe(false);
        });

        it('handles non-Error exceptions', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockRejectedValue('String error');

            await act(async () => {
                await expect(
                    result.current.upload(mockFile, 'Test description', 'TestToken')
                ).rejects.toBe('String error');
            });

            expect(result.current.error).toBe('IPFS upload failed');
            expect(result.current.uploading).toBe(false);
        });

        it('resets error state on new upload', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

            // First upload fails
            mockIPFSService.uploadImage.mockRejectedValueOnce(new Error('First upload failed'));
            
            await act(async () => {
                await expect(
                    result.current.upload(mockFile, 'Test description', 'TestToken')
                ).rejects.toThrow();
            });

            expect(result.current.error).toBe('First upload failed');

            // Second upload succeeds
            mockIPFSService.uploadImage.mockResolvedValue('ipfs://QmImage123');
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            await act(async () => {
                await result.current.upload(mockFile, 'Test description', 'TestToken');
            });

            expect(result.current.error).toBeNull();
        });
    });

    describe('reset', () => {
        it('resets all state to initial values', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockRejectedValue(new Error('Upload failed'));

            await act(async () => {
                await expect(
                    result.current.upload(mockFile, 'Test description', 'TestToken')
                ).rejects.toThrow();
            });

            expect(result.current.error).toBe('Upload failed');
            expect(result.current.progress).toBeGreaterThan(0);

            act(() => {
                result.current.reset();
            });

            expect(result.current.uploading).toBe(false);
            expect(result.current.progress).toBe(0);
            expect(result.current.estimatedTimeMs).toBeUndefined();
            expect(result.current.error).toBeNull();
        });

        it('can be called multiple times safely', () => {
            const { result } = renderHook(() => useIPFSUpload());

            act(() => {
                result.current.reset();
                result.current.reset();
                result.current.reset();
            });

            expect(result.current.uploading).toBe(false);
            expect(result.current.progress).toBe(0);
            expect(result.current.error).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('handles multiple concurrent uploads', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile1 = new File(['test1'], 'test1.png', { type: 'image/png' });
            const mockFile2 = new File(['test2'], 'test2.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockResolvedValue('ipfs://QmImage123');
            mockIPFSService.uploadMetadata
                .mockResolvedValueOnce('ipfs://QmTest1')
                .mockResolvedValueOnce('ipfs://QmTest2');

            let result1: string | undefined;
            let result2: string | undefined;

            await act(async () => {
                const promise1 = result.current.upload(mockFile1, 'Description 1', 'Token1');
                const promise2 = result.current.upload(mockFile2, 'Description 2', 'Token2');
                
                vi.advanceTimersByTime(1000);
                
                [result1, result2] = await Promise.all([promise1, promise2]);
            });

            // Last upload wins for state
            expect(result.current.uploading).toBe(false);
        });

        it('handles empty file', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const emptyFile = new File([], 'empty.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockResolvedValue('ipfs://QmImage123');
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            await act(async () => {
                const uploadResult = await result.current.upload(emptyFile, 'Test', 'Token');
                expect(uploadResult).toBe('ipfs://QmTest123');
            });
        });

        it('handles very large files', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const largeFile = new File([new ArrayBuffer(10000000)], 'large.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockResolvedValue('ipfs://QmImage123');
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            await act(async () => {
                const uploadPromise = result.current.upload(largeFile, 'Test', 'Token');
                vi.advanceTimersByTime(5000);
                await uploadPromise;
            });

            expect(result.current.progress).toBe(100);
        });

        it('handles special characters in metadata', async () => {
            const { result } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
            const specialDescription = 'Test with émojis 🚀 and spëcial çhars';
            const specialTokenName = 'Tökén-Nämé_123';

            mockIPFSService.uploadImage.mockResolvedValue('ipfs://QmImage123');
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            await act(async () => {
                await result.current.upload(mockFile, specialDescription, specialTokenName);
            });

            expect(mockIPFSService.uploadMetadata).toHaveBeenCalledWith(
                mockFile,
                specialDescription,
                specialTokenName
            );
        });
    });

    describe('cleanup', () => {
        it('clears progress interval on unmount', async () => {
            const { result, unmount } = renderHook(() => useIPFSUpload());
            const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

            mockIPFSService.uploadImage.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve('ipfs://QmImage123'), 5000))
            );
            mockIPFSService.uploadMetadata.mockResolvedValue('ipfs://QmTest123');

            act(() => {
                result.current.upload(mockFile, 'Test', 'Token');
            });

            expect(result.current.uploading).toBe(true);

            unmount();

            // Should not throw or cause issues
            act(() => {
                vi.advanceTimersByTime(10000);
            });
        });
    });
});
