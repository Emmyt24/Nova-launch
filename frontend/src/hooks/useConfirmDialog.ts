import { useState, useCallback } from 'react';
import type { ConfirmDialogAction, FeeItem } from '../components/UI/ConfirmDialog';

export interface ConfirmDialogOptions {
    title: string;
    message: string;
    action: ConfirmDialogAction;
    fees?: FeeItem[];
    consequences?: string[];
    confirmText?: string;
    cancelText?: string;
    requireExplicitConfirm?: boolean;
    confirmButtonVariant?: 'primary' | 'danger';
}

export function useConfirmDialog() {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
    const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

    const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
        setOptions(opts);
        setIsOpen(true);

        return new Promise<boolean>((resolve) => {
            setResolvePromise(() => resolve);
        });
    }, []);

    const handleConfirm = useCallback(() => {
        setIsOpen(false);
        if (resolvePromise) {
            resolvePromise(true);
            setResolvePromise(null);
        }
    }, [resolvePromise]);

    const handleCancel = useCallback(() => {
        setIsOpen(false);
        if (resolvePromise) {
            resolvePromise(false);
            setResolvePromise(null);
        }
    }, [resolvePromise]);

    return {
        isOpen,
        options,
        confirm,
        handleConfirm,
        handleCancel,
    };
}
