import React, { useEffect, useState } from 'react';
import { Button } from './Button';

export type ConfirmDialogAction = 
    | 'deploy'
    | 'mint'
    | 'burn'
    | 'network-switch'
    | 'metadata-upload'
    | 'custom';

export interface FeeItem {
    label: string;
    amount: string;
    description?: string;
}

export interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    message: string;
    action: ConfirmDialogAction;
    fees?: FeeItem[];
    consequences?: string[];
    confirmText?: string;
    cancelText?: string;
    requireExplicitConfirm?: boolean;
    confirmButtonVariant?: 'primary' | 'danger';
    isProcessing?: boolean;
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    action,
    fees = [],
    consequences = [],
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    requireExplicitConfirm = false,
    confirmButtonVariant = 'primary',
    isProcessing = false,
}: ConfirmDialogProps) {
    const [explicitConfirm, setExplicitConfirm] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setExplicitConfirm(false);
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                if (!isConfirming && !isProcessing) {
                    onClose();
                }
            }

            if (e.key === 'Enter' && !requireExplicitConfirm) {
                e.preventDefault();
                if (!isConfirming && !isProcessing) {
                    handleConfirm();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isConfirming, isProcessing, requireExplicitConfirm, onClose]);

    const handleConfirm = async () => {
        if (requireExplicitConfirm && !explicitConfirm) {
            return;
        }

        setIsConfirming(true);
        try {
            await onConfirm();
        } finally {
            setIsConfirming(false);
        }
    };

    const getTotalFee = () => {
        if (fees.length === 0) return null;
        const total = fees.reduce((sum, fee) => {
            const amount = parseFloat(fee.amount.replace(/[^\d.]/g, ''));
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
        return total.toFixed(7);
    };

    const getActionIcon = () => {
        switch (action) {
            case 'deploy':
                return (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                );
            case 'mint':
                return (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                );
            case 'burn':
                return (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    </svg>
                );
            case 'network-switch':
                return (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                );
            case 'metadata-upload':
                return (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                );
            default:
                return (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                );
        }
    };

    if (!isOpen) return null;

    const totalFee = getTotalFee();
    const canConfirm = !requireExplicitConfirm || explicitConfirm;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 animate-fadeIn"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isConfirming && !isProcessing) {
                    onClose();
                }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
        >
            <div
                className="relative bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-slideUp"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with Icon */}
                <div className="flex items-start gap-4 px-6 py-5 border-b border-gray-200">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                        confirmButtonVariant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                        {getActionIcon()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 id="confirm-dialog-title" className="text-xl font-semibold text-gray-900">
                            {title}
                        </h2>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-4 space-y-4">
                    <p id="confirm-dialog-description" className="text-gray-700">
                        {message}
                    </p>

                    {/* Fee Breakdown */}
                    {fees.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Fee Breakdown</h3>
                            {fees.map((fee, index) => (
                                <div key={index} className="flex justify-between items-start text-sm">
                                    <div className="flex-1">
                                        <div className="text-gray-700">{fee.label}</div>
                                        {fee.description && (
                                            <div className="text-xs text-gray-500 mt-0.5">{fee.description}</div>
                                        )}
                                    </div>
                                    <div className="font-medium text-gray-900 ml-4">{fee.amount}</div>
                                </div>
                            ))}
                            {totalFee && fees.length > 1 && (
                                <>
                                    <div className="border-t border-gray-200 my-2"></div>
                                    <div className="flex justify-between items-center text-sm font-semibold">
                                        <div className="text-gray-900">Total</div>
                                        <div className="text-gray-900">{totalFee} XLM</div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Consequences */}
                    {consequences.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Important
                            </h3>
                            <ul className="space-y-1.5 text-sm text-yellow-800">
                                {consequences.map((consequence, index) => (
                                    <li key={index} className="flex items-start gap-2">
                                        <span className="text-yellow-600 mt-0.5">•</span>
                                        <span>{consequence}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Explicit Confirmation Checkbox */}
                    {requireExplicitConfirm && (
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={explicitConfirm}
                                onChange={(e) => setExplicitConfirm(e.target.checked)}
                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                                disabled={isConfirming || isProcessing}
                            />
                            <span className="text-sm text-gray-700 group-hover:text-gray-900">
                                I understand the consequences and want to proceed
                            </span>
                        </label>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isConfirming || isProcessing}
                        className="min-w-[100px]"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={confirmButtonVariant}
                        onClick={handleConfirm}
                        disabled={!canConfirm || isConfirming || isProcessing}
                        loading={isConfirming || isProcessing}
                        className="min-w-[100px]"
                    >
                        {confirmText}
                    </Button>
                </div>

                {/* Keyboard Hints */}
                {!requireExplicitConfirm && !isConfirming && !isProcessing && (
                    <div className="px-6 pb-3 text-xs text-gray-500 text-center">
                        Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">Enter</kbd> to confirm or{' '}
                        <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">Esc</kbd> to cancel
                    </div>
                )}
            </div>
        </div>
    );
}
