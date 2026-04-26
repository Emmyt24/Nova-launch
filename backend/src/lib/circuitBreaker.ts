/**
 * Circuit Breaker Pattern Implementation
 *
 * Provides resilience for external service calls by preventing cascading failures.
 * When an external service is failing, the circuit breaker "opens" to fail fast,
 * avoiding resource waste and allowing the service to recover.
 *
 * States:
 * - Closed: Normal operation, calls pass through
 * - Open: Service is failing, calls fail immediately with CircuitBreakerOpenError
 * - Half-Open: Testing if service has recovered, allows limited calls
 *
 * Configuration:
 * - failureThreshold: Number of consecutive failures to open the circuit
 * - successThreshold: Number of consecutive successes to close from half-open
 * - timeoutMs: Time to wait before attempting half-open (milliseconds)
 *
 * Security Considerations:
 * - Prevents DoS amplification by failing fast during outages
 * - No external input influences state transitions
 * - Thread-safe for concurrent access
 */

import { AppError, ErrorCode } from './errors.js';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Number of consecutive successes in half-open to close the circuit */
  successThreshold: number;
  /** Time in milliseconds to wait before trying half-open */
  timeoutMs: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreakerOpenError extends AppError {
  constructor(serviceName?: string) {
    super({
      code: ErrorCode.CIRCUIT_BREAKER_OPEN,
      message: `Circuit breaker is open${serviceName ? ` for ${serviceName}` : ''}. Service may be unavailable.`,
    });
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = { ...options };
  }

  /**
   * Execute a function with circuit breaker protection.
   * @param fn The async function to execute
   * @returns The result of the function
   * @throws CircuitBreakerOpenError if circuit is open
   * @throws The original error from fn if circuit is closed/half-open and fn fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkState();

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get current metrics for monitoring/debugging.
   */
  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      timeSinceLastFailure: Date.now() - this.lastFailureTime,
    };
  }

  /**
   * Manually reset the circuit breaker to closed state.
   * Use with caution - typically for administrative recovery.
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  private checkState(): void {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.timeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new CircuitBreakerOpenError();
      }
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = 'closed';
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }
}