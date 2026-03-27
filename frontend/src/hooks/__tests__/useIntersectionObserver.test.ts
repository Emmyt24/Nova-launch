import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIntersectionObserver, useLazyLoad } from '../useIntersectionObserver';

describe('useIntersectionObserver', () => {
    let mockObserver: {
        observe: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        unobserve: ReturnType<typeof vi.fn>;
    };
    let observerCallback: IntersectionObserverCallback;

    beforeEach(() => {
        mockObserver = {
            observe: vi.fn(),
            disconnect: vi.fn(),
            unobserve: vi.fn(),
        };

        global.IntersectionObserver = vi.fn().mockImplementation((callback) => {
            observerCallback = callback;
            return mockObserver;
        }) as any;
    });

    describe('initial state', () => {
        it('starts with isVisible as false', () => {
            const { result } = renderHook(() => useIntersectionObserver());

            expect(result.current[1]).toBe(false);
        });

        it('provides a ref', () => {
            const { result } = renderHook(() => useIntersectionObserver());

            expect(result.current[0]).toBeDefined();
            expect(result.current[0].current).toBeNull();
        });
    });

    describe('intersection detection', () => {
        it('sets isVisible to true when element intersects', () => {
            const { result } = renderHook(() => useIntersectionObserver());

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            act(() => {
                observerCallback(
                    [{ isIntersecting: true, target: mockElement } as IntersectionObserverEntry],
                    mockObserver as any
                );
            });

            expect(result.current[1]).toBe(true);
        });

        it('sets isVisible to false when element stops intersecting', () => {
            const { result } = renderHook(() => useIntersectionObserver({ freezeOnceVisible: false }));

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            act(() => {
                observerCallback(
                    [{ isIntersecting: true, target: mockElement } as IntersectionObserverEntry],
                    mockObserver as any
                );
            });

            expect(result.current[1]).toBe(true);

            act(() => {
                observerCallback(
                    [{ isIntersecting: false, target: mockElement } as IntersectionObserverEntry],
                    mockObserver as any
                );
            });

            expect(result.current[1]).toBe(false);
        });
    });

    describe('freezeOnceVisible option', () => {
        it('keeps isVisible true after first intersection when freezeOnceVisible is true', () => {
            const { result } = renderHook(() => useIntersectionObserver({ freezeOnceVisible: true }));

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            act(() => {
                observerCallback(
                    [{ isIntersecting: true, target: mockElement } as IntersectionObserverEntry],
                    mockObserver as any
                );
            });

            expect(result.current[1]).toBe(true);

            act(() => {
                observerCallback(
                    [{ isIntersecting: false, target: mockElement } as IntersectionObserverEntry],
                    mockObserver as any
                );
            });

            expect(result.current[1]).toBe(true);
        });

        it('allows isVisible to change when freezeOnceVisible is false', () => {
            const { result } = renderHook(() => useIntersectionObserver({ freezeOnceVisible: false }));

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            act(() => {
                observerCallback(
                    [{ isIntersecting: true, target: mockElement } as IntersectionObserverEntry],
                    mockObserver as any
                );
            });

            expect(result.current[1]).toBe(true);

            act(() => {
                observerCallback(
                    [{ isIntersecting: false, target: mockElement } as IntersectionObserverEntry],
                    mockObserver as any
                );
            });

            expect(result.current[1]).toBe(false);
        });
    });

    describe('observer options', () => {
        it('passes threshold option to IntersectionObserver', () => {
            const { result } = renderHook(() => useIntersectionObserver({ threshold: 0.5 }));

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            expect(global.IntersectionObserver).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ threshold: 0.5 })
            );
        });

        it('passes rootMargin option to IntersectionObserver', () => {
            const { result } = renderHook(() => useIntersectionObserver({ rootMargin: '50px' }));

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            expect(global.IntersectionObserver).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ rootMargin: '50px' })
            );
        });

        it('passes root option to IntersectionObserver', () => {
            const rootElement = document.createElement('div');
            const { result } = renderHook(() => useIntersectionObserver({ root: rootElement }));

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            expect(global.IntersectionObserver).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ root: rootElement })
            );
        });

        it('supports array threshold', () => {
            const { result } = renderHook(() => useIntersectionObserver({ threshold: [0, 0.5, 1] }));

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            expect(global.IntersectionObserver).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ threshold: [0, 0.5, 1] })
            );
        });
    });

    describe('cleanup', () => {
        it('disconnects observer on unmount', () => {
            const { result, unmount } = renderHook(() => useIntersectionObserver());

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            unmount();

            expect(mockObserver.disconnect).toHaveBeenCalled();
        });

        it('disconnects and recreates observer when options change', () => {
            const { result, rerender } = renderHook(
                ({ threshold }) => useIntersectionObserver({ threshold }),
                { initialProps: { threshold: 0 } }
            );

            const mockElement = document.createElement('div');
            act(() => {
                (result.current[0] as any).current = mockElement;
            });

            expect(mockObserver.disconnect).not.toHaveBeenCalled();

            rerender({ threshold: 0.5 });

            expect(mockObserver.disconnect).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('handles null ref', () => {
            const { result } = renderHook(() => useIntersectionObserver());

            expect(result.current[0].current).toBeNull();
            expect(result.current[1]).toBe(false);
        });

        it('does not observe if element is not set', () => {
            renderHook(() => useIntersectionObserver());

            expect(mockObserver.observe).not.toHaveBeenCalled();
        });
    });
});

describe('useLazyLoad', () => {
    let mockObserver: {
        observe: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        unobserve: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        mockObserver = {
            observe: vi.fn(),
            disconnect: vi.fn(),
            unobserve: vi.fn(),
        };

        global.IntersectionObserver = vi.fn().mockImplementation(() => mockObserver) as any;
    });

    it('uses default lazy load options', () => {
        const { result } = renderHook(() => useLazyLoad());

        const mockElement = document.createElement('div');
        act(() => {
            (result.current[0] as any).current = mockElement;
        });

        expect(global.IntersectionObserver).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                threshold: 0.1,
                rootMargin: '100px',
                freezeOnceVisible: true,
            })
        );
    });

    it('allows overriding default options', () => {
        const { result } = renderHook(() => useLazyLoad({ threshold: 0.5, rootMargin: '50px' }));

        const mockElement = document.createElement('div');
        act(() => {
            (result.current[0] as any).current = mockElement;
        });

        expect(global.IntersectionObserver).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                threshold: 0.5,
                rootMargin: '50px',
            })
        );
    });
});
