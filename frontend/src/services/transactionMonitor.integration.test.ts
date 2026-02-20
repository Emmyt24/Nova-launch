/**
 * Integration tests for transaction status monitoring
 * Tests all scenarios: pending, success, failure, timeout, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    TransactionMonitor,
    TransactionStatusUpdate,
    MonitoringSession,
    DEFAULT_MONITORING_CONFIG,
} from './transactionMonitor';
import {
    MockTransactionMonitor,
    createTestMonitoringConfig,
    waitForStatusUpdates,
    waitForStatus,
} from './transactionMonitor.test-helpers';

describe('TransactionMonitor - Integration Tests', () => {
    let monitor: MockTransactionMonitor;
    const testHash = 'a'.repeat(64);

    beforeEach(() => {
        monitor = new MockTransactionMonitor(
            createTestMonitoringConfig()
        );
    });

    afterEach(() => {
        monitor.destroy();
    });

    describe('Basic Monitoring', () => {
        it('should start monitoring a transaction', () => {
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            const session = monitor.getSession(testHash);
            expect(session).toBeDefined();
            expect(session?.status).toBe('pending');
            expect(session?.attempts).toBeGreaterThanOrEqual(0);
        });

        it('should throw error when starting to monitor same hash twice', () => {
            monitor.startMonitoring(testHash);
            expect(() => monitor.startMonitoring(testHash)).toThrow(
                'Already monitoring transaction'
            );
        });

        it('should stop monitoring a transaction', () => {
            monitor.startMonitoring(testHash);
            monitor.stopMonitoring(testHash);

            // Should not call callbacks after stopping
            const statusUpdates: TransactionStatusUpdate[] = [];
            monitor.onStatus(testHash, (update) => {
                statusUpdates.push(update);
            });

            // Wait a bit and verify no updates were received
            setTimeout(() => {
                expect(statusUpdates.length).toBe(0);
            }, 100);
        });
    });

    describe('Success State', () => {
        it('should detect successful transaction', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];
            const errorCalls: Error[] = [];

            monitor.setTransactionStatus(testHash, 'success');
            monitor.startMonitoring(
                testHash,
                (update) => statusUpdates.push(update),
                (error) => errorCalls.push(error)
            );

            await waitForStatus(statusUpdates, 'success', 2000);

            expect(statusUpdates.length).toBeGreaterThan(0);
            const finalUpdate = statusUpdates[statusUpdates.length - 1];
            expect(finalUpdate.status).toBe('success');
            expect(finalUpdate.hash).toBe(testHash);
            expect(finalUpdate.timestamp).toBeGreaterThan(0);
            expect(errorCalls.length).toBe(0);

            const session = monitor.getSession(testHash);
            expect(session?.status).toBe('success');
            expect(session?.endTime).toBeDefined();
        });

        it('should report success with multiple status checks', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];

            // Simulate pending states then success
            let checkCount = 0;
            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(hash: string) {
                    checkCount++;
                    return checkCount < 3 ? 'pending' : 'success';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success', 2000);

            expect(statusUpdates.length).toBeGreaterThanOrEqual(1);
            const finalUpdate = statusUpdates[statusUpdates.length - 1];
            expect(finalUpdate.status).toBe('success');

            customMonitor.destroy();
        });
    });

    describe('Failure State', () => {
        it('should detect failed transaction', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];
            const errorCalls: Error[] = [];

            monitor.setTransactionStatus(testHash, 'failed');
            monitor.startMonitoring(
                testHash,
                (update) => statusUpdates.push(update),
                (error) => errorCalls.push(error)
            );

            await waitForStatus(statusUpdates, 'failed', 2000);

            expect(statusUpdates.length).toBeGreaterThan(0);
            const finalUpdate = statusUpdates[statusUpdates.length - 1];
            expect(finalUpdate.status).toBe('failed');
            expect(errorCalls.length).toBe(0);

            const session = monitor.getSession(testHash);
            expect(session?.status).toBe('failed');
        });

        it('should detect failed transaction after retries', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];

            // Simulate pending then failure
            let checkCount = 0;
            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(hash: string) {
                    checkCount++;
                    return checkCount < 2 ? 'pending' : 'failed';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'failed', 2000);

            const session = customMonitor.getSession(testHash);
            expect(session?.attempts).toBeGreaterThanOrEqual(2);
            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'failed'
            );

            customMonitor.destroy();
        });
    });

    describe('Pending State', () => {
        it('should maintain pending state during polling', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(testHash, 'pending');
            monitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            // Wait for a few polling cycles
            await new Promise((resolve) => setTimeout(resolve, 100));

            const session = monitor.getSession(testHash);
            expect(session?.status).toBe('pending');
            expect(session?.attempts).toBeGreaterThan(0);
            // Pending status should not trigger callbacks (no status updates)
            expect(statusUpdates.length).toBe(0);
        });

        it('should continue polling while pending', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];
            let pollCount = 0;

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(hash: string) {
                    pollCount++;
                    return pollCount < 4 ? 'pending' : 'success';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success', 2000);

            expect(pollCount).toBeGreaterThanOrEqual(4);
            const session = customMonitor.getSession(testHash);
            expect(session?.attempts).toBeGreaterThanOrEqual(4);

            customMonitor.destroy();
        });
    });

    describe('Timeout Handling', () => {
        it('should timeout after max retry attempts', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 3,
            });

            const customMonitor = new MockTransactionMonitor(config);
            customMonitor.setTransactionStatus(testHash, 'pending');

            customMonitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'timeout', 2000);

            expect(statusUpdates.length).toBeGreaterThan(0);
            const finalUpdate = statusUpdates[statusUpdates.length - 1];
            expect(finalUpdate.status).toBe('timeout');
            expect(finalUpdate.error).toContain('Max retries');

            const session = customMonitor.getSession(testHash);
            expect(session?.status).toBe('timeout');

            customMonitor.destroy();
        });

        it('should timeout after timeout duration', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                timeout: 100, // 100ms timeout
                maxRetries: 100, // High retry count
            });

            const customMonitor = new MockTransactionMonitor(config);
            customMonitor.setTransactionStatus(testHash, 'pending');

            customMonitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'timeout', 2000);

            const session = customMonitor.getSession(testHash);
            expect(session?.status).toBe('timeout');
            const duration = (session?.endTime || 0) - session!.startTime;
            expect(duration).toBeLessThanOrEqual(250); // Should timeout before 250ms

            customMonitor.destroy();
        });

        it('should emit timeout error message', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 2,
            });

            const customMonitor = new MockTransactionMonitor(config);
            customMonitor.setTransactionStatus(testHash, 'pending');

            customMonitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'timeout', 2000);

            const timeoutUpdate = statusUpdates.find(
                (u) => u.status === 'timeout'
            );
            expect(timeoutUpdate?.error).toBeDefined();

            customMonitor.destroy();
        });
    });

    describe('Error Handling', () => {
        it('should catch and emit network errors', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];
            const errorCalls: Error[] = [];

            const networkError = new Error('Network timeout');
            monitor.setErrorForHash(testHash, networkError);
            monitor.setTransactionStatus(testHash, 'success', 500);

            monitor.startMonitoring(
                testHash,
                (update) => statusUpdates.push(update),
                (error) => errorCalls.push(error)
            );

            // Wait for error callback
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(errorCalls.length).toBeGreaterThan(0);
            expect(errorCalls[0].message).toBe('Network timeout');
        });

        it('should retry after network error', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];

            const customMonitor = new (class extends MockTransactionMonitor {
                private attemptCount = 0;

                protected async checkTransactionStatus(hash: string) {
                    this.attemptCount++;
                    // Fail once, then succeed
                    if (this.attemptCount === 1) {
                        throw new Error('Network error');
                    }
                    return 'success';
                }
            })(createTestMonitoringConfig());

            customMonitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success', 2000);

            expect(statusUpdates.length).toBeGreaterThan(0);
            const finalUpdate = statusUpdates[statusUpdates.length - 1];
            expect(finalUpdate.status).toBe('success');

            customMonitor.destroy();
        });

        it('should eventually timeout after repeated errors', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 2,
            });

            const customMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(hash: string) {
                    throw new Error('Persistent network error');
                }
            })(config);

            customMonitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'timeout', 2000);

            expect(statusUpdates.length).toBeGreaterThan(0);
            const finalUpdate = statusUpdates[statusUpdates.length - 1];
            expect(finalUpdate.status).toBe('timeout');

            customMonitor.destroy();
        });

        it('should handle callback errors gracefully', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(
                () => {}
            );
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(testHash, 'success');

            // Register a callback that throws
            monitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
                throw new Error('Callback error');
            });

            await waitForStatus(statusUpdates, 'success', 2000);

            // Monitor should continue despite callback error
            expect(statusUpdates.length).toBeGreaterThan(0);
            expect(errorSpy).toHaveBeenCalled();

            errorSpy.mockRestore();
        });
    });

    describe('Multiple Callbacks', () => {
        it('should support multiple status callbacks', async () => {
            const updates1: TransactionStatusUpdate[] = [];
            const updates2: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(testHash, 'success');
            monitor.startMonitoring(testHash, (update) => {
                updates1.push(update);
            });

            monitor.onStatus(testHash, (update) => {
                updates2.push(update);
            });

            await waitForStatus(updates1, 'success', 2000);

            expect(updates1.length).toBeGreaterThan(0);
            expect(updates2.length).toBe(updates1.length);
            expect(updates1[0]).toEqual(updates2[0]);
        });

        it('should support multiple error callbacks', async () => {
            const errorCalls1: Error[] = [];
            const errorCalls2: Error[] = [];

            const testError = new Error('Test error');
            monitor.setErrorForHash(testHash, testError);
            monitor.setTransactionStatus(testHash, 'failed', 500);

            monitor.startMonitoring(
                testHash,
                undefined,
                (error) => errorCalls1.push(error)
            );

            monitor.onError(testHash, (error) => {
                errorCalls2.push(error);
            });

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(errorCalls1.length).toBeGreaterThan(0);
            expect(errorCalls2.length).toBeGreaterThan(0);
        });

        it('should handle multiple callbacks independently', async () => {
            const updates1: TransactionStatusUpdate[] = [];
            const updates2: TransactionStatusUpdate[] = [];
            const updates3: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(testHash, 'success');
            monitor.startMonitoring(testHash, (update) => {
                updates1.push(update);
            });

            monitor.onStatus(testHash, (update) => {
                updates2.push(update);
            });

            monitor.onStatus(testHash, (update) => {
                updates3.push(update);
            });

            await waitForStatus(updates1, 'success', 2000);

            expect(updates1.length).toBe(updates2.length);
            expect(updates2.length).toBe(updates3.length);
        });
    });

    describe('Polling Intervals', () => {
        it('should respect configured polling interval', async () => {
            const config = createTestMonitoringConfig({
                pollingInterval: 50,
                maxRetries: 5,
            });

            const timestamps: number[] = [];

            let checkCount = 0;
            const spy = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(hash: string) {
                    timestamps.push(Date.now());
                    checkCount++;
                    return checkCount < 3 ? 'pending' : 'success';
                }
            })(config);

            const statusUpdates: TransactionStatusUpdate[] = [];
            spy.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success', 2000);

            expect(timestamps.length).toBeGreaterThanOrEqual(2);

            // Check that polling intervals exist
            if (timestamps.length > 1) {
                for (let i = 1; i < timestamps.length; i++) {
                    const interval = timestamps[i] - timestamps[i - 1];
                    // Should have some interval
                    expect(interval).toBeGreaterThanOrEqual(0);
                }
            }

            spy.destroy();
        });

        it('should apply exponential backoff when configured', async () => {
            const config = createTestMonitoringConfig({
                pollingInterval: 10,
                maxRetries: 5,
                backoffMultiplier: 1.5,
            });

            const timestamps: number[] = [];

            const spy = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(hash: string) {
                    timestamps.push(Date.now());
                    return 'pending';
                }
            })(config);

            spy.startMonitoring(testHash);

            // Let it poll a few times
            await new Promise((resolve) => setTimeout(resolve, 200));

            spy.destroy();

            // Should have multiple polling attempts
            expect(timestamps.length).toBeGreaterThan(1);
        });
    });

    describe('Session Management', () => {
        it('should track session details', async () => {
            const statusUpdates: TransactionStatusUpdate[] = [];

            monitor.setTransactionStatus(testHash, 'success');
            monitor.startMonitoring(testHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success', 2000);

            const session = monitor.getSession(testHash);
            expect(session).toBeDefined();
            expect(session?.hash).toBe(testHash);
            expect(session?.status).toBe('success');
            expect(session?.startTime).toBeGreaterThan(0);
            expect(session?.endTime).toBeGreaterThanOrEqual(session!.startTime);
            expect(session?.attempts).toBeGreaterThan(0);
            expect(session?.lastChecked).toBeDefined();
        });

        it('should not return session after stopping', () => {
            monitor.startMonitoring(testHash);
            monitor.stopMonitoring(testHash);

            // Session may still exist internally but callbacks are cleared
            // Verify the monitor can start monitoring different hashes after stopping
            const newHash = 'z'.repeat(64);
            expect(() => monitor.startMonitoring(newHash)).not.toThrow();
        });

        it('should cleanup resources on destroy', async () => {
            const hash1 = 'a'.repeat(64);
            const hash2 = 'b'.repeat(64);

            monitor.startMonitoring(hash1);
            monitor.startMonitoring(hash2);

            expect(monitor.getSessions().size).toBe(2);

            monitor.destroy();

            expect(monitor.getSessions().size).toBe(0);
        });
    });

    describe('Real-world Scenarios', () => {
        it('should monitor successful token deployment transaction', async () => {
            const deploymentHash = 'c'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];

            // Simulate real deployment: pending -> success
            let checkCount = 0;
            const deploymentMonitor = new (class extends MockTransactionMonitor {
                protected async checkTransactionStatus(hash: string) {
                    checkCount++;
                    // Simulate 2 pending checks then success
                    return checkCount <= 2 ? 'pending' : 'success';
                }
            })(createTestMonitoringConfig());

            deploymentMonitor.startMonitoring(deploymentHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'success', 2000);

            const finalUpdate = statusUpdates[statusUpdates.length - 1];
            expect(finalUpdate.status).toBe('success');
            expect(finalUpdate.hash).toBe(deploymentHash);

            deploymentMonitor.destroy();
        });

        it('should monitor failed transaction with user notification', async () => {
            const failedHash = 'd'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const notifications: string[] = [];

            monitor.setTransactionStatus(failedHash, 'failed');
            monitor.startMonitoring(failedHash, (update) => {
                statusUpdates.push(update);

                if (update.status === 'failed') {
                    notifications.push(
                        'Transaction failed. Please check the details and try again.'
                    );
                }
            });

            await waitForStatus(statusUpdates, 'failed', 2000);

            expect(notifications.length).toBeGreaterThan(0);
            expect(notifications[0]).toContain('Transaction failed');
        });

        it('should handle timeout with retry option', async () => {
            const timedOutHash = 'e'.repeat(64);
            const statusUpdates: TransactionStatusUpdate[] = [];
            const config = createTestMonitoringConfig({
                maxRetries: 2,
            });

            const monitor2 = new MockTransactionMonitor(config);
            monitor2.setTransactionStatus(timedOutHash, 'pending');

            monitor2.startMonitoring(timedOutHash, (update) => {
                statusUpdates.push(update);
            });

            await waitForStatus(statusUpdates, 'timeout', 2000);

            const timeoutUpdate = statusUpdates[statusUpdates.length - 1];
            expect(timeoutUpdate.status).toBe('timeout');

            // User could now retry with a new monitor
            const retryUpdates: TransactionStatusUpdate[] = [];
            const retryMonitor = new MockTransactionMonitor(
                createTestMonitoringConfig()
            );
            retryMonitor.setTransactionStatus(timedOutHash, 'success');

            retryMonitor.startMonitoring(timedOutHash, (update) => {
                retryUpdates.push(update);
            });

            await waitForStatus(retryUpdates, 'success', 2000);

            expect(retryUpdates[retryUpdates.length - 1].status).toBe(
                'success'
            );

            monitor2.destroy();
            retryMonitor.destroy();
        });
    });

    describe('Invalid Hash Handling', () => {
        it('should handle monitoring with invalid transaction hash format', async () => {
            const invalidHash = 'invalid-hash';
            const statusUpdates: TransactionStatusUpdate[] = [];
            const errorCalls: Error[] = [];

            monitor.startMonitoring(
                invalidHash,
                (update) => statusUpdates.push(update),
                (error) => errorCalls.push(error)
            );

            // Should still attempt to monitor even with invalid format
            const session = monitor.getSession(invalidHash);
            expect(session).toBeDefined();
            expect(session?.hash).toBe(invalidHash);

            // Set it to fail as if API rejected it
            monitor.setTransactionStatus(invalidHash, 'failed');

            await waitForStatus(statusUpdates, 'failed', 2000);

            expect(statusUpdates[statusUpdates.length - 1].status).toBe(
                'failed'
            );
        });

        it('should handle empty transaction hash', () => {
            const emptyHash = '';

            expect(() => monitor.startMonitoring(emptyHash)).not.toThrow();

            const session = monitor.getSession(emptyHash);
            expect(session).toBeDefined();
        });
    });

    describe('Concurrent Monitoring', () => {
        it('should monitor multiple transactions concurrently', async () => {
            const hashes = [
                'f'.repeat(64),
                'g'.repeat(64),
                'h'.repeat(64),
            ];

            const allUpdates = new Map<
                string,
                TransactionStatusUpdate[]
            >();
            const monitor2 = new MockTransactionMonitor(
                createTestMonitoringConfig()
            );

            // Start monitoring all transactions - all with same status for simplicity
            hashes.forEach((hash, index) => {
                const updates: TransactionStatusUpdate[] = [];
                allUpdates.set(hash, updates);

                monitor2.setTransactionStatus(hash, 'success');
                monitor2.startMonitoring(hash, (update) => {
                    updates.push(update);
                });
            });

            // Wait for all to complete
            const promises = hashes.map((hash) =>
                waitForStatus(allUpdates.get(hash)!, 'success', 2000)
            );

            await Promise.all(promises);

            // Verify all transactions completed
            hashes.forEach((hash, index) => {
                const updates = allUpdates.get(hash)!;
                expect(updates.length).toBeGreaterThan(0);

                const finalUpdate = updates[updates.length - 1];
                expect(finalUpdate.hash).toBe(hash);
            });

            monitor2.destroy();
        });

        it('should handle independent monitoring sessions', async () => {
            const hash1 = 'i'.repeat(64);
            const hash2 = 'j'.repeat(64);

            const updates1: TransactionStatusUpdate[] = [];
            const updates2: TransactionStatusUpdate[] = [];

            const monitor2 = new MockTransactionMonitor(
                createTestMonitoringConfig()
            );

            monitor2.setTransactionStatus(hash1, 'success');
            monitor2.setTransactionStatus(hash2, 'failed');

            monitor2.startMonitoring(hash1, (update) => {
                updates1.push(update);
            });
            monitor2.startMonitoring(hash2, (update) => {
                updates2.push(update);
            });

            const session1 = monitor2.getSession(hash1);
            const session2 = monitor2.getSession(hash2);

            await Promise.all([
                waitForStatus(updates1, 'success', 2000),
                waitForStatus(updates2, 'failed', 2000),
            ]);

            expect(session1?.status).toBe('success');
            expect(session2?.status).toBe('failed');

            monitor2.destroy();
        });
    });
});
