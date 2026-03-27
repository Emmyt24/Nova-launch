import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCopyToClipboard } from '../useCopyToClipboard';

describe('useCopyToClipboard', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initial state', () => {
        it('starts with copied as false', () => {
            const { result } = renderHook(() => useCopyToClipboard());

            expect(result.current.copied).toBe(false);
        });
    });

    describe('copy', () => {
        it('copies text to clipboard successfully', async () => {
            const mockWriteText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: {
                    writeText: mockWriteText,
                },
            });

            const { result } = renderHook(() => useCopyToClipboard());

            let success;
            await act(async () => {
                success = await result.current.copy('test text');
            });

            expect(success).toBe(true);
            expect(mockWriteText).toHaveBeenCalledWith('test text');
            expect(result.current.copied).toBe(true);
        });

        it('resets copied state after delay', async () => {
            const mockWriteText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: {
                    writeText: mockWriteText,
                },
            });

            const { result } = renderHook(() => useCopyToClipboard(1000));

            await act(async () => {
                await result.current.copy('test text');
            });

            expect(result.current.copied).toBe(true);

            act(() => {
                vi.advanceTimersByTime(1000);
            });

            await waitFor(() => {
                expect(result.current.copied).toBe(false);
            });
        });

        it('uses custom reset delay', async () => {
            const mockWriteText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: {
                    writeText: mockWriteText,
                },
            });

            const { result } = renderHook(() => useCopyToClipboard(3000));

            await act(async () => {
                await result.current.copy('test text');
            });

            expect(result.current.copied).toBe(true);

            act(() => {
                vi.advanceTimersByTime(2000);
            });

            expect(result.current.copied).toBe(true);

            act(() => {
                vi.advanceTimersByTime(1000);
            });

            await waitFor(() => {
                expect(result.current.copied).toBe(false);
            });
        });

        it('falls back to execCommand when clipboard API fails', async () => {
            Object.assign(navigator, {
                clipboard: {
                    writeText: vi.fn().mockRejectedValue(new Error('Not allowed')),
                },
            });

            const mockExecCommand = vi.fn().mockReturnValue(true);
            document.execCommand = mockExecCommand;

            const { result } = renderHook(() => useCopyToClipboard());

            let success;
            await act(async () => {
                success = await result.current.copy('test text');
            });

            expect(success).toBe(true);
            expect(mockExecCommand).toHaveBeenCalledWith('copy');
            expect(result.current.copied).toBe(true);
        });

        it('returns false when both methods fail', async () => {
            Object.assign(navigator, {
                clipboard: {
                    writeText: vi.fn().mockRejectedValue(new Error('Not allowed')),
                },
            });

            const mockExecCommand = vi.fn().mockReturnValue(false);
            document.execCommand = mockExecCommand;

            const { result } = renderHook(() => useCopyToClipboard());

            let success;
            await act(async () => {
                success = await result.current.copy('test text');
            });

            expect(success).toBe(false);
            expect(result.current.copied).toBe(false);
        });

        it('handles execCommand exception', async () => {
            Object.assign(navigator, {
                clipboard: {
                    writeText: vi.fn().mockRejectedValue(new Error('Not allowed')),
                },
            });

            document.execCommand = vi.fn().mockImplementation(() => {
                throw new Error('execCommand failed');
            });

            const { result } = renderHook(() => useCopyToClipboard());

            let success;
            await act(async () => {
                success = await result.current.copy('test text');
            });

            expect(success).toBe(false);
            expect(result.current.copied).toBe(false);
        });
    });

    describe('reset', () => {
        it('manually resets copied state', async () => {
            const mockWriteText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: {
                    writeText: mockWriteText,
                },
            });

            const { result } = renderHook(() => useCopyToClipboard());

            await act(async () => {
                await result.current.copy('test text');
            });

            expect(result.current.copied).toBe(true);

            act(() => {
                result.current.reset();
            });

            expect(result.current.copied).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('handles empty string', async () => {
            const mockWriteText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: {
                    writeText: mockWriteText,
                },
            });

            const { result } = renderHook(() => useCopyToClipboard());

            await act(async () => {
                await result.current.copy('');
            });

            expect(mockWriteText).toHaveBeenCalledWith('');
            expect(result.current.copied).toBe(true);
        });

        it('handles special characters', async () => {
            const mockWriteText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: {
                    writeText: mockWriteText,
                },
            });

            const { result } = renderHook(() => useCopyToClipboard());

            const specialText = '!@#$%^&*()_+{}[]|\\:";\'<>?,./';
            await act(async () => {
                await result.current.copy(specialText);
            });

            expect(mockWriteText).toHaveBeenCalledWith(specialText);
            expect(result.current.copied).toBe(true);
        });

        it('handles multiple copy calls', async () => {
            const mockWriteText = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: {
                    writeText: mockWriteText,
                },
            });

            const { result } = renderHook(() => useCopyToClipboard(1000));

            await act(async () => {
                await result.current.copy('first');
            });

            expect(result.current.copied).toBe(true);

            await act(async () => {
                await result.current.copy('second');
            });

            expect(result.current.copied).toBe(true);
            expect(mockWriteText).toHaveBeenCalledTimes(2);
        });
    });
});
