/**
 * Formatting utilities
 */

/**
 * Format XLM amount for display
 */
export function formatXLM(amount: string | number): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 7,
    }).format(num);
}

/**
 * Format large numbers with commas
 */
export function formatNumber(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Truncate Stellar address for display
 */
export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
    if (address.length <= startChars + endChars) {
        return address;
    }
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format timestamp to readable date
 */
export function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));
}

/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    return 'Just now';
}

/**
 * Convert stroops to XLM
 */
export function stroopsToXLM(stroops: number | string): number {
    const num = typeof stroops === 'string' ? parseInt(stroops) : stroops;
    return num / 10_000_000;
}

/**
 * Convert XLM to stroops
 */
export function xlmToStroops(xlm: number | string): number {
    const num = typeof xlm === 'string' ? parseFloat(xlm) : xlm;
    return Math.floor(num * 10_000_000);
}

/**
 * Get error message from error object
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'An unknown error occurred';
}
