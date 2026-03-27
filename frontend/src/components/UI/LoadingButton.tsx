import { Button } from './Button';
import { Spinner } from './Spinner';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    loading?: boolean;
    loadingText?: string;
    variant?: 'primary' | 'secondary' | 'outline' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    children: React.ReactNode;
}

export function LoadingButton({
    loading = false,
    loadingText,
    children,
    disabled,
    variant = 'primary',
    size = 'md',
    className = '',
    ...props
}: LoadingButtonProps) {
    return (
        <Button
            {...props}
            variant={variant}
            size={size}
            disabled={disabled || loading}
            className={`relative ${className}`}
        >
            {loading && (
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <Spinner size="sm" />
                </span>
            )}
            <span className={loading ? 'opacity-0' : ''}>
                {loading && loadingText ? loadingText : children}
            </span>
        </Button>
    );
}
