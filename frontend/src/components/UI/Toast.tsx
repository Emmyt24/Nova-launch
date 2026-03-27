import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastType } from '../../providers/ToastProvider';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastProps {
    id: string;
    message: string;
    type?: ToastType;
    onClose: (id: string) => void;
    duration?: number;
    action?: ToastAction;
    showProgress?: boolean;
}

export function Toast({ id, message, type = 'info', onClose, duration = 5000, action, showProgress = true }: ToastProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [progress, setProgress] = useState(100);
    const closeTimerRef = useRef<number | null>(null);
    const progressIntervalRef = useRef<number | null>(null);

    const dismiss = useCallback(() => {
        if (isExiting) {
            return;
        }

        setIsExiting(true);
        closeTimerRef.current = window.setTimeout(() => {
            onClose(id);
        }, 300);
    }, [id, isExiting, onClose]);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            setIsVisible(true);
        });
        return () => window.cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        if (showProgress && duration > 0) {
            const interval = 50;
            const decrement = (interval / duration) * 100;
            
            progressIntervalRef.current = window.setInterval(() => {
                setProgress((prev) => {
                    const next = prev - decrement;
                    return next < 0 ? 0 : next;
                });
            }, interval);
        }

        const timer = window.setTimeout(dismiss, duration);
        
        return () => {
            window.clearTimeout(timer);
            if (progressIntervalRef.current !== null) {
                window.clearInterval(progressIntervalRef.current);
            }
        };
    }, [dismiss, duration, showProgress]);

    useEffect(
        () => () => {
            if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
            }
        },
        []
    );

    const typeStyles = {
        success: 'bg-green-600 text-white',
        error: 'bg-red-600 text-white',
        info: 'bg-blue-600 text-white',
        warning: 'bg-amber-400 text-gray-900',
    };

    const icons = {
        success: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                />
            </svg>
        ),
        error: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                />
            </svg>
        ),
        info: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                />
            </svg>
        ),
        warning: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                />
            </svg>
        ),
    };

    return (
        <div
            className={`pointer-events-auto relative flex w-full flex-col overflow-hidden rounded-lg shadow-lg transition-all duration-300 ease-out ${typeStyles[type]} ${
                isVisible && !isExiting ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-4 opacity-0 scale-95'
            }`}
            role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
            aria-live={type === 'error' || type === 'warning' ? 'assertive' : 'polite'}
        >
            <div className="flex items-center gap-3 px-4 py-3">
                {icons[type]}
                <span className="flex-1 text-sm font-medium">{message}</span>
                {action && (
                    <button
                        onClick={() => {
                            action.onClick();
                            dismiss();
                        }}
                        className="rounded px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/20"
                        aria-label={action.label}
                    >
                        {action.label}
                    </button>
                )}
                <button
                    onClick={dismiss}
                    className="hover:opacity-75 transition-opacity"
                    aria-label="Dismiss notification"
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                        />
                    </svg>
                </button>
            </div>
            {showProgress && duration > 0 && (
                <div className="h-1 w-full bg-black/20">
                    <div
                        className="h-full bg-white/40 transition-all duration-50 ease-linear"
                        style={{ width: `${progress}%` }}
                        role="progressbar"
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                    />
                </div>
            )}
        </div>
    );
}
