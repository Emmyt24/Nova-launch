/**
 * In-process background job queue for asynchronous task processing.
 *
 * Design:
 *  - Jobs are enqueued with a type, payload, and optional priority (higher = sooner).
 *  - A configurable number of concurrent workers drain the queue.
 *  - Failed jobs are retried up to MAX_RETRIES times with exponential back-off.
 *  - After exhausting retries the job moves to a dead-letter list for inspection.
 *  - The queue is intentionally in-process (no Redis/DB dependency) so it works
 *    out of the box; swap the storage layer later if persistence is needed.
 *
 * Security / OWASP:
 *  - Payload size is capped at MAX_PAYLOAD_BYTES to prevent memory exhaustion.
 *  - Job handlers are registered by name; unknown job types are rejected.
 *  - Errors in handlers are caught and never propagate to callers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "running" | "completed" | "failed" | "dead";

export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  /** Higher number = higher priority. Default 0. */
  priority: number;
  attempts: number;
  maxRetries: number;
  status: JobStatus;
  createdAt: Date;
  runAt: Date; // earliest time the job may be picked up
  error?: string;
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

export interface EnqueueOptions {
  priority?: number;
  maxRetries?: number;
  /** Delay in ms before the job becomes eligible. Default 0. */
  delayMs?: number;
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

// ---------------------------------------------------------------------------
// JobQueue
// ---------------------------------------------------------------------------

export class JobQueue {
  private handlers = new Map<string, JobHandler<any>>();
  private pending: Job[] = [];
  private running = new Map<string, Job>();
  private completed: Job[] = [];
  private dead: Job[] = [];

  private concurrency: number;
  private activeWorkers = 0;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  /** Counts for completed/failed (kept separately to avoid unbounded arrays). */
  private completedCount = 0;
  private failedCount = 0;

  constructor(concurrency = 2) {
    this.concurrency = Math.max(1, concurrency);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Register a handler for a job type.
   * Throws if the type is already registered.
   */
  register<T>(type: string, handler: JobHandler<T>): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler for job type "${type}" is already registered`);
    }
    this.handlers.set(type, handler as JobHandler<unknown>);
  }

  /**
   * Enqueue a new job.
   * Returns the created Job object.
   * Throws if the payload exceeds MAX_PAYLOAD_BYTES or the type is unknown.
   */
  enqueue<T>(type: string, payload: T, opts: EnqueueOptions = {}): Job<T> {
    if (!this.handlers.has(type)) {
      throw new Error(`No handler registered for job type "${type}"`);
    }

    const payloadSize = Buffer.byteLength(JSON.stringify(payload));
    if (payloadSize > MAX_PAYLOAD_BYTES) {
      throw new Error(`Payload size ${payloadSize} bytes exceeds limit of ${MAX_PAYLOAD_BYTES} bytes`);
    }

    const job: Job<T> = {
      id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      payload,
      priority: opts.priority ?? 0,
      attempts: 0,
      maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
      status: "pending",
      createdAt: new Date(),
      runAt: new Date(Date.now() + (opts.delayMs ?? 0)),
    };

    this.pending.push(job);
    this.pending.sort((a, b) => b.priority - a.priority); // highest priority first

    this.scheduleTick();
    return job;
  }

  /** Start the queue (begins processing pending jobs). */
  start(): void {
    this.stopped = false;
    this.scheduleTick();
  }

  /** Stop accepting new work and drain in-flight jobs. */
  stop(): void {
    this.stopped = true;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** Current queue statistics. */
  stats(): QueueStats {
    return {
      pending: this.pending.length,
      running: this.running.size,
      completed: this.completedCount,
      failed: this.failedCount,
      dead: this.dead.length,
    };
  }

  /** Jobs in the dead-letter list (exhausted all retries). */
  deadLetterJobs(): Job[] {
    return [...this.dead];
  }

  /** Number of currently active workers. */
  get workerCount(): number {
    return this.activeWorkers;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private scheduleTick(): void {
    if (this.tickTimer || this.stopped) return;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.tick();
    }, 0);
  }

  private tick(): void {
    if (this.stopped) return;

    const now = Date.now();

    while (
      this.activeWorkers < this.concurrency &&
      this.pending.length > 0
    ) {
      // Find the first job that is eligible to run (runAt <= now)
      const idx = this.pending.findIndex((j) => j.runAt.getTime() <= now);
      if (idx === -1) break;

      const [job] = this.pending.splice(idx, 1);
      this.runJob(job);
    }

    // If there are delayed jobs still waiting, schedule another tick
    if (this.pending.length > 0) {
      const nextRunAt = Math.min(...this.pending.map((j) => j.runAt.getTime()));
      const delay = Math.max(0, nextRunAt - Date.now());
      this.tickTimer = setTimeout(() => {
        this.tickTimer = null;
        this.tick();
      }, delay);
    }
  }

  private async runJob(job: Job): Promise<void> {
    job.status = "running";
    job.attempts += 1;
    this.running.set(job.id, job);
    this.activeWorkers++;

    const handler = this.handlers.get(job.type)!;

    try {
      await handler(job);
      job.status = "completed";
      this.completedCount++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      job.error = message;

      if (job.attempts < job.maxRetries) {
        // Exponential back-off: 500ms, 1s, 2s, …
        const backoff = BASE_BACKOFF_MS * Math.pow(2, job.attempts - 1);
        job.status = "pending";
        job.runAt = new Date(Date.now() + backoff);
        this.pending.push(job);
        this.pending.sort((a, b) => b.priority - a.priority);
      } else {
        job.status = "dead";
        this.dead.push(job);
        this.failedCount++;
      }
    } finally {
      this.running.delete(job.id);
      this.activeWorkers--;
      this.scheduleTick();
    }
  }
}

/** Singleton instance used by the application. */
export const jobQueue = new JobQueue(
  parseInt(process.env.JOB_QUEUE_CONCURRENCY || "2")
);

export default jobQueue;
