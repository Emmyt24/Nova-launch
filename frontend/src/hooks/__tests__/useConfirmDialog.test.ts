import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConfirmDialog } from '../useConfirmDialog';

describe('useConfirmDialog', () => {
    beforeEach(() => {
        // Reset any state between tests
    });

    it('should initialize with closed state', () => {
        const { result } = renderHook(() => useConfirmDialog());
        
        expect(result.current.isOpen).toBe(false);
        expect(result.current.options).toBeNull();
    });

    it('should open dialog with options when confirm is called', async () => {
        const { result } = renderHook(() => useConfirmDialog());
        
        const options = {
            title: 'Test Dialog',
            message: 'Test message',
            action: 'deploy' as const,
        };

        let confirmPromise: Promise<boolean>;
        
        act(() => {
            confirmPromise = result.current.confirm(options);
        });

        expect(result.current.isOpen).toBe(true);
        expect(result.current.options).toEqual(options);
    });

    it('should resolve with true when handleConfirm is called', async () => {
        const { result } = renderHook(() => useConfirmDialog());
        
        let confirmPromise: Promise<boolean>;
        
        act(() => {
            confirmPromise = result.current.confirm({
                title: 'Test',
                message: 'Test',
                action: 'deploy',
            });
        });

        act(() => {
            result.current.handleConfirm();
        });

        await waitFor(async () => {
            const resolved = await confirmPromise;
            expect(resolved).toBe(true);
        });

        expect(result.current.isOpen).toBe(false);
    });

    it('should resolve with false when handleCancel is called', async () => {
        const { result } = renderHook(() => useConfirmDialog());
        
        let confirmPromise: Promise<boolean>;
        
        act(() => {
            confirmPromise = result.current.confirm({
                title: 'Test',
                message: 'Test',
                action: 'deploy',
            });
        });

        act(() => {
            result.current.handleCancel();
        });

        await waitFor(async () => {
            const resolved = await confirmPromise;
            expect(resolved).toBe(false);
        });

        expect(result.current.isOpen).toBe(false);
    });

    it('should handle multiple sequential confirmations', async () => {
        const { result } = renderHook(() => useConfirmDialog());
        
        // First confirmation
        let firstPromise: Promise<boolean>;
        act(() => {
            firstPromise = result.current.confirm({
                title: 'First',
                message: 'First message',
                action: 'deploy',
            });
        });

        act(() => {
            result.current.handleConfirm();
        });

        const firstResult = await firstPromise;
        expect(firstResult).toBe(true);

        // Second confirmation
        let secondPromise: Promise<boolean>;
        act(() => {
            secondPromise = result.current.confirm({
                title: 'Second',
                message: 'Second message',
                action: 'mint',
            });
        });

        act(() => {
            result.current.handleCancel();
        });

        const secondResult = await secondPromise;
        expect(secondResult).toBe(false);
    });

    it('should preserve options until new confirmation', async () => {
        const { result } = renderHook(() => useConfirmDialog());
        
        const options = {
            title: 'Test',
            message: 'Test message',
            action: 'deploy' as const,
            fees: [{ label: 'Fee', amount: '0.001 XLM' }],
        };

        act(() => {
            result.current.confirm(options);
        });

        expect(result.current.options).toEqual(options);

        act(() => {
            result.current.handleConfirm();
        });

        // Options should still be available after confirmation
        expect(result.current.options).toEqual(options);
    });

    it('should handle confirmation with all optional parameters', async () => {
        const { result } = renderHook(() => useConfirmDialog());
        
        const options = {
            title: 'Deploy Token',
            message: 'Deploy your token?',
            action: 'deploy' as const,
            fees: [
                { label: 'Base Fee', amount: '0.00001 XLM' },
                { label: 'Gas Fee', amount: '0.00005 XLM' },
            ],
            consequences: [
                'Action cannot be undone',
                'Fees will be deducted',
            ],
            confirmText: 'Deploy Now',
            cancelText: 'Go Back',
            requireExplicitConfirm: true,
            confirmButtonVariant: 'danger' as const,
        };

        let confirmPromise: Promise<boolean>;
        
        act(() => {
            confirmPromise = result.current.confirm(options);
        });

        expect(result.current.options).toEqual(options);

        act(() => {
            result.current.handleConfirm();
        });

        const result_value = await confirmPromise;
        expect(result_value).toBe(true);
    });

    it('should handle rapid confirm calls', async () => {
        const { result } = renderHook(() => useConfirmDialog());
        
        const promises: Promise<boolean>[] = [];

        // Call confirm multiple times rapidly
        act(() => {
            promises.push(result.current.confirm({
                title: 'First',
                message: 'First',
                action: 'deploy',
            }));
        });

        // The second call should override the first
        act(() => {
            promises.push(result.current.confirm({
                title: 'Second',
                message: 'Second',
                action: 'mint',
            }));
        });

        expect(result.current.options?.title).toBe('Second');

        act(() => {
            result.current.handleConfirm();
        });

        // Only the last promise should resolve
        const lastResult = await promises[promises.length - 1];
        expect(lastResult).toBe(true);
    });
});
