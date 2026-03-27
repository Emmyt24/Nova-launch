import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { Toast, type ToastAction } from '../components/UI/Toast';

export type ToastType = 'success' | 'error' | 'info' | 'warning';
export type ToastPosition =
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';

export interface ToastOptions {
    duration?: number;
    action?: ToastAction;
    showProgress?: boolean;
}

export interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
    action?: ToastAction;
    showProgress: boolean;
}

interface ToastContextValue {
    toasts: ToastItem[];
    visibleToasts: ToastItem[];
    position: ToastPosition;
    showToast: (message: string, type?: ToastType, options?: ToastOptions) => string;
    hideToast: (id: string) => void;
    clearToasts: () => void;
    success: (message: string, options?: ToastOptions) => string;
    error: (message: string, options?: ToastOptions) => string;
    info: (message: string, options?: ToastOptions) => string;
    warning: (message: string, options?: ToastOptions) => string;
}

interface ToastProviderProps {
    children: ReactNode;
    position?: ToastPosition;
    defaultDuration?: number;
    maxVisible?: number;
    maxQueue?: number;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const POSITION_STYLES: Record<ToastPosition, string> = {
    'top-left': 'top-4 left-4 items-start',
    'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
    'top-right': 'top-4 right-4 items-end',
    'bottom-left': 'bottom-4 left-4 items-start',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
    'bottom-right': 'bottom-4 right-4 items-end',
};

function getToastId(counter: number): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `toast-${Date.now()}-${counter}`;
}

export function ToastProvider({
    children,
    position = 'bottom-right',
    defaultDuration = 5000,
    maxVisible = 3,
    maxQueue = 50,
}: ToastProviderProps) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const counterRef = useRef(0);

    const hideToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const clearToasts = useCallback(() => {
        setToasts([]);
    }, []);

    const showToast = useCallback(
        (message: string, type: ToastType = 'info', options?: ToastOptions) => {
            counterRef.current += 1;
            const nextToast: ToastItem = {
                id: getToastId(counterRef.current),
                message,
                type,
                duration: options?.duration ?? defaultDuration,
                action: options?.action,
                showProgress: options?.showProgress ?? true,
            };

            setToasts((prev) => {
                const next = [...prev, nextToast];
                if (next.length <= maxQueue) {
                    return next;
                }

                return next.slice(next.length - maxQueue);
            });

            return nextToast.id;
        },
        [defaultDuration, maxQueue]
    );

    const success = useCallback(
        (message: string, options?: ToastOptions) => showToast(message, 'success', options),
        [showToast]
    );
    const error = useCallback(
        (message: string, options?: ToastOptions) => showToast(message, 'error', options),
        [showToast]
    );
    const info = useCallback(
        (message: string, options?: ToastOptions) => showToast(message, 'info', options),
        [showToast]
    );
    const warning = useCallback(
        (message: string, options?: ToastOptions) => showToast(message, 'warning', options),
        [showToast]
    );

    const visibleToasts = useMemo(() => toasts.slice(0, maxVisible), [toasts, maxVisible]);

    const value = useMemo(
        () => ({
            toasts,
            visibleToasts,
            position,
            showToast,
            hideToast,
            clearToasts,
            success,
            error,
            info,
            warning,
        }),
        [toasts, visibleToasts, position, showToast, hideToast, clearToasts, success, error, info, warning]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                className={`pointer-events-none fixed z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0 ${POSITION_STYLES[position]}`}
                aria-live="polite"
                aria-atomic="false"
                role="region"
                aria-label="Notifications"
            >
                {visibleToasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        id={toast.id}
                        message={toast.message}
                        type={toast.type}
                        duration={toast.duration}
                        action={toast.action}
                        showProgress={toast.showProgress}
                        onClose={hideToast}
                    />
                ))}
                {toasts.length > 1 && (
                    <button
                        onClick={clearToasts}
                        className="pointer-events-auto mt-2 rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white shadow-lg transition-all hover:bg-gray-700"
                        aria-label="Dismiss all notifications"
                    >
                        Dismiss All ({toasts.length})
                    </button>
                )}
            </div>
        </ToastContext.Provider>
    );
}

export function useToastContext() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }

    return context;
}
