import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePWA } from '../usePWA';
import * as pwaService from '../../services/pwa';

vi.mock('../../services/pwa');

describe('usePWA', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(pwaService.isUpdateAvailable).mockReturnValue(false);
        vi.mocked(pwaService.isInstalledPWA).mockReturnValue(false);
        
        Object.defineProperty(navigator, 'onLine', {
            writable: true,
            value: true,
        });
    });

    describe('initial state', () => {
        it('initializes with correct default state', () => {
            const { result } = renderHook(() => usePWA());

            expect(result.current.updateAvailable).toBe(false);
            expect(result.current.installPromptAvailable).toBe(false);
            expect(result.current.isInstalled).toBe(false);
            expect(result.current.isOnline).toBe(true);
        });

        it('detects installed PWA', () => {
            vi.mocked(pwaService.isInstalledPWA).mockReturnValue(true);

            const { result } = renderHook(() => usePWA());

            expect(result.current.isInstalled).toBe(true);
        });

        it('detects available update', () => {
            vi.mocked(pwaService.isUpdateAvailable).mockReturnValue(true);

            const { result } = renderHook(() => usePWA());

            expect(result.current.updateAvailable).toBe(true);
        });

        it('detects offline state', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false,
            });

            const { result } = renderHook(() => usePWA());

            expect(result.current.isOnline).toBe(false);
        });
    });

    describe('update available event', () => {
        it('updates state when sw-update-available event fires', () => {
            const { result } = renderHook(() => usePWA());

            expect(result.current.updateAvailable).toBe(false);

            act(() => {
                window.dispatchEvent(new Event('sw-update-available'));
            });

            expect(result.current.updateAvailable).toBe(true);
        });
    });

    describe('install prompt event', () => {
        it('updates state when install-prompt-available event fires', () => {
            const { result } = renderHook(() => usePWA());

            expect(result.current.installPromptAvailable).toBe(false);

            act(() => {
                window.dispatchEvent(new Event('install-prompt-available'));
            });

            expect(result.current.installPromptAvailable).toBe(true);
        });
    });

    describe('online/offline events', () => {
        it('updates state when going online', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false,
            });

            const { result } = renderHook(() => usePWA());

            expect(result.current.isOnline).toBe(false);

            act(() => {
                Object.defineProperty(navigator, 'onLine', {
                    writable: true,
                    value: true,
                });
                window.dispatchEvent(new Event('online'));
            });

            expect(result.current.isOnline).toBe(true);
        });

        it('updates state when going offline', () => {
            const { result } = renderHook(() => usePWA());

            expect(result.current.isOnline).toBe(true);

            act(() => {
                Object.defineProperty(navigator, 'onLine', {
                    writable: true,
                    value: false,
                });
                window.dispatchEvent(new Event('offline'));
            });

            expect(result.current.isOnline).toBe(false);
        });
    });

    describe('app installed event', () => {
        it('updates state when app-installed event fires', () => {
            const { result } = renderHook(() => usePWA());

            expect(result.current.isInstalled).toBe(false);
            expect(result.current.installPromptAvailable).toBe(false);

            act(() => {
                window.dispatchEvent(new Event('install-prompt-available'));
            });

            expect(result.current.installPromptAvailable).toBe(true);

            act(() => {
                window.dispatchEvent(new Event('app-installed'));
            });

            expect(result.current.isInstalled).toBe(true);
            expect(result.current.installPromptAvailable).toBe(false);
        });
    });

    describe('acceptUpdate', () => {
        it('calls acceptServiceWorkerUpdate and returns result', async () => {
            vi.mocked(pwaService.acceptUpdate).mockResolvedValue(true);

            const { result } = renderHook(() => usePWA());

            let updateResult;
            await act(async () => {
                updateResult = await result.current.acceptUpdate();
            });

            expect(updateResult).toBe(true);
            expect(pwaService.acceptUpdate).toHaveBeenCalled();
        });

        it('handles update failure', async () => {
            vi.mocked(pwaService.acceptUpdate).mockResolvedValue(false);

            const { result } = renderHook(() => usePWA());

            let updateResult;
            await act(async () => {
                updateResult = await result.current.acceptUpdate();
            });

            expect(updateResult).toBe(false);
        });
    });

    describe('showInstallPrompt', () => {
        it('calls showPwaInstallPrompt and updates state on success', async () => {
            vi.mocked(pwaService.showInstallPrompt).mockResolvedValue(true);

            const { result } = renderHook(() => usePWA());

            let installResult;
            await act(async () => {
                installResult = await result.current.showInstallPrompt();
            });

            expect(installResult).toBe(true);
            expect(pwaService.showInstallPrompt).toHaveBeenCalled();
            expect(result.current.isInstalled).toBe(true);
            expect(result.current.installPromptAvailable).toBe(false);
        });

        it('does not update state on install failure', async () => {
            vi.mocked(pwaService.showInstallPrompt).mockResolvedValue(false);

            const { result } = renderHook(() => usePWA());

            act(() => {
                window.dispatchEvent(new Event('install-prompt-available'));
            });

            expect(result.current.installPromptAvailable).toBe(true);

            let installResult;
            await act(async () => {
                installResult = await result.current.showInstallPrompt();
            });

            expect(installResult).toBe(false);
            expect(result.current.isInstalled).toBe(false);
            expect(result.current.installPromptAvailable).toBe(true);
        });
    });

    describe('cleanup', () => {
        it('removes event listeners on unmount', () => {
            const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

            const { unmount } = renderHook(() => usePWA());

            unmount();

            expect(removeEventListenerSpy).toHaveBeenCalledWith('sw-update-available', expect.any(Function));
            expect(removeEventListenerSpy).toHaveBeenCalledWith('install-prompt-available', expect.any(Function));
            expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
            expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
            expect(removeEventListenerSpy).toHaveBeenCalledWith('app-installed', expect.any(Function));
        });
    });

    describe('edge cases', () => {
        it('handles multiple update events', () => {
            const { result } = renderHook(() => usePWA());

            act(() => {
                window.dispatchEvent(new Event('sw-update-available'));
                window.dispatchEvent(new Event('sw-update-available'));
                window.dispatchEvent(new Event('sw-update-available'));
            });

            expect(result.current.updateAvailable).toBe(true);
        });

        it('handles rapid online/offline changes', () => {
            const { result } = renderHook(() => usePWA());

            act(() => {
                window.dispatchEvent(new Event('offline'));
                window.dispatchEvent(new Event('online'));
                window.dispatchEvent(new Event('offline'));
                window.dispatchEvent(new Event('online'));
            });

            expect(result.current.isOnline).toBe(true);
        });
    });
});
