/**
 * Transaction Status Monitoring Service
 * Handles polling and status updates for Stellar transactions
 */

export interface TransactionStatusUpdate {
    hash: string;
    status: 'pending' | 'success' | 'failed' | 'timeout';
    timestamp: number;
    ledger?: number;
    error?: string;
}

export interface MonitoringConfig {
    pollingInterval: number; // milliseconds
    maxRetries: number;
    timeout: number; // milliseconds
    backoffMultiplier: number;
}

export interface MonitoringSession {
    hash: string;
    status: 'pending' | 'success' | 'failed' | 'timeout';
    startTime: number;
    endTime?: number;
    lastChecked?: number;
    attempts: number;
    ledger?: number;
    error?: string;
}

export type StatusCallback = (update: TransactionStatusUpdate) => void;
export type ErrorCallback = (error: Error) => void;
/** Called once when a transaction reaches a terminal on-chain state (success or failed). */
export type PostConfirmationHook = (update: TransactionStatusUpdate) => void;

/**
 * Default monitoring configuration
 */
export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
    pollingInterval: 3000, // 3 seconds
    maxRetries: 40, // ~2 minutes with exponential backoff
    timeout: 120000, // 2 minutes total timeout
    backoffMultiplier: 1.0, // linear for predictable timing
};

/**
 * Transaction Monitor Service
 * Monitors transaction status on Stellar network
 */
export class TransactionMonitor {
    private sessions: Map<string, MonitoringSession> = new Map();
    private statusCallbacks: Map<string, Set<StatusCallback>> = new Map();
    private errorCallbacks: Map<string, Set<ErrorCallback>> = new Map();
    private postConfirmationHooks: Map<string, Set<PostConfirmationHook>> = new Map();
    private pollTimers: Map<string, NodeJS.Timeout> = new Map();
    private config: MonitoringConfig;

    constructor(config: Partial<MonitoringConfig> = {}) {
        this.config = {
            ...DEFAULT_MONITORING_CONFIG,
            ...config,
        };
    }

    /**
     * Start monitoring a transaction
     */
    startMonitoring(
        transactionHash: string,
        onStatus?: StatusCallback,
        onError?: ErrorCallback
    ): void {
        if (this.sessions.has(transactionHash)) {
            throw new Error(`Already monitoring transaction ${transactionHash}`);
        }

        // Register callbacks
        if (onStatus) {
            if (!this.statusCallbacks.has(transactionHash)) {
                this.statusCallbacks.set(transactionHash, new Set());
            }
            this.statusCallbacks.get(transactionHash)!.add(onStatus);
        }

        if (onError) {
            if (!this.errorCallbacks.has(transactionHash)) {
                this.errorCallbacks.set(transactionHash, new Set());
            }
            this.errorCallbacks.get(transactionHash)!.add(onError);
        }

        // Create monitoring session
        const session: MonitoringSession = {
            hash: transactionHash,
            status: 'pending',
            startTime: Date.now(),
            attempts: 0,
        };

        this.sessions.set(transactionHash, session);

        // Start polling
        this.poll(transactionHash);
    }

    /**
     * Stop monitoring a transaction
     */
    stopMonitoring(transactionHash: string): void {
        const timer = this.pollTimers.get(transactionHash);
        if (timer) {
            clearTimeout(timer);
            this.pollTimers.delete(transactionHash);
        }

        this.statusCallbacks.delete(transactionHash);
        this.errorCallbacks.delete(transactionHash);
    }

    /**
     * Register status callback for a transaction
     */
    onStatus(transactionHash: string, callback: StatusCallback): void {
        if (!this.statusCallbacks.has(transactionHash)) {
            this.statusCallbacks.set(transactionHash, new Set());
        }
        this.statusCallbacks.get(transactionHash)!.add(callback);
    }

    /**
     * Register error callback for a transaction
     */
    onError(transactionHash: string, callback: ErrorCallback): void {
        if (!this.errorCallbacks.has(transactionHash)) {
            this.errorCallbacks.set(transactionHash, new Set());
        }
        this.errorCallbacks.get(transactionHash)!.add(callback);
    }

    /**
     * Register a post-confirmation hook that fires once when the transaction
     * reaches a terminal on-chain state (success or failed).
     * This is the signal for projection polling to begin.
     */
    onConfirmed(transactionHash: string, hook: PostConfirmationHook): void {
        if (!this.postConfirmationHooks.has(transactionHash)) {
            this.postConfirmationHooks.set(transactionHash, new Set());
        }
        this.postConfirmationHooks.get(transactionHash)!.add(hook);
    }

    /**
     * Get monitoring session details
     */
    getSession(transactionHash: string): MonitoringSession | undefined {
        return this.sessions.get(transactionHash);
    }

    /**
     * Resume monitoring a transaction that was persisted before a page refresh.
     * Unlike startMonitoring, this is a no-op if the hash is already being tracked,
     * making it safe to call on every app boot for all persisted pending txs.
     */
    resumeMonitoring(
        transactionHash: string,
        onStatus?: StatusCallback,
        onError?: ErrorCallback
    ): void {
        if (this.sessions.has(transactionHash)) {
            // Already active — just attach new callbacks if provided
            if (onStatus) this.onStatus(transactionHash, onStatus);
            if (onError) this.onError(transactionHash, onError);
            return;
        }
        this.startMonitoring(transactionHash, onStatus, onError);
    }

    /**
     * Poll transaction status
     */
    private async poll(transactionHash: string): Promise<void> {
        const session = this.sessions.get(transactionHash);
        if (!session) return;

        const elapsedTime = Date.now() - session.startTime;

        // Check timeout
        if (elapsedTime > this.config.timeout) {
            this.updateSession(transactionHash, 'timeout', undefined, 'Transaction monitoring timeout');
            this.emitStatus(transactionHash, 'timeout', 'Transaction monitoring timeout');
            return;
        }

        // Check max retries
        if (session.attempts >= this.config.maxRetries) {
            this.updateSession(transactionHash, 'timeout', undefined, 'Max retries exceeded');
            this.emitStatus(transactionHash, 'timeout', 'Max retries exceeded');
            return;
        }

        session.attempts++;
        session.lastChecked = Date.now();

        try {
            const status = await this.checkTransactionStatus(transactionHash);

            if (status === 'success' || status === 'failed') {
                this.updateSession(transactionHash, status);
                this.emitStatus(transactionHash, status);
                this.emitPostConfirmation(transactionHash, status);
            } else {
                // Still pending, schedule next poll
                const delay = this.calculateDelay(session.attempts);
                const timer = setTimeout(
                    () => this.poll(transactionHash),
                    delay
                );
                this.pollTimers.set(transactionHash, timer);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.emitError(transactionHash, err);

            // Schedule retry
            if (session.attempts < this.config.maxRetries) {
                const delay = this.calculateDelay(session.attempts);
                const timer = setTimeout(
                    () => this.poll(transactionHash),
                    delay
                );
                this.pollTimers.set(transactionHash, timer);
            } else {
                this.updateSession(transactionHash, 'timeout', undefined, 'Max retries exceeded');
                this.emitStatus(transactionHash, 'timeout', 'Max retries exceeded');
            }
        }
    }

    /**
     * Check transaction status on Stellar network using Soroban RPC
     */
    protected async checkTransactionStatus(
        transactionHash: string
    ): Promise<'pending' | 'success' | 'failed'> {
        try {
            const response = await this.fetchTransactionFromRPC(transactionHash);
            return this.mapRPCStatusToMonitorStatus(response);
        } catch (error) {
            // If transaction not found, it's still pending
            if (error instanceof Error && error.message.includes('not found')) {
                return 'pending';
            }
            throw error;
        }
    }

    /**
     * Fetch transaction from Soroban RPC
     */
    private async fetchTransactionFromRPC(hash: string): Promise<any> {
        const rpcUrl = this.getRPCUrl();
        
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [hash],
            }),
        });

        if (!response.ok) {
            throw new Error(`RPC request failed: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message || 'RPC error');
        }

        return data.result;
    }

    /**
     * Map Soroban RPC status to monitor status
     */
    private mapRPCStatusToMonitorStatus(rpcResponse: any): 'pending' | 'success' | 'failed' {
        if (!rpcResponse) {
            return 'pending';
        }

        const status = rpcResponse.status;

        switch (status) {
            case 'SUCCESS':
                return 'success';
            case 'FAILED':
                return 'failed';
            case 'NOT_FOUND':
                return 'pending';
            default:
                return 'pending';
        }
    }

    /**
     * Get RPC URL based on environment
     */
    private getRPCUrl(): string {
        const network = import.meta.env.VITE_NETWORK || 'testnet';
        
        if (network === 'mainnet') {
            return 'https://soroban-rpc.mainnet.stellar.gateway.fm';
        }
        
        return 'https://soroban-testnet.stellar.org';
    }

    /**
     * Calculate polling delay with exponential backoff
     */
    private calculateDelay(attempt: number): number {
        const delay = this.config.pollingInterval * Math.pow(
            this.config.backoffMultiplier,
            attempt
        );
        // Add some jitter to prevent thundering herd
        const jitter = Math.random() * 100;
        return Math.min(delay + jitter, 30000); // Cap at 30 seconds
    }

    /**
     * Update session status
     */
    private updateSession(
        transactionHash: string,
        status: 'pending' | 'success' | 'failed' | 'timeout',
        ledger?: number,
        error?: string
    ): void {
        const session = this.sessions.get(transactionHash);
        if (!session) return;

        session.status = status;
        session.endTime = Date.now();
        if (ledger !== undefined) {
            session.ledger = ledger;
        }
        if (error) {
            session.error = error;
        }

        // Clean up timers and callbacks if completed
        if (status !== 'pending') {
            const timer = this.pollTimers.get(transactionHash);
            if (timer) {
                clearTimeout(timer);
                this.pollTimers.delete(transactionHash);
            }
        }
    }

    /**
     * Emit post-confirmation hooks (fires once on terminal state)
     */
    private emitPostConfirmation(
        transactionHash: string,
        status: 'success' | 'failed'
    ): void {
        const hooks = this.postConfirmationHooks.get(transactionHash);
        if (!hooks) return;
        const update: TransactionStatusUpdate = {
            hash: transactionHash,
            status,
            timestamp: Date.now(),
        };
        hooks.forEach((hook) => {
            try { hook(update); } catch (err) {
                console.error('Error in post-confirmation hook:', err);
            }
        });
        // Fire once — clean up
        this.postConfirmationHooks.delete(transactionHash);
    }

    /**
     * Emit status update to all registered callbacks
     */
    private emitStatus(
        transactionHash: string,
        status: 'pending' | 'success' | 'failed' | 'timeout',
        error?: string
    ): void {
        const callbacks = this.statusCallbacks.get(transactionHash);
        if (callbacks) {
            const update: TransactionStatusUpdate = {
                hash: transactionHash,
                status,
                timestamp: Date.now(),
                error,
            };

            const session = this.sessions.get(transactionHash);
            if (session && session.ledger) {
                update.ledger = session.ledger;
            }

            callbacks.forEach((callback) => {
                try {
                    callback(update);
                } catch (err) {
                    console.error('Error in status callback:', err);
                }
            });
        }
    }

    /**
     * Emit error to all registered callbacks
     */
    private emitError(transactionHash: string, error: Error): void {
        const callbacks = this.errorCallbacks.get(transactionHash);
        if (callbacks) {
            callbacks.forEach((callback) => {
                try {
                    callback(error);
                } catch (err) {
                    console.error('Error in error callback:', err);
                }
            });
        }
    }

    /**
     * Clean up all active monitoring sessions
     */
    destroy(): void {
        this.pollTimers.forEach((timer) => clearTimeout(timer));
        this.pollTimers.clear();
        this.sessions.clear();
        this.statusCallbacks.clear();
        this.errorCallbacks.clear();
        this.postConfirmationHooks.clear();
    }
}
