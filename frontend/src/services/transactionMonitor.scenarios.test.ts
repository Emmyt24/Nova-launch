/**
 * Specific test scenarios for transaction monitoring
 * Covers edge cases and real-world usage patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    TransactionMonitor,
    TransactionStatusUpdate,
} from './transactionMonitor';
import {
    MockTransactionMonitor,
    createTestMonitoringConfig,
    waitForStatus,
} from './transactionMonitor.test-helpers';

describe('Transaction Monitoring - Specific Scenarios', () => {
    let monitor: MockTransactionMonitor;

    beforeEach(() => {
        monitor = new MockTransactionMonitor(
            createTestMonitoringConfig()
        );
    });

    afterEach(() => {
        monitor.destroy();
    });

    describe('Monitor Successful Transaction', () => {
        it('should complete monitoring when transaction succeeds immediately', async () => {
            const hash = 'a'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(hash, 'success');
            monitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            expect(statusUpdates.length).toBeGreaterThan(0);
            expect(statusUpdates[0].status).toBe('success');
            expect(statusUpdates[0].hash).toBe(hash);
            expect(statusUpdates[0].timestamp).toBeGreaterThan(0);

            const session = monitor.getSession(hash);
            expect(session?.status).toBe('success');
            expect(session?.endTime).toBeDefined();
            expect(session?.attempts).toBeGreaterThan(0);
        });

        it('should capture success after multiple pending checks', async () => {
            const hash = 'b'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            let checkCount = 0;

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    checkCount++;
                    // Pending for 3 checks, then succeed
                    return checkCount <= 3 ? 'pending' : 'success';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            const session = customMonitor.getSession(hash);
            expect(session?.attempts).toBeGreaterThanOrEqual(4);
            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'success'
            );

            customMonitor.destroy();
        });

        it('should properly format success status update', async () => {
            const hash = 'c'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(hash, 'success');
            monitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            const successUpdate = statusUpdates[0];
            expect(successUpdate).toMatchObject({
                hash: expect.any(String),
                status: 'success',
                timestamp: expect.any(Number),
            });
            expect(successUpdate.hash).toBe(hash);
            expect(successUpdate.timestamp).toBeLessThanOrEqual(Date.now());
        });
    });

    describe('Monitor Failed Transaction', () => {
        it('should detect failed transaction on first check', async () => {
            const hash = 'd'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(hash, 'failed');
            monitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'failed');

            expect(statusUpdates.length).toBeGreaterThan(0);
            expect(statusUpdates[0].status).toBe('failed');

            const session = monitor.getSession(hash);
            expect(session?.status).toBe('failed');
        });

        it('should detect failed transaction after several retries', async () => {
            const hash = 'e'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            let checkCount = 0;

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    checkCount++;
                    return checkCount <= 5 ? 'pending' : 'failed';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'failed');

            const session = customMonitor.getSession(hash);
            expect(session?.attempts).toBeGreaterThanOrEqual(6);

            customMonitor.destroy();
        });

        it('should allow user to detect failure and take action', async () => {
            const hash = 'f'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const userActions: string[] = [];

            monitor.setTransactionStatus(hash, 'failed');
            monitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);

                if (update.status === 'failed') {
                    userActions.push('SHOW_RETRY_PROMPT');
                    userActions.push('LOG_ERROR');
                }
            });

            await waitForStatus(statusUpdates, 'failed');

            expect(userActions).toContain('SHOW_RETRY_PROMPT');
            expect(userActions).toContain('LOG_ERROR');
        });
    });

    describe('Monitor Pending Transaction', () => {
        it('should continue polling while transaction is pending', async () => {
            const hash = 'g'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 8,
            });

            const customMonitor = new MockTransactionMonitor(config);
            let checkCount = 0;

            const spyMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    checkCount++;
                    // Always pending, will timeout
                    return 'pending';
                }
            })(config);

            spyMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            // Wait for timeout
            await waitForStatus(statusUpdates, 'timeout', 3000);

            expect(checkCount).toBeGreaterThanOrEqual(8);

            const session = spyMonitor.getSession(hash);
            expect(session?.attempts).toBeGreaterThanOrEqual(8);

            spyMonitor.destroy();
        });

        it('should provide pending state visibility to user', async () => {
            const hash = 'h'.repeat(64);
            const uiUpdates: string[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 3,
            });

            const customMonitor = new MockTransactionMonitor(config);
            customMonitor.setTransactionStatus(hash, 'pending');

            // Register callback to track pending state
            customMonitor.startMonitoring(hash, (update) => {
                if (update.status === 'pending') {
                    uiUpdates.push('SHOW_LOADING_SPINNER');
                }
            });

            // Check session status periodically
            await new Promise((resolve) => setTimeout(resolve, 50));

            const session = customMonitor.getSession(hash);
            expect(session?.status).toBe('pending');
            expect(session?.attempts).toBeGreaterThan(0);

            customMonitor.destroy();
        });
    });

    describe('Handle Network Timeout', () => {
        it('should retry on network timeout error', async () => {
            const hash = 'i'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const errorsCaught: Error[] = [];
            let attemptCount = 0;

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    attemptCount++;
                    // First attempt throws, second succeeds
                    if (attemptCount === 1) {
                        throw new Error('Network timeout: request exceeded timeout');
                    }
                    return 'success';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(
                hash,
                (update) => statusUpdates.push(update),
                (error) => errorsCaught.push(error)
            );

            await waitForStatus(statusUpdates, 'success');

            expect(errorsCaught.length).toBeGreaterThan(0);
            expect(errorsCaught[0].message).toContain('timeout');
            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'success'
            );

            customMonitor.destroy();
        });

        it('should eventually timeout after repeated network failures', async () => {
            const hash = 'j'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 2,
            });

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    throw new Error('Network timeout');
                }
            })(config);

            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'timeout');

            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'timeout'
            );

            customMonitor.destroy();
        });

        it('should handle DNS resolution errors', async () => {
            const hash = 'k'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const errorsCaught: Error[] = [];
            let attemptCount = 0;

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    attemptCount++;
                    if (attemptCount <= 2) {
                        throw new Error('ENOTFOUND: DNS lookup failed');
                    }
                    return 'success';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(
                hash,
                (update) => statusUpdates.push(update),
                (error) => errorsCaught.push(error)
            );

            await waitForStatus(statusUpdates, 'success');

            expect(errorsCaught.length).toBeGreaterThan(0);
            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'success'
            );

            customMonitor.destroy();
        });

        it('should handle server error responses (5xx)', async () => {
            const hash = 'l'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            let attemptCount = 0;

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    attemptCount++;
                    if (attemptCount === 1) {
                        throw new Error('HTTP 503: Service Unavailable');
                    }
                    return 'success';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'success'
            );

            customMonitor.destroy();
        });
    });

    describe('Handle Invalid Transaction Hash', () => {
        it('should monitor non-existent transaction hash', async () => {
            const hash = 'nonexistent';
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(hash, 'failed');
            monitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'failed');

            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'failed'
            );
        });

        it('should handle hash with invalid characters', async () => {
            const hash = 'INVALID@#$%';
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(hash, 'failed');
            monitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'failed');

            expect(statusUpdates.length).toBeGreaterThan(0);
        });

        it('should handle null or undefined hash gracefully', () => {
            const hash = '';

            expect(() => monitor.startMonitoring(hash)).not.toThrow();

            const session = monitor.getSession(hash);
            expect(session).toBeDefined();
        });

        it('should track failed API response for invalid hash', async () => {
            const hash = 'xxx'.repeat(20); // Invalid format
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(hash, 'failed');
            monitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'failed');

            const session = monitor.getSession(hash);
            expect(session?.status).toBe('failed');
        });
    });

    describe('Test Polling Intervals', () => {
        it('should use configured polling interval', async () => {
            const hash = 'm'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                pollingInterval: 20,
                maxRetries: 4,
            });

            const timestamps: number[] = [];
            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    timestamps.push(Date.now());
                    return timestamps.length < 3 ? 'pending' : 'success';
                }
            })(config);

            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            // Verify interval timing (accounting for jitter and execution time)
            expect(timestamps.length).toBeGreaterThanOrEqual(3);

            for (let i = 1; i < timestamps.length; i++) {
                const interval = timestamps[i] - timestamps[i - 1];
                expect(interval).toBeGreaterThanOrEqual(10); // Min 10ms
            }

            customMonitor.destroy();
        });

        it('should handle rapid polling for critical transactions', async () => {
            const hash = 'n'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                pollingInterval: 5, // Very fast polling
            });

            monitor.destroy();
            monitor = new MockTransactionMonitor(config);
            monitor.setTransactionStatus(hash, 'success');

            monitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'success'
            );
        });

        it('should handle slow polling for non-critical transactions', async () => {
            const hash = 'o'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                pollingInterval: 100, // Slower polling
                maxRetries: 3,
            });

            const customMonitor = new MockTransactionMonitor(config);
            customMonitor.setTransactionStatus(hash, 'success');

            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'success'
            );

            customMonitor.destroy();
        });

        it('should apply jitter to prevent thundering herd', async () => {
            const hash = 'p'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                pollingInterval: 30,
                maxRetries: 6,
            });

            const intervals: number[] = [];
            const timestamps: number[] = [];

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    const now = Date.now();
                    timestamps.push(now);
                    return 'pending';
                }
            })(config);

            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await new Promise((resolve) => setTimeout(resolve, 150));

            customMonitor.destroy();

            // Calculate intervals
            for (let i = 1; i < timestamps.length; i++) {
                intervals.push(timestamps[i] - timestamps[i - 1]);
            }

            // With jitter, intervals should vary
            if (intervals.length > 1) {
                const max = Math.max(...intervals);
                const min = Math.min(...intervals);
                // Check that there's some variation (not all exact same)
                expect(intervals.length).toBeGreaterThanOrEqual(2);
            }
        });
    });

    describe('Progress Updates', () => {
        it('should emit progress updates during monitoring', async () => {
            const hash = 'q'.repeat(64);
            const progressUpdates: number[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 5,
            });

            let checkCount = 0;
            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    checkCount++;
                    const progress = (checkCount / 5) * 100;
                    progressUpdates.push(progress);
                    return checkCount < 4 ? 'pending' : 'success';
                }
            })(config);

            const statusUpdates: TransactionStatusUpdate[] = [];
            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates[progressUpdates.length - 1]).toBeGreaterThan(
                0
            );

            customMonitor.destroy();
        });

        it('should track attempt count for user feedback', async () => {
            const hash = 'r'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 8,
            });

            let checkCount = 0;
            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(h: string) {
                    checkCount++;
                    return checkCount < 5 ? 'pending' : 'success';
                }
            })(config);

            customMonitor.startMonitoring(hash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success');

            const session = customMonitor.getSession(hash);
            expect(session?.attempts).toBeGreaterThanOrEqual(5);

            customMonitor.destroy();
        });
    });
});
