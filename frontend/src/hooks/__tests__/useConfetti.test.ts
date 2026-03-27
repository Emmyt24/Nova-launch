import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfetti } from '../useConfetti';
import confetti from 'canvas-confetti';

vi.mock('canvas-confetti');

describe('useConfetti', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.mocked(confetti).mockReturnValue(null);
        
        // Mock matchMedia
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation(query => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initial state', () => {
        it('provides fire and stop functions', () => {
            const { result } = renderHook(() => useConfetti());

            expect(result.current.fire).toBeDefined();
            expect(result.current.stop).toBeDefined();
        });
    });

    describe('fire', () => {
        it('fires confetti burst', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
            });

            expect(confetti).toHaveBeenCalled();
        });

        it('fires confetti from both sides', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            expect(confetti).toHaveBeenCalledTimes(2);
        });

        it('uses custom colors', () => {
            const customColors = ['#FF0000', '#00FF00', '#0000FF'];
            const { result } = renderHook(() => useConfetti({ colors: customColors }));

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            expect(confetti).toHaveBeenCalledWith(
                expect.objectContaining({
                    colors: customColors,
                })
            );
        });

        it('respects custom duration', () => {
            const { result } = renderHook(() => useConfetti({ duration: 1000 }));

            act(() => {
                result.current.fire();
            });

            expect(confetti).toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(1000);
            });

            const callCount = vi.mocked(confetti).mock.calls.length;

            act(() => {
                vi.advanceTimersByTime(100);
            });

            expect(vi.mocked(confetti).mock.calls.length).toBe(callCount);
        });

        it('does not fire when prefers-reduced-motion is enabled', () => {
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                value: vi.fn().mockImplementation(query => ({
                    matches: query === '(prefers-reduced-motion: reduce)',
                    media: query,
                    onchange: null,
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    dispatchEvent: vi.fn(),
                })),
            });

            const { result } = renderHook(() => useConfetti({ disableForReducedMotion: true }));

            act(() => {
                result.current.fire();
            });

            expect(confetti).not.toHaveBeenCalled();
        });

        it('fires when disableForReducedMotion is false', () => {
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                value: vi.fn().mockImplementation(query => ({
                    matches: query === '(prefers-reduced-motion: reduce)',
                    media: query,
                    onchange: null,
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    dispatchEvent: vi.fn(),
                })),
            });

            const { result } = renderHook(() => useConfetti({ disableForReducedMotion: false }));

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            expect(confetti).toHaveBeenCalled();
        });

        it('stops previous burst when firing again', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            const firstCallCount = vi.mocked(confetti).mock.calls.length;

            act(() => {
                result.current.fire();
            });

            vi.mocked(confetti).mockClear();

            act(() => {
                vi.advanceTimersByTime(100);
            });

            expect(vi.mocked(confetti).mock.calls.length).toBeGreaterThan(0);
        });
    });

    describe('stop', () => {
        it('stops confetti burst', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            const callCountBeforeStop = vi.mocked(confetti).mock.calls.length;

            act(() => {
                result.current.stop();
                vi.advanceTimersByTime(1000);
            });

            expect(vi.mocked(confetti).mock.calls.length).toBe(callCountBeforeStop);
        });

        it('can be called multiple times safely', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
            });

            act(() => {
                result.current.stop();
                result.current.stop();
                result.current.stop();
            });

            expect(() => result.current.stop()).not.toThrow();
        });
    });

    describe('cleanup', () => {
        it('stops confetti on unmount', () => {
            const { result, unmount } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            const callCountBeforeUnmount = vi.mocked(confetti).mock.calls.length;

            unmount();

            act(() => {
                vi.advanceTimersByTime(1000);
            });

            expect(vi.mocked(confetti).mock.calls.length).toBe(callCountBeforeUnmount);
        });
    });

    describe('confetti parameters', () => {
        it('uses correct default parameters', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            expect(confetti).toHaveBeenCalledWith(
                expect.objectContaining({
                    startVelocity: 30,
                    spread: 360,
                    ticks: 60,
                    zIndex: 9999,
                })
            );
        });

        it('fires from random positions', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            const calls = vi.mocked(confetti).mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            
            const origins = calls.map(call => call[0]?.origin);
            expect(origins.some(origin => origin?.x !== undefined)).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('handles rapid fire calls', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
                result.current.fire();
                result.current.fire();
            });

            expect(confetti).toHaveBeenCalled();
        });

        it('handles fire after stop', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            act(() => {
                result.current.stop();
            });

            vi.mocked(confetti).mockClear();

            act(() => {
                result.current.fire();
                vi.advanceTimersByTime(100);
            });

            expect(confetti).toHaveBeenCalled();
        });
    });
});
