/**
 * Stellar Integration Guide for Transaction Monitoring
 * 
 * This file demonstrates how to integrate the TransactionMonitor with the real Stellar API
 */

import { TransactionMonitor, TransactionStatusUpdate } from './transactionMonitor';
import { STELLAR_CONFIG, getNetworkConfig } from '../config/stellar';

/**
 * Stellar-integrated transaction monitor
 * Extends the base monitor to check status against real Horizon API
 */
export class StellarTransactionMonitor extends TransactionMonitor {
    private network: 'testnet' | 'mainnet';

    constructor(
        network: 'testnet' | 'mainnet' = 'testnet',
        config?: any
    ) {
        super(config);
        this.network = network;
    }

    /**
     * Check transaction status against Stellar Horizon API
     * 
     * @see https://developers.stellar.org/api/introduction/
     */
    protected async checkTransactionStatus(
        transactionHash: string
    ): Promise<'pending' | 'success' | 'failed'> {
        try {
            const networkConfig = getNetworkConfig(this.network);
            
            // Fetch transaction details from Horizon API
            const response = await fetch(
                `${networkConfig.horizonUrl}/transactions/${transactionHash}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            // Transaction not found yet (still pending)
            if (response.status === 404) {
                return 'pending';
            }

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Check if transaction was successful
            if (data.successful === true) {
                return 'success';
            } else if (data.successful === false) {
                return 'failed';
            }

            // Default to pending if status is unclear
            return 'pending';
        } catch (error) {
            // Network errors, timeouts, etc. will be caught by the monitor
            // and retried according to the configuration
            throw error;
        }
    }
}

/**
 * Example: Monitor a token deployment transaction
 */
export async function monitorTokenDeployment(
    transactionHash: string,
    network: 'testnet' | 'mainnet' = 'testnet'
) {
    const monitor = new StellarTransactionMonitor(network, {
        pollingInterval: 3000,  // Check every 3 seconds
        maxRetries: 40,         // ~2 minutes
        timeout: 120000,        // 2 minute total timeout
    });

    const statusUpdates: TransactionStatusUpdate[] = [];
    const errors: Error[] = [];

    return new Promise<'success' | 'failed' | 'timeout'>((resolve) => {
        monitor.startMonitoring(
            transactionHash,
            (update) => {
                statusUpdates.push(update);
                console.log(`Transaction ${transactionHash}: ${update.status}`);

                if (update.status === 'success') {
                    monitor.stopMonitoring(transactionHash);
                    resolve('success');
                } else if (update.status === 'failed') {
                    monitor.stopMonitoring(transactionHash);
                    resolve('failed');
                } else if (update.status === 'timeout') {
                    monitor.stopMonitoring(transactionHash);
                    resolve('timeout');
                }
            },
            (error) => {
                errors.push(error);
                console.error('Monitoring error:', error);
            }
        );
    });
}

/**
 * Example: Monitor with retry logic
 */
export async function monitorWithRetry(
    transactionHash: string,
    maxAttempts: number = 3,
    network: 'testnet' | 'mainnet' = 'testnet'
): Promise<'success' | 'failed'> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Monitoring attempt ${attempt}/${maxAttempts}`);

        const result = await monitorTokenDeployment(transactionHash, network);

        if (result === 'success') {
            return 'success';
        } else if (result === 'failed') {
            return 'failed';
        }

        // Timeout - retry
        console.log('Timeout, retrying...');
    }

    throw new Error('Failed to monitor transaction after maximum attempts');
}

/**
 * Example: Monitor multiple transactions
 */
export async function monitorMultipleTransactions(
    transactionHashes: string[],
    network: 'testnet' | 'mainnet' = 'testnet'
): Promise<Map<string, 'success' | 'failed' | 'timeout'>> {
    const monitor = new StellarTransactionMonitor(network);
    const results = new Map<string, 'success' | 'failed' | 'timeout'>();

    return new Promise((resolve) => {
        let completedCount = 0;

        transactionHashes.forEach((hash) => {
            monitor.startMonitoring(
                hash,
                (update) => {
                    if (update.status !== 'pending') {
                        results.set(hash, update.status);
                        completedCount++;

                        if (completedCount === transactionHashes.length) {
                            monitor.destroy();
                            resolve(results);
                        }
                    }
                }
            );
        });
    });
}

/**
 * Integration with React hooks
 * 
 * Usage:
 * const { status, error } = useTransactionMonitor(transactionHash);
 */
export function useTransactionMonitor(
    transactionHash: string | null,
    network: 'testnet' | 'mainnet' = 'testnet'
) {
    const [status, setStatus] = React.useState<
        'pending' | 'success' | 'failed' | 'timeout' | null
    >(null);
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
        if (!transactionHash) return;

        const monitor = new StellarTransactionMonitor(network);

        monitor.startMonitoring(
            transactionHash,
            (update) => {
                setStatus(update.status);
            },
            (err) => {
                setError(err);
            }
        );

        return () => {
            monitor.destroy();
        };
    }, [transactionHash, network]);

    return { status, error };
}

/**
 * Testing utilities for integration testing
 */

/**
 * Create a mock Stellar API response
 */
export function createMockStellarResponse(
    status: 'pending' | 'success' | 'failed'
) {
    if (status === 'pending') {
        return new Response('Not Found', { status: 404 });
    }

    return new Response(
        JSON.stringify({
            successful: status === 'success',
            id: 'a'.repeat(64),
            hash: 'b'.repeat(64),
            ledger: 12345,
            result_code: status === 'success' ? 'tx_success' : 'tx_failed',
        }),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }
    );
}

/**
 * Test with mocked fetch
 */
export async function testStellarIntegration() {
    // Mock fetch globally
    const originalFetch = global.fetch;
    
    let callCount = 0;
    global.fetch = async (url, options) => {
        callCount++;

        // Simulate: pending on first call, success on second
        if (callCount === 1) {
            return createMockStellarResponse('pending');
        } else {
            return createMockStellarResponse('success');
        }
    };

    try {
        const result = await monitorTokenDeployment('a'.repeat(64));
        console.assert(result === 'success', 'Expected success');
    } finally {
        global.fetch = originalFetch;
    }
}

/**
 * Performance considerations for production
 * 
 * 1. Polling Interval
 *    - Too frequent: increases API calls and cost
 *    - Too slow: delays user feedback
 *    - Recommended: 3-5 seconds for typical transactions
 * 
 * 2. Timeout
 *    - Stellar typically confirms in 3-5 seconds
 *    - Network latency can add 1-2 seconds
 *    - Recommended timeout: 2-5 minutes
 * 
 * 3. Batch Monitoring
 *    - Monitor multiple transactions with single monitor instance
 *    - Reduces overhead and resource usage
 *    - Proper cleanup via destroy()
 * 
 * 4. Error Handling
 *    - Network errors are retried automatically
 *    - Log all monitoring errors for debugging
 *    - Notify user of timeouts with retry option
 * 
 * 5. Resource Management
 *    - Always call destroy() when done monitoring
 *    - Clear timers and callbacks
 *    - Prevent memory leaks in long-running apps
 */

/**
 * Best practices for production integration
 * 
 * 1. Error Handling
 *    - Wrap monitor calls in try-catch
 *    - Implement retry logic for transient failures
 *    - Log errors for debugging
 * 
 * 2. User Experience
 *    - Show loading state while pending
 *    - Provide clear success/failure messages
 *    - Offer retry option on timeout
 * 
 * 3. Monitoring
 *    - Track monitoring success rate
 *    - Log API response times
 *    - Monitor error rates
 * 
 * 4. Testing
 *    - Use StellarTransactionMonitor in integration tests
 *    - Mock Stellar API responses
 *    - Test error scenarios
 * 
 * 5. Performance
 *    - Use exponential backoff for retries
 *    - Batch transaction monitoring
 *    - Reuse monitor instances
 */
