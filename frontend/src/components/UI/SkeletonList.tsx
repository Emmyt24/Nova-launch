import { Skeleton, SkeletonCard } from './Skeleton';

interface SkeletonListProps {
    count?: number;
    variant?: 'card' | 'row' | 'table';
    className?: string;
}

export function SkeletonList({ count = 3, variant = 'card', className = '' }: SkeletonListProps) {
    const items = Array.from({ length: count }, (_, i) => i);

    if (variant === 'card') {
        return (
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
                {items.map((i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
        );
    }

    if (variant === 'table') {
        return (
            <div className={`space-y-3 ${className}`}>
                {items.map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200">
                        <Skeleton variant="circular" width={40} height={40} />
                        <div className="flex-1 space-y-2">
                            <Skeleton width="40%" />
                            <Skeleton width="60%" />
                        </div>
                        <Skeleton width={80} />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={`space-y-3 ${className}`}>
            {items.map((i) => (
                <div key={i} className="space-y-2">
                    <Skeleton width="80%" />
                    <Skeleton width="60%" />
                </div>
            ))}
        </div>
    );
}
