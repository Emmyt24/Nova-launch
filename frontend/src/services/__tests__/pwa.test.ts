import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerServiceWorker,
  captureInstallPrompt,
  showInstallPrompt,
  isInstalledPWA,
  isUpdateAvailable,
  acceptUpdate,
} from '../pwa';

describe('PWA Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isInstalledPWA', () => {
    it('returns true when display-mode is standalone', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: query === '(display-mode: standalone)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });

      expect(isInstalledPWA()).toBe(true);
    });

    it('returns false when not in standalone mode', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });

      expect(isInstalledPWA()).toBe(false);
    });
  });

  describe('registerServiceWorker', () => {
    it('returns null when service worker is not supported', async () => {
      const originalServiceWorker = navigator.serviceWorker;
      // @ts-expect-error - Testing unsupported environment
      delete navigator.serviceWorker;

      const result = await registerServiceWorker();
      expect(result).toBeNull();

      // Restore
      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalServiceWorker,
        writable: true,
      });
    });

    it('registers service worker successfully', async () => {
      const mockRegistration = {
        waiting: null,
        installing: null,
        active: null,
        addEventListener: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      };

      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        writable: true,
      });

      const result = await registerServiceWorker();
      expect(result).toBe(mockRegistration);
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
    });
  });

  describe('captureInstallPrompt', () => {
    it('captures beforeinstallprompt event', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      captureInstallPrompt();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beforeinstallprompt',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'appinstalled',
        expect.any(Function)
      );
    });

    it('dispatches install-prompt-available event', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
      captureInstallPrompt();

      const mockEvent = new Event('beforeinstallprompt');
      Object.defineProperty(mockEvent, 'preventDefault', {
        value: vi.fn(),
      });

      window.dispatchEvent(mockEvent);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'install-prompt-available',
        })
      );
    });
  });

  describe('showInstallPrompt', () => {
    it('returns false when no deferred prompt', async () => {
      const result = await showInstallPrompt();
      expect(result).toBe(false);
    });
  });

  describe('isUpdateAvailable', () => {
    it('returns false initially', () => {
      expect(isUpdateAvailable()).toBe(false);
    });
  });

  describe('acceptUpdate', () => {
    it('returns false when no waiting service worker', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          getRegistration: vi.fn().mockResolvedValue({
            waiting: null,
          }),
        },
        writable: true,
      });

      const result = await acceptUpdate();
      expect(result).toBe(false);
    });

    it('posts SKIP_WAITING message to waiting worker', async () => {
      const mockWaiting = {
        postMessage: vi.fn(),
      };

      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          getRegistration: vi.fn().mockResolvedValue({
            waiting: mockWaiting,
          }),
        },
        writable: true,
      });

      const result = await acceptUpdate();
      expect(result).toBe(true);
      expect(mockWaiting.postMessage).toHaveBeenCalledWith({
        type: 'SKIP_WAITING',
      });
    });
  });
});
