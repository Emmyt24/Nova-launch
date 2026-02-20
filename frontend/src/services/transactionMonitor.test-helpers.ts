/**
 * Test helpers and mocks for transaction monitoring
 */

import {
    TransactionMonitor,
    TransactionStatusUpdate,
    MonitoringConfig,
} from './transactionMonitor';

/**
 * Mock transaction monitor for testing
 * Allows simulating transaction status changes
 */
export class MockTransactionMonitor extends TransactionMonitor {
    private statusMap: Map<string, 'pending' | 'success' | 'failed'> = new Map();
    private delayBeforeStatus: Map<string, number> = new Map();
    private shouldThrowError: Map<string, Error | null> = new Map();

    /**
     * Set the status for a transaction hash
     */
    setTransactionStatus(
        hash: string,
        status: 'pending' | 'success' | 'failed',
        delayMs: number = 0
    ): void {
        this.statusMap.set(hash, status);
        this.delayBeforeStatus.set(hash, delayMs);
    }

    /**
     * Make checkTransactionStatus throw an error
     */
    setErrorForHash(hash: string, error: Error): void {
        this.shouldThrowError.set(hash, error);
    }

    /**
     * Clear error for a hash
     */
    clearErrorForHash(hash: string): void {
        this.shouldThrowError.delete(hash);
    }

    /**
     * Override the status checking method
     */
    protected async checkTransactionStatus(
        transactionHash: string
    ): Promise<'pending' | 'success' | 'failed'> {
        const error = this.shouldThrowError.get(transactionHash);
        if (error) {
            throw error;
        }

        const delay = this.delayBeforeStatus.get(transactionHash) || 0;
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        return this.statusMap.get(transactionHash) || 'pending';
    }

    /**
     * Get all tracked hashes
     */
    getTrackedHashes(): string[] {
        return Array.from(this.sessions.keys());
    }

    /**
     * Clear all test data
     */
    resetMocks(): void {
        this.statusMap.clear();
        this.delayBeforeStatus.clear();
        this.shouldThrowError.clear();
    }

    /**
     * Get access to sessions for verification (test only)
     */
    getSessions(): Map<string, any> {
        return this.sessions;
    }
}

/**
 * Create a collection of test status updates
 */
export const createStatusUpdates = (
    hash: string,
    statuses: ('pending' | 'success' | 'failed')[]
): TransactionStatusUpdate[] => {
    return statuses.map((status, index) => ({
        hash,
        status,
        timestamp: Date.now() + index * 1000,
    }));
};

/**
 * Create a monitoring config for fast testing
 */
export const createTestMonitoringConfig = (
    overrides: Partial<MonitoringConfig> = {}
): MonitoringConfig => {
    return {
        pollingInterval: 10, // 10ms for fast tests
        maxRetries: 10,
        timeout: 5000, // 5 seconds
        backoffMultiplier: 1.0,
        ...overrides,
    };
};

/**
 * Wait for a specific number of status updates
 */
export const waitForStatusUpdates = (
    updates: TransactionStatusUpdate[],
    count: number,
    timeoutMs: number = 5000
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(
                new Error(
                    `Timeout waiting for ${count} updates, got ${updates.length}`
                )
            );
        }, timeoutMs);

        const checkUpdates = setInterval(() => {
            if (updates.length >= count) {
                clearInterval(checkUpdates);
                clearTimeout(timer);
                resolve();
            }
        }, 10);
    });
};

/**
 * Create a promise that resolves when a specific status is reached
 */
export const waitForStatus = (
    updates: TransactionStatusUpdate[],
    targetStatus: 'pending' | 'success' | 'failed' | 'timeout',
    timeoutMs: number = 5000
): Promise<TransactionStatusUpdate> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(
                new Error(
                    `Timeout waiting for ${targetStatus} status, latest: ${updates[updates.length - 1]?.status}`
                )
            );
        }, timeoutMs);

        const checkUpdates = setInterval(() => {
            const latest = updates[updates.length - 1];
            if (latest && latest.status === targetStatus) {
                clearInterval(checkUpdates);
                clearTimeout(timer);
                resolve(latest);
            }
        }, 10);
    });
};
