import { Spinner } from './Spinner';

interface LoadingOverlayProps {
    isLoading: boolean;
    message?: string;
    progress?: number;
    estimatedTimeMs?: number;
    children: React.ReactNode;
}

export function LoadingOverlay({
    isLoading,
    message,
    progress,
    estimatedTimeMs,
    children,
}: LoadingOverlayProps) {
    const formatTime = (ms: number): string => {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        return `${Math.round(ms / 60000)}m`;
    };

    return (
        <div className="relative">
            {children}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50">
                    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-lg shadow-lg">
                        <Spinner size="lg" />
                        {message && (
                            <p className="text-gray-700 font-medium">{message}</p>
                        )}
                        {progress !== undefined && (
                            <div className="w-64">
                                <div className="flex justify-between text-sm text-gray-600 mb-2">
                                    <span>{Math.round(progress)}%</span>
                                    {estimatedTimeMs && estimatedTimeMs > 0 && (
                                        <span>~{formatTime(estimatedTimeMs)}</span>
                                    )}
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
