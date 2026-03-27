interface ProgressBarProps {
    progress: number; // 0-100
    label?: string;
    showPercentage?: boolean;
    estimatedTimeMs?: number;
    variant?: 'default' | 'success' | 'warning' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function ProgressBar({
    progress,
    label,
    showPercentage = true,
    estimatedTimeMs,
    variant = 'default',
    size = 'md',
    className = '',
}: ProgressBarProps) {
    const clampedProgress = Math.min(100, Math.max(0, progress));
    
    const sizeStyles = {
        sm: 'h-1',
        md: 'h-2',
        lg: 'h-3',
    };

    const variantStyles = {
        default: 'bg-blue-600',
        success: 'bg-green-600',
        warning: 'bg-yellow-600',
        danger: 'bg-red-600',
    };

    const formatTime = (ms: number): string => {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        return `${Math.round(ms / 60000)}m`;
    };

    return (
        <div className={`w-full ${className}`}>
            {(label || showPercentage || estimatedTimeMs) && (
                <div className="flex justify-between items-center mb-2 text-sm">
                    <span className="text-gray-700">{label}</span>
                    <div className="flex items-center gap-2 text-gray-600">
                        {showPercentage && <span>{Math.round(clampedProgress)}%</span>}
                        {estimatedTimeMs && estimatedTimeMs > 0 && (
                            <span className="text-xs">~{formatTime(estimatedTimeMs)}</span>
                        )}
                    </div>
                </div>
            )}
            <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeStyles[size]}`}>
                <div
                    className={`${variantStyles[variant]} ${sizeStyles[size]} rounded-full transition-all duration-300 ease-out`}
                    style={{ width: `${clampedProgress}%` }}
                    role="progressbar"
                    aria-valuenow={clampedProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={label || 'Progress'}
                />
            </div>
        </div>
    );
}
