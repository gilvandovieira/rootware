import { RootwareError } from "@rootware/errors";
import type { Logger } from "@rootware/log";

const DEFAULT_QUEUE_NAME = "default";
const DEFAULT_PRIORITY: JobPriority = "normal";
const DEFAULT_ATTEMPTS = 1;
const DEFAULT_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const DEFAULT_BACKOFF_STRATEGY: BackoffStrategy = "exponential";
const DEFAULT_WORKER_INTERVAL_MS = 1_000;
const DEFAULT_WORKER_CONCURRENCY = 1;

export type JobErrorCode =
  | "JOB_INVALID"
  | "JOB_UNKNOWN"
  | "JOB_INVALID_PAYLOAD"
  | "JOB_ENQUEUE_FAILED"
  | "JOB_EXECUTE_FAILED"
  | "JOB_SAVE_FAILED"
  | "JOB_RETRY_FAILED"
  | "JOB_CANCEL_FAILED"
  | "JOB_STORE_MISSING"
  | "JOB_WORKER_ALREADY_STARTED"
  | "JOB_WORKER_NOT_STARTED"
  | "JOB_UNKNOWN_ERROR"
  | (string & Record<never, never>);

export type JobId = string;

export type JobName = string;

export type JobQueueName = string;

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead"
  | "canceled";

export type JobPriority =
  | "low"
  | "normal"
  | "high"
  | "critical";

export type JobPayload = unknown;

export type JobOutput = unknown;

export type JobMetadata = Record<string, unknown>;

export type BackoffStrategy =
  | "fixed"
  | "linear"
  | "exponential";

export interface RetryOptions {
  readonly attempts?: number;
  readonly backoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly backoffStrategy?: BackoffStrategy;
}

export interface JobTimestamps {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface JobAttempt {
  readonly attempt: number;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly error?: Record<string, unknown>;
}

/** Stored job record used by queues and stores. */
export interface JobRecord<
  TPayload = JobPayload,
  TOutput = JobOutput,
> {
  readonly id: JobId;
  readonly queue: JobQueueName;
  readonly name: JobName;
  readonly status: JobStatus;
  readonly priority: JobPriority;
  readonly payload: TPayload;
  readonly output?: TOutput;
  readonly metadata: JobMetadata;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly maxBackoffMs: number;
  readonly backoffStrategy: BackoffStrategy;
  readonly timestamps: JobTimestamps;
  readonly attemptHistory: JobAttempt[];
  readonly error?: Record<string, unknown>;
  readonly idempotencyKey?: string;
}

export type JobHandler<TPayload = unknown, TOutput = unknown> = (
  payload: TPayload,
  ctx: JobContext,
) => TOutput | Promise<TOutput>;

export interface JobContext {
  readonly job: JobRecord;
  readonly logger?: Logger;
  readonly signal?: AbortSignal;
  readonly attempt: number;
  now(): Date;
}

export interface JobRunResult<TOutput = JobOutput> {
  readonly job: JobRecord<JobPayload, TOutput>;
  readonly output?: TOutput;
  readonly durationMs: number;
}

export interface DefineJobOptions<
  TPayload = unknown,
  TOutput = unknown,
> {
  readonly name: JobName;
  readonly run: JobHandler<TPayload, TOutput>;
  readonly validate?: (payload: unknown) => TPayload;
  readonly defaultRetry?: RetryOptions;
  readonly defaultPriority?: JobPriority;
  readonly description?: string;
}

/** Typed job definition registered with a queue. */
export interface JobDefinition<
  TPayload = unknown,
  TOutput = unknown,
> {
  readonly name: JobName;
  readonly run: JobHandler<TPayload, TOutput>;
  readonly validate?: (payload: unknown) => TPayload;
  readonly defaultRetry?: RetryOptions;
  readonly defaultPriority?: JobPriority;
  readonly description?: string;
}

export interface EnqueueOptions extends RetryOptions {
  readonly id?: JobId;
  readonly queue?: JobQueueName;
  readonly priority?: JobPriority;
  readonly delayMs?: number;
  readonly runAt?: Date | string | number;
  readonly metadata?: JobMetadata;
  readonly idempotencyKey?: string;
}

export interface JobQueueOptions {
  readonly jobs?: JobDefinition[];
  readonly store?: JobStore;
  readonly queue?: JobQueueName;
  readonly logger?: Logger;
}

export interface JobWorkerOptions {
  readonly queue?: JobQueueName;
  readonly names?: JobName[];
  readonly intervalMs?: number;
  readonly concurrency?: number;
  readonly stopOnError?: boolean;
  readonly signal?: AbortSignal;
}

export interface JobStoreOptions {
  readonly queue?: JobQueueName;
}

export interface MemoryJobStoreOptions {
  readonly jobs?: JobRecord[];
  readonly cloneValues?: boolean;
  readonly maxJobs?: number;
}

export interface JobListOptions {
  readonly queue?: JobQueueName;
  readonly name?: JobName;
  readonly status?: JobStatus;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface JobListResult {
  readonly jobs: JobRecord[];
  readonly cursor?: string;
  readonly hasMore: boolean;
}

/** Async-first store for job records. */
export interface JobStore {
  enqueue(job: JobRecord): Promise<JobRecord>;

  get(id: JobId): Promise<JobRecord | undefined>;

  update(job: JobRecord): Promise<void>;

  delete(id: JobId): Promise<boolean>;

  claimNext(options?: {
    readonly queue?: JobQueueName;
    readonly names?: JobName[];
    readonly now?: Date | string | number;
  }): Promise<JobRecord | undefined>;

  list(options?: JobListOptions): Promise<JobListResult>;

  findByIdempotencyKey?(
    key: string,
  ): Promise<JobRecord | undefined>;

  clear?(): Promise<void>;

  close?(): Promise<void>;
}

/** Public job queue API. */
export interface JobQueue {
  enqueue<TPayload = unknown>(
    name: JobName,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<JobRecord<TPayload>>;

  enqueueMany(
    jobs: Array<{
      readonly name: JobName;
      readonly payload: unknown;
      readonly options?: EnqueueOptions;
    }>,
  ): Promise<JobRecord[]>;

  get(id: JobId): Promise<JobRecord | undefined>;

  cancel(id: JobId): Promise<boolean>;

  retry(id: JobId): Promise<JobRecord>;

  processNext(options?: {
    readonly queue?: JobQueueName;
    readonly names?: JobName[];
    readonly signal?: AbortSignal;
  }): Promise<JobRecord | undefined>;

  drain(options?: {
    readonly queue?: JobQueueName;
    readonly names?: JobName[];
    readonly limit?: number;
    readonly signal?: AbortSignal;
  }): Promise<JobRecord[]>;

  worker(options?: JobWorkerOptions): JobWorker;

  list(options?: JobListOptions): Promise<JobListResult>;

  close(): Promise<void>;
}

export interface JobWorker {
  readonly running: boolean;
  start(): void;
  stop(): Promise<void>;
  tick(): Promise<JobRecord[]>;
}

export interface JobRegistry {
  get(name: JobName): JobDefinition | undefined;
  has(name: JobName): boolean;
  list(): JobDefinition[];
  names(): JobName[];
}

export interface CreateJobIdOptions {
  readonly prefix?: string;
}

export interface JobErrorOptions {
  readonly code?: JobErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Error thrown for job queue, store, worker, and execution failures. */
export class JobError extends RootwareError {
  constructor(message: string, options: JobErrorOptions = {}) {
    super(message, {
      code: options.code ?? "JOB_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? false,
      severity: options.severity ?? "error",
      details: options.details,
      cause: options.cause,
    });
  }
}

/** Defines a typed job without executing it. */
export function defineJob<TPayload = unknown, TOutput = unknown>(
  options: DefineJobOptions<TPayload, TOutput>,
): JobDefinition<TPayload, TOutput> {
  const name = normalizeJobName(options.name);

  if (typeof options.run !== "function") {
    throw new JobError("Job run handler must be a function", {
      code: "JOB_INVALID",
      details: { name },
    });
  }

  const defaultRetry = options.defaultRetry === undefined
    ? undefined
    : normalizeRetryOptions(options.defaultRetry);
  const defaultPriority = normalizePriority(
    options.defaultPriority ?? DEFAULT_PRIORITY,
  );

  return Object.freeze({
    name,
    run: options.run,
    ...(options.validate === undefined ? {} : { validate: options.validate }),
    ...(defaultRetry === undefined ? {} : { defaultRetry }),
    defaultPriority,
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
  });
}

/** Creates an immutable job registry. */
export function defineJobs(jobs: JobDefinition[]): JobRegistry {
  const definitions = new Map<JobName, JobDefinition>();

  for (const job of jobs) {
    const definition = defineJob(job);

    if (definitions.has(definition.name)) {
      throw new JobError("Duplicate job name", {
        code: "JOB_INVALID",
        details: { name: definition.name },
      });
    }

    definitions.set(definition.name, definition);
  }

  return Object.freeze({
    get(name: JobName): JobDefinition | undefined {
      return definitions.get(normalizeJobName(name));
    },

    has(name: JobName): boolean {
      return definitions.has(normalizeJobName(name));
    },

    list(): JobDefinition[] {
      return [...definitions.values()];
    },

    names(): JobName[] {
      return [...definitions.keys()];
    },
  });
}

/** Creates a job queue backed by an async store. */
export function createJobQueue(
  options: JobQueueOptions = {},
): JobQueue {
  return new RootwareJobQueue({
    registry: defineJobs(options.jobs ?? []),
    store: options.store ?? memoryJobStore(),
    queue: normalizeQueueName(options.queue ?? DEFAULT_QUEUE_NAME),
    logger: options.logger,
  });
}

/**
 * Creates an in-memory job store for tests and local development.
 *
 * It is not distributed and should not be used as production infrastructure.
 */
export function memoryJobStore(
  options: MemoryJobStoreOptions = {},
): JobStore {
  const jobs = new Map<JobId, JobRecord>();
  const cloneValues = options.cloneValues ?? false;
  const maxJobs = normalizeOptionalPositiveInteger(options.maxJobs, "maxJobs");

  for (const job of options.jobs ?? []) {
    const normalized = normalizeJobRecord(job);
    jobs.set(normalized.id, cloneJobRecord(normalized, cloneValues));
  }

  return {
    enqueue(job: JobRecord): Promise<JobRecord> {
      const normalized = normalizeJobRecord(job);
      jobs.set(normalized.id, cloneJobRecord(normalized, cloneValues));
      evictOverflowJobs(jobs, maxJobs);
      return Promise.resolve(cloneJobRecord(normalized, cloneValues));
    },

    get(id: JobId): Promise<JobRecord | undefined> {
      const job = jobs.get(normalizeJobId(id));
      return Promise.resolve(
        job === undefined ? undefined : cloneJobRecord(job, cloneValues),
      );
    },

    update(job: JobRecord): Promise<void> {
      const normalized = normalizeJobRecord(job);
      jobs.set(normalized.id, cloneJobRecord(normalized, cloneValues));
      evictOverflowJobs(jobs, maxJobs);
      return Promise.resolve();
    },

    delete(id: JobId): Promise<boolean> {
      return Promise.resolve(jobs.delete(normalizeJobId(id)));
    },

    claimNext(options: {
      readonly queue?: JobQueueName;
      readonly names?: JobName[];
      readonly now?: Date | string | number;
    } = {}): Promise<JobRecord | undefined> {
      const queue = options.queue === undefined
        ? undefined
        : normalizeQueueName(options.queue);
      const names = options.names === undefined
        ? undefined
        : new Set(options.names.map(normalizeJobName));
      const now = toDate(options.now ?? new Date());
      const ready = [...jobs.values()]
        .filter((job) => {
          if (!isJobReady(job, now)) {
            return false;
          }

          if (queue !== undefined && job.queue !== queue) {
            return false;
          }

          if (names !== undefined && !names.has(job.name)) {
            return false;
          }

          return true;
        })
        .sort(compareJobsForClaim);
      const job = ready[0];

      if (job === undefined) {
        return Promise.resolve(undefined);
      }

      const timestamp = new Date().toISOString();
      const claimed = {
        ...job,
        status: "running" as const,
        timestamps: {
          ...job.timestamps,
          updatedAt: timestamp,
          startedAt: timestamp,
        },
      };

      jobs.set(claimed.id, cloneJobRecord(claimed, cloneValues));
      return Promise.resolve(cloneJobRecord(claimed, cloneValues));
    },

    list(options: JobListOptions = {}): Promise<JobListResult> {
      const queue = options.queue === undefined
        ? undefined
        : normalizeQueueName(options.queue);
      const name = options.name === undefined
        ? undefined
        : normalizeJobName(options.name);
      const status = options.status === undefined
        ? undefined
        : normalizeJobStatus(options.status);
      const limit = normalizeOptionalPositiveInteger(options.limit, "limit");
      const cursor = options.cursor === undefined
        ? undefined
        : normalizeJobId(options.cursor);
      const filtered = [...jobs.values()]
        .filter((job) =>
          (queue === undefined || job.queue === queue) &&
          (name === undefined || job.name === name) &&
          (status === undefined || job.status === status)
        )
        .sort(compareJobsByCreatedAt);
      const startIndex = cursor === undefined ? 0 : Math.max(
        0,
        filtered.findIndex((job) => job.id === cursor) + 1,
      );
      const available = filtered.slice(startIndex);
      const selected = limit === undefined
        ? available
        : available.slice(0, limit);
      const nextJob = limit === undefined ? undefined : available[limit];

      return Promise.resolve({
        jobs: selected.map((job) => cloneJobRecord(job, cloneValues)),
        ...(nextJob === undefined ? {} : { cursor: nextJob.id }),
        hasMore: nextJob !== undefined,
      });
    },

    findByIdempotencyKey(key: string): Promise<JobRecord | undefined> {
      for (const job of jobs.values()) {
        if (job.idempotencyKey === key) {
          return Promise.resolve(cloneJobRecord(job, cloneValues));
        }
      }

      return Promise.resolve(undefined);
    },

    clear(): Promise<void> {
      jobs.clear();
      return Promise.resolve();
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/** Creates a job store that never persists jobs. */
export function noopJobStore(): JobStore {
  return {
    enqueue(job: JobRecord): Promise<JobRecord> {
      return Promise.resolve(job);
    },

    get(_id: JobId): Promise<JobRecord | undefined> {
      return Promise.resolve(undefined);
    },

    update(_job: JobRecord): Promise<void> {
      return Promise.resolve();
    },

    delete(_id: JobId): Promise<boolean> {
      return Promise.resolve(false);
    },

    claimNext(_options?: {
      readonly queue?: JobQueueName;
      readonly names?: JobName[];
      readonly now?: Date | string | number;
    }): Promise<JobRecord | undefined> {
      return Promise.resolve(undefined);
    },

    list(_options?: JobListOptions): Promise<JobListResult> {
      return Promise.resolve({ jobs: [], hasMore: false });
    },

    findByIdempotencyKey(_key: string): Promise<JobRecord | undefined> {
      return Promise.resolve(undefined);
    },

    clear(): Promise<void> {
      return Promise.resolve();
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/** Creates a queue facade that does not persist or execute jobs. */
export function noopJobQueue(): JobQueue {
  return {
    enqueue<TPayload = unknown>(
      name: JobName,
      payload: TPayload,
      options?: EnqueueOptions,
    ): Promise<JobRecord<TPayload>> {
      return Promise.resolve(createJobRecord(name, payload, options));
    },

    enqueueMany(
      jobs: Array<{
        readonly name: JobName;
        readonly payload: unknown;
        readonly options?: EnqueueOptions;
      }>,
    ): Promise<JobRecord[]> {
      const records: JobRecord[] = [];

      for (const job of jobs) {
        records.push(createJobRecord(job.name, job.payload, job.options));
      }

      return Promise.resolve(records);
    },

    get(_id: JobId): Promise<JobRecord | undefined> {
      return Promise.resolve(undefined);
    },

    cancel(_id: JobId): Promise<boolean> {
      return Promise.resolve(false);
    },

    retry(_id: JobId): Promise<JobRecord> {
      return Promise.reject(
        new JobError("Job cannot be retried", {
          code: "JOB_RETRY_FAILED",
        }),
      );
    },

    processNext(_options?: {
      readonly queue?: JobQueueName;
      readonly names?: JobName[];
      readonly signal?: AbortSignal;
    }): Promise<JobRecord | undefined> {
      return Promise.resolve(undefined);
    },

    drain(_options?: {
      readonly queue?: JobQueueName;
      readonly names?: JobName[];
      readonly limit?: number;
      readonly signal?: AbortSignal;
    }): Promise<JobRecord[]> {
      return Promise.resolve([]);
    },

    worker(_options?: JobWorkerOptions): JobWorker {
      return noopWorker();
    },

    list(_options?: JobListOptions): Promise<JobListResult> {
      return Promise.resolve({ jobs: [], hasMore: false });
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/** Creates a secure URL-safe job id. */
export function createJobId(options: CreateJobIdOptions = {}): JobId {
  const crypto = globalThis.crypto;

  if (crypto === undefined) {
    throw new JobError("Secure random generation is unavailable", {
      code: "JOB_INVALID",
      severity: "fatal",
    });
  }

  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : createRandomHexId(crypto);

  if (options.prefix === undefined || options.prefix.trim().length === 0) {
    return normalizeJobId(id);
  }

  return normalizeJobId(`${normalizeJobName(options.prefix)}_${id}`);
}

/** Creates a queued job record. */
export function createJobRecord<TPayload = unknown>(
  name: JobName,
  payload: TPayload,
  options: EnqueueOptions & {
    readonly now?: Date | string | number;
  } = {},
): JobRecord<TPayload> {
  const now = toDate(options.now ?? new Date());
  const timestamp = now.toISOString();
  const retry = normalizeRetryOptions(options);
  const runAt = resolveRunAt(options, now);

  return {
    id: options.id === undefined ? createJobId() : normalizeJobId(options.id),
    queue: normalizeQueueName(options.queue ?? DEFAULT_QUEUE_NAME),
    name: normalizeJobName(name),
    status: "queued",
    priority: normalizePriority(options.priority ?? DEFAULT_PRIORITY),
    payload,
    metadata: cloneMetadata(options.metadata ?? {}),
    attempts: 0,
    maxAttempts: retry.attempts,
    backoffMs: retry.backoffMs,
    maxBackoffMs: retry.maxBackoffMs,
    backoffStrategy: retry.backoffStrategy,
    timestamps: {
      createdAt: timestamp,
      updatedAt: timestamp,
      runAt,
    },
    attemptHistory: [],
    ...(options.idempotencyKey === undefined ? {} : {
      idempotencyKey: normalizeIdempotencyKey(options.idempotencyKey),
    }),
  };
}

/** Creates a safe attempt history entry. */
export function createJobAttempt(
  options: {
    readonly attempt: number;
    readonly startedAt?: Date | string | number;
    readonly finishedAt?: Date | string | number;
    readonly error?: unknown;
  },
): JobAttempt {
  const attempt = normalizePositiveInteger(options.attempt, "attempt");

  return {
    attempt,
    startedAt: toDate(options.startedAt ?? new Date()).toISOString(),
    ...(options.finishedAt === undefined ? {} : {
      finishedAt: toDate(options.finishedAt).toISOString(),
    }),
    ...(options.error === undefined ? {} : {
      error: serializeJobError(options.error),
    }),
  };
}

/** Calculates the next run time for a failed job retry. */
export function calculateNextRunAt(
  job: JobRecord,
  options: {
    readonly now?: Date | string | number;
  } = {},
): string {
  const now = toDate(options.now ?? new Date());
  const backoffMs = calculateBackoffMs(job.attempts, {
    attempts: job.maxAttempts,
    backoffMs: job.backoffMs,
    maxBackoffMs: job.maxBackoffMs,
    backoffStrategy: job.backoffStrategy,
  });

  return new Date(now.getTime() + backoffMs).toISOString();
}

/** Calculates retry backoff in milliseconds. */
export function calculateBackoffMs(
  attempt: number,
  options: RetryOptions = {},
): number {
  const normalizedAttempt = Math.max(
    1,
    normalizePositiveInteger(attempt, "attempt"),
  );
  const retry = normalizeRetryOptions(options);
  let value = retry.backoffMs;

  if (retry.backoffStrategy === "linear") {
    value = retry.backoffMs * normalizedAttempt;
  } else if (retry.backoffStrategy === "exponential") {
    value = retry.backoffMs * 2 ** (normalizedAttempt - 1);
  }

  return Math.max(0, Math.min(value, retry.maxBackoffMs));
}

/** Returns true when a queued job is ready to be claimed. */
export function isJobReady(
  job: JobRecord,
  now?: Date | string | number,
): boolean {
  return job.status === "queued" &&
    toDate(job.timestamps.runAt).getTime() <=
      toDate(now ?? new Date()).getTime();
}

/** Returns true for statuses that should not be processed again automatically. */
export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "succeeded" || status === "dead" || status === "canceled";
}

/** Returns true for statuses that can be manually retried. */
export function isRetryableJobStatus(status: JobStatus): boolean {
  return status === "failed" || status === "dead" || status === "canceled";
}

/** Normalizes and validates a job name. */
export function normalizeJobName(name: string): JobName {
  return normalizeName(name, "job name");
}

/** Normalizes and validates a queue name. */
export function normalizeQueueName(name: string): JobQueueName {
  return normalizeName(name, "queue name");
}

/** Returns a log-safe job summary. */
export function safeJobInfo(job: JobRecord): Record<string, unknown> {
  return {
    id: job.id,
    queue: job.queue,
    name: job.name,
    status: job.status,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.timestamps.createdAt,
    updatedAt: job.timestamps.updatedAt,
    runAt: job.timestamps.runAt,
    ...(job.timestamps.startedAt === undefined ? {} : {
      startedAt: job.timestamps.startedAt,
    }),
    ...(job.timestamps.finishedAt === undefined ? {} : {
      finishedAt: job.timestamps.finishedAt,
    }),
    ...(job.idempotencyKey === undefined ? {} : {
      idempotencyKey: job.idempotencyKey,
    }),
  };
}

/** Serializes an unknown job error into a JSON-safe object. */
export function serializeJobError(error: unknown): Record<string, unknown> {
  try {
    if (error instanceof RootwareError) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status,
        expose: error.expose,
        severity: error.severity,
        ...(error.details === undefined ? {} : { details: error.details }),
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (typeof error === "string") {
      return {
        name: "Error",
        message: error,
      };
    }

    return {
      name: "Error",
      message: "Unknown job error",
    };
  } catch {
    return {
      name: "Error",
      message: "Unknown job error",
    };
  }
}

/** Converts a serialized job error into a plain Error. */
export function deserializeJobError(value: unknown): Error {
  if (isRecord(value) && typeof value.message === "string") {
    const error = new Error(value.message);

    if (typeof value.name === "string") {
      error.name = value.name;
    }

    if (typeof value.stack === "string") {
      error.stack = value.stack;
    }

    return error;
  }

  if (typeof value === "string") {
    return new Error(value);
  }

  return new Error("Unknown job error");
}

interface RootwareJobQueueOptions {
  readonly registry: JobRegistry;
  readonly store: JobStore;
  readonly queue: JobQueueName;
  readonly logger?: Logger;
}

class RootwareJobQueue implements JobQueue {
  readonly #registry: JobRegistry;
  readonly #store: JobStore;
  readonly #queue: JobQueueName;
  readonly #logger?: Logger;

  constructor(options: RootwareJobQueueOptions) {
    this.#registry = options.registry;
    this.#store = options.store;
    this.#queue = options.queue;
    this.#logger = options.logger;
  }

  async enqueue<TPayload = unknown>(
    name: JobName,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<JobRecord<TPayload>> {
    try {
      const definition = this.#getDefinition(name);
      const validatedPayload = definition.validate === undefined
        ? payload
        : definition.validate(payload);
      const retry = mergeRetryOptions(definition.defaultRetry, options);
      const priority = options.priority ?? definition.defaultPriority ??
        DEFAULT_PRIORITY;
      const queue = options.queue ?? this.#queue;

      if (
        options.idempotencyKey !== undefined &&
        this.#store.findByIdempotencyKey !== undefined
      ) {
        const existing = await this.#store.findByIdempotencyKey(
          normalizeIdempotencyKey(options.idempotencyKey),
        );

        if (existing !== undefined && !isTerminalJobStatus(existing.status)) {
          return existing as JobRecord<TPayload>;
        }
      }

      const job = createJobRecord(definition.name, validatedPayload, {
        ...options,
        ...retry,
        priority,
        queue,
      });
      const stored = await this.#store.enqueue(job);
      this.#debug({ job: safeJobInfo(stored) }, "job enqueued");
      return stored as JobRecord<TPayload>;
    } catch (error) {
      throw toJobError(error, "JOB_ENQUEUE_FAILED", {
        name: safeName(name),
      });
    }
  }

  async enqueueMany(
    jobs: Array<{
      readonly name: JobName;
      readonly payload: unknown;
      readonly options?: EnqueueOptions;
    }>,
  ): Promise<JobRecord[]> {
    const records: JobRecord[] = [];

    for (const job of jobs) {
      records.push(await this.enqueue(job.name, job.payload, job.options));
    }

    return records;
  }

  get(id: JobId): Promise<JobRecord | undefined> {
    return this.#store.get(normalizeJobId(id));
  }

  async cancel(id: JobId): Promise<boolean> {
    const jobId = normalizeJobId(id);

    try {
      const job = await this.#store.get(jobId);

      if (job === undefined || isTerminalJobStatus(job.status)) {
        return false;
      }

      const updated = updateJob(job, {
        status: "canceled",
        finishedAt: new Date(),
      });

      await this.#store.update(updated);
      this.#info({ job: safeJobInfo(updated) }, "job canceled");
      return true;
    } catch (error) {
      throw toJobError(error, "JOB_CANCEL_FAILED", { id: jobId });
    }
  }

  async retry(id: JobId): Promise<JobRecord> {
    const jobId = normalizeJobId(id);

    try {
      const job = await this.#store.get(jobId);

      if (job === undefined) {
        throw new JobError("Job not found", {
          code: "JOB_UNKNOWN",
          details: { id: jobId },
        });
      }

      if (!isRetryableJobStatus(job.status)) {
        throw new JobError("Job status is not retryable", {
          code: "JOB_RETRY_FAILED",
          details: { id: jobId, status: job.status },
        });
      }

      const now = new Date();
      const updated = {
        ...job,
        status: "queued" as const,
        error: undefined,
        timestamps: {
          ...job.timestamps,
          updatedAt: now.toISOString(),
          runAt: now.toISOString(),
          finishedAt: undefined,
        },
      };

      await this.#store.update(stripUndefinedJobFields(updated));
      return stripUndefinedJobFields(updated);
    } catch (error) {
      throw toJobError(error, "JOB_RETRY_FAILED", { id: jobId });
    }
  }

  async processNext(options: {
    readonly queue?: JobQueueName;
    readonly names?: JobName[];
    readonly signal?: AbortSignal;
  } = {}): Promise<JobRecord | undefined> {
    const signal = options.signal;

    if (signal?.aborted) {
      throw new JobError("Job processing aborted", {
        code: "JOB_EXECUTE_FAILED",
        details: { reason: "aborted" },
      });
    }

    const claimed = await this.#store.claimNext({
      queue: options.queue ?? this.#queue,
      names: options.names,
    });

    if (claimed === undefined) {
      return undefined;
    }

    const definition = this.#registry.get(claimed.name);

    if (definition === undefined) {
      const dead = updateJob(claimed, {
        status: "dead",
        error: new JobError("Unknown job definition", {
          code: "JOB_UNKNOWN",
          details: { name: claimed.name },
        }),
        finishedAt: new Date(),
      });
      await this.#store.update(dead);
      throw new JobError("Unknown job definition", {
        code: "JOB_UNKNOWN",
        details: { name: claimed.name, id: claimed.id },
      });
    }

    const startedAt = new Date();
    const attempt = claimed.attempts + 1;
    const running = {
      ...claimed,
      status: "running" as const,
      attempts: attempt,
      timestamps: {
        ...claimed.timestamps,
        startedAt: startedAt.toISOString(),
        updatedAt: startedAt.toISOString(),
      },
    };

    await this.#store.update(running);
    this.#info({ job: safeJobInfo(running) }, "job started");

    try {
      if (signal?.aborted) {
        throw new JobError("Job processing aborted", {
          code: "JOB_EXECUTE_FAILED",
          details: { id: running.id, reason: "aborted" },
        });
      }

      const output = await definition.run(running.payload, {
        job: running,
        logger: this.#logger,
        signal,
        attempt,
        now: () => new Date(),
      });
      const finishedAt = new Date();
      const succeeded = {
        ...running,
        status: "succeeded" as const,
        output,
        error: undefined,
        attemptHistory: [
          ...running.attemptHistory,
          createJobAttempt({
            attempt,
            startedAt,
            finishedAt,
          }),
        ],
        timestamps: {
          ...running.timestamps,
          updatedAt: finishedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
        },
      };
      const finalJob = stripUndefinedJobFields(succeeded);

      await this.#store.update(finalJob);
      this.#info(
        {
          job: safeJobInfo(finalJob),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
        "job succeeded",
      );
      return finalJob;
    } catch (error) {
      const failed = createFailedJobRecord(running, error, startedAt);

      await this.#store.update(failed);

      if (failed.status === "queued") {
        this.#warn(
          { job: safeJobInfo(failed), nextRunAt: failed.timestamps.runAt },
          "job scheduled for retry",
        );
      } else {
        this.#error({ job: safeJobInfo(failed) }, "job moved to dead letter");
      }

      throw new JobError("Job execution failed", {
        code: "JOB_EXECUTE_FAILED",
        details: { id: running.id, name: running.name, status: failed.status },
        cause: error,
      });
    }
  }

  async drain(options: {
    readonly queue?: JobQueueName;
    readonly names?: JobName[];
    readonly limit?: number;
    readonly signal?: AbortSignal;
  } = {}): Promise<JobRecord[]> {
    const processed: JobRecord[] = [];
    const limit = normalizeOptionalPositiveInteger(options.limit, "limit");

    while (limit === undefined || processed.length < limit) {
      const job = await this.processNext({
        queue: options.queue,
        names: options.names,
        signal: options.signal,
      });

      if (job === undefined) {
        break;
      }

      processed.push(job);
    }

    return processed;
  }

  worker(options: JobWorkerOptions = {}): JobWorker {
    return new RootwareJobWorker(this, {
      queue: options.queue ?? this.#queue,
      names: options.names,
      intervalMs: options.intervalMs,
      concurrency: options.concurrency,
      stopOnError: options.stopOnError,
      signal: options.signal,
      logger: this.#logger,
    });
  }

  list(options?: JobListOptions): Promise<JobListResult> {
    return this.#store.list(options);
  }

  close(): Promise<void> {
    return this.#store.close?.() ?? Promise.resolve();
  }

  #getDefinition(name: JobName): JobDefinition {
    const normalizedName = normalizeJobName(name);
    const definition = this.#registry.get(normalizedName);

    if (definition === undefined) {
      throw new JobError("Unknown job", {
        code: "JOB_UNKNOWN",
        details: { name: normalizedName },
      });
    }

    return definition;
  }

  #debug(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.debug(record, message);
    } catch {
      // Logging must never break job operations.
    }
  }

  #info(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.info(record, message);
    } catch {
      // Logging must never break job operations.
    }
  }

  #warn(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.warn(record, message);
    } catch {
      // Logging must never break job operations.
    }
  }

  #error(record: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.error(record, message);
    } catch {
      // Logging must never break job operations.
    }
  }
}

class RootwareJobWorker implements JobWorker {
  readonly #queue: JobQueue;
  readonly #options:
    & Required<
      Pick<JobWorkerOptions, "intervalMs" | "concurrency" | "stopOnError">
    >
    & Omit<JobWorkerOptions, "intervalMs" | "concurrency" | "stopOnError">
    & {
      readonly logger?: Logger;
    };
  readonly #active = new Set<Promise<unknown>>();
  #timer?: ReturnType<typeof setInterval>;
  #running = false;

  constructor(
    queue: JobQueue,
    options: JobWorkerOptions & {
      readonly logger?: Logger;
    },
  ) {
    this.#queue = queue;
    this.#options = {
      ...options,
      intervalMs: normalizeOptionalPositiveInteger(
        options.intervalMs,
        "intervalMs",
      ) ?? DEFAULT_WORKER_INTERVAL_MS,
      concurrency: normalizeOptionalPositiveInteger(
        options.concurrency,
        "concurrency",
      ) ?? DEFAULT_WORKER_CONCURRENCY,
      stopOnError: options.stopOnError ?? false,
    };
  }

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    if (this.#running) {
      throw new JobError("Job worker is already started", {
        code: "JOB_WORKER_ALREADY_STARTED",
      });
    }

    this.#running = true;
    this.#info(
      {
        queue: this.#options.queue,
        concurrency: this.#options.concurrency,
      },
      "job worker started",
    );
    this.#timer = setInterval(() => {
      const tick = this.tick().catch(async (error) => {
        this.#error(
          { error: serializeJobError(error) },
          "job worker tick failed",
        );

        if (this.#options.stopOnError) {
          await this.stopIfRunning(false);
        }
      });

      this.#active.add(tick);
      tick.finally(() => this.#active.delete(tick));
    }, this.#options.intervalMs);
  }

  async stop(): Promise<void> {
    if (!this.#running) {
      throw new JobError("Job worker is not started", {
        code: "JOB_WORKER_NOT_STARTED",
      });
    }

    await this.stopIfRunning(true);
  }

  async tick(): Promise<JobRecord[]> {
    if (this.#options.signal?.aborted) {
      return [];
    }

    const tasks: Array<Promise<JobRecord | undefined>> = [];

    for (let index = 0; index < this.#options.concurrency; index += 1) {
      tasks.push(this.#queue.processNext({
        queue: this.#options.queue,
        names: this.#options.names,
        signal: this.#options.signal,
      }));
    }

    const processed: JobRecord[] = [];

    for (const task of tasks) {
      try {
        const job = await task;

        if (job !== undefined) {
          processed.push(job);
        }
      } catch (error) {
        this.#error({ error: serializeJobError(error) }, "job worker error");

        if (this.#options.stopOnError) {
          await this.stopIfRunning(false);
          throw error;
        }
      }
    }

    return processed;
  }

  private async stopIfRunning(waitForActive: boolean): Promise<void> {
    if (!this.#running) {
      return;
    }

    this.#running = false;

    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }

    if (waitForActive) {
      await Promise.allSettled([...this.#active]);
    }

    this.#info({ queue: this.#options.queue }, "job worker stopped");
  }

  #info(record: Record<string, unknown>, message: string): void {
    try {
      this.#options.logger?.info(record, message);
    } catch {
      // Logging must never break workers.
    }
  }

  #error(record: Record<string, unknown>, message: string): void {
    try {
      this.#options.logger?.error(record, message);
    } catch {
      // Logging must never break workers.
    }
  }
}

function noopWorker(): JobWorker {
  let running = false;

  return {
    get running(): boolean {
      return running;
    },

    start(): void {
      if (running) {
        throw new JobError("Job worker is already started", {
          code: "JOB_WORKER_ALREADY_STARTED",
        });
      }

      running = true;
    },

    stop(): Promise<void> {
      running = false;
      return Promise.resolve();
    },

    tick(): Promise<JobRecord[]> {
      return Promise.resolve([]);
    },
  };
}

function createFailedJobRecord(
  job: JobRecord,
  error: unknown,
  startedAt: Date,
): JobRecord {
  const finishedAt = new Date();
  const errorInfo = serializeJobError(error);
  const attempt = createJobAttempt({
    attempt: job.attempts,
    startedAt,
    finishedAt,
    error,
  });
  const shouldRetry = job.attempts < job.maxAttempts;
  const runAt = shouldRetry
    ? calculateNextRunAt(job, { now: finishedAt })
    : job.timestamps.runAt;

  return {
    ...job,
    status: shouldRetry ? "queued" : "dead",
    error: errorInfo,
    attemptHistory: [...job.attemptHistory, attempt],
    timestamps: {
      ...job.timestamps,
      updatedAt: finishedAt.toISOString(),
      runAt,
      ...(shouldRetry ? {} : { finishedAt: finishedAt.toISOString() }),
    },
  };
}

function updateJob(
  job: JobRecord,
  options: {
    readonly status: JobStatus;
    readonly error?: unknown;
    readonly finishedAt?: Date | string | number;
  },
): JobRecord {
  const now = new Date();
  const finishedAt = options.finishedAt === undefined
    ? undefined
    : toDate(options.finishedAt).toISOString();

  return stripUndefinedJobFields({
    ...job,
    status: options.status,
    ...(options.error === undefined
      ? {}
      : { error: serializeJobError(options.error) }),
    timestamps: {
      ...job.timestamps,
      updatedAt: now.toISOString(),
      ...(finishedAt === undefined ? {} : { finishedAt }),
    },
  });
}

function normalizeJobRecord(job: JobRecord): JobRecord {
  return stripUndefinedJobFields({
    id: normalizeJobId(job.id),
    queue: normalizeQueueName(job.queue),
    name: normalizeJobName(job.name),
    status: normalizeJobStatus(job.status),
    priority: normalizePriority(job.priority),
    payload: job.payload,
    ...(job.output === undefined ? {} : { output: job.output }),
    metadata: cloneMetadata(job.metadata),
    attempts: normalizeNonNegativeInteger(job.attempts, "attempts"),
    maxAttempts: normalizePositiveInteger(job.maxAttempts, "maxAttempts"),
    backoffMs: normalizeNonNegativeInteger(job.backoffMs, "backoffMs"),
    maxBackoffMs: normalizeNonNegativeInteger(job.maxBackoffMs, "maxBackoffMs"),
    backoffStrategy: normalizeBackoffStrategy(job.backoffStrategy),
    timestamps: {
      createdAt: toDate(job.timestamps.createdAt).toISOString(),
      updatedAt: toDate(job.timestamps.updatedAt).toISOString(),
      runAt: toDate(job.timestamps.runAt).toISOString(),
      ...(job.timestamps.startedAt === undefined ? {} : {
        startedAt: toDate(job.timestamps.startedAt).toISOString(),
      }),
      ...(job.timestamps.finishedAt === undefined ? {} : {
        finishedAt: toDate(job.timestamps.finishedAt).toISOString(),
      }),
    },
    attemptHistory: job.attemptHistory.map((attempt) => ({
      attempt: normalizePositiveInteger(attempt.attempt, "attempt"),
      startedAt: toDate(attempt.startedAt).toISOString(),
      ...(attempt.finishedAt === undefined ? {} : {
        finishedAt: toDate(attempt.finishedAt).toISOString(),
      }),
      ...(attempt.error === undefined ? {} : { error: { ...attempt.error } }),
    })),
    ...(job.error === undefined ? {} : { error: { ...job.error } }),
    ...(job.idempotencyKey === undefined ? {} : {
      idempotencyKey: normalizeIdempotencyKey(job.idempotencyKey),
    }),
  });
}

function cloneJobRecord<TPayload = JobPayload, TOutput = JobOutput>(
  job: JobRecord<TPayload, TOutput>,
  useStructuredClone: boolean,
): JobRecord<TPayload, TOutput> {
  if (useStructuredClone) {
    try {
      if (typeof globalThis.structuredClone === "function") {
        return globalThis.structuredClone(job);
      }
    } catch {
      // Fall through to a safe shallow clone.
    }
  }

  return {
    ...job,
    metadata: { ...job.metadata },
    timestamps: { ...job.timestamps },
    attemptHistory: job.attemptHistory.map((attempt) => ({
      ...attempt,
      ...(attempt.error === undefined ? {} : { error: { ...attempt.error } }),
    })),
    ...(job.error === undefined ? {} : { error: { ...job.error } }),
  };
}

function stripUndefinedJobFields<TPayload, TOutput>(
  job: JobRecord<TPayload, TOutput>,
): JobRecord<TPayload, TOutput> {
  const timestamps: JobTimestamps = {
    createdAt: job.timestamps.createdAt,
    updatedAt: job.timestamps.updatedAt,
    runAt: job.timestamps.runAt,
    ...(job.timestamps.startedAt === undefined ? {} : {
      startedAt: job.timestamps.startedAt,
    }),
    ...(job.timestamps.finishedAt === undefined ? {} : {
      finishedAt: job.timestamps.finishedAt,
    }),
  };

  return {
    id: job.id,
    queue: job.queue,
    name: job.name,
    status: job.status,
    priority: job.priority,
    payload: job.payload,
    ...(job.output === undefined ? {} : { output: job.output }),
    metadata: job.metadata,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    backoffMs: job.backoffMs,
    maxBackoffMs: job.maxBackoffMs,
    backoffStrategy: job.backoffStrategy,
    timestamps,
    attemptHistory: job.attemptHistory,
    ...(job.error === undefined ? {} : { error: job.error }),
    ...(job.idempotencyKey === undefined ? {} : {
      idempotencyKey: job.idempotencyKey,
    }),
  };
}

function mergeRetryOptions(
  defaults: RetryOptions | undefined,
  overrides: RetryOptions,
): Required<RetryOptions> {
  return normalizeRetryOptions({
    attempts: overrides.attempts ?? defaults?.attempts,
    backoffMs: overrides.backoffMs ?? defaults?.backoffMs,
    maxBackoffMs: overrides.maxBackoffMs ?? defaults?.maxBackoffMs,
    backoffStrategy: overrides.backoffStrategy ?? defaults?.backoffStrategy,
  });
}

function normalizeRetryOptions(
  options: RetryOptions = {},
): Required<RetryOptions> {
  const attempts = normalizePositiveInteger(
    options.attempts ?? DEFAULT_ATTEMPTS,
    "attempts",
  );
  const backoffMs = normalizeNonNegativeInteger(
    options.backoffMs ?? DEFAULT_BACKOFF_MS,
    "backoffMs",
  );
  const maxBackoffMs = normalizeNonNegativeInteger(
    options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
    "maxBackoffMs",
  );

  if (maxBackoffMs < backoffMs) {
    throw new JobError(
      "maxBackoffMs must be greater than or equal to backoffMs",
      {
        code: "JOB_INVALID",
        details: { backoffMs, maxBackoffMs },
      },
    );
  }

  return {
    attempts,
    backoffMs,
    maxBackoffMs,
    backoffStrategy: normalizeBackoffStrategy(
      options.backoffStrategy ?? DEFAULT_BACKOFF_STRATEGY,
    ),
  };
}

function resolveRunAt(
  options: EnqueueOptions,
  now: Date,
): string {
  if (options.runAt !== undefined) {
    return toDate(options.runAt).toISOString();
  }

  const delayMs =
    normalizeOptionalNonNegativeInteger(options.delayMs, "delayMs") ??
      0;
  return new Date(now.getTime() + delayMs).toISOString();
}

function normalizeBackoffStrategy(strategy: BackoffStrategy): BackoffStrategy {
  if (
    strategy !== "fixed" && strategy !== "linear" &&
    strategy !== "exponential"
  ) {
    throw new JobError("Invalid backoff strategy", {
      code: "JOB_INVALID",
      details: { strategy },
    });
  }

  return strategy;
}

function normalizePriority(priority: JobPriority): JobPriority {
  if (
    priority !== "low" && priority !== "normal" && priority !== "high" &&
    priority !== "critical"
  ) {
    throw new JobError("Invalid job priority", {
      code: "JOB_INVALID",
      details: { priority },
    });
  }

  return priority;
}

function normalizeJobStatus(status: JobStatus): JobStatus {
  if (
    status !== "queued" && status !== "running" && status !== "succeeded" &&
    status !== "failed" && status !== "dead" && status !== "canceled"
  ) {
    throw new JobError("Invalid job status", {
      code: "JOB_INVALID",
      details: { status },
    });
  }

  return status;
}

function normalizeName(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new JobError(`${label} must be a string`, {
      code: "JOB_INVALID",
    });
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    hasControlCharacter(normalized) ||
    !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    throw new JobError(`${label} is invalid`, {
      code: "JOB_INVALID",
      details: { value: normalized },
    });
  }

  return normalized;
}

function normalizeJobId(id: string): JobId {
  if (typeof id !== "string") {
    throw new JobError("Job id must be a string", {
      code: "JOB_INVALID",
    });
  }

  const normalized = id.trim();

  if (
    normalized.length === 0 ||
    hasControlCharacter(normalized) ||
    !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    throw new JobError("Job id is invalid", {
      code: "JOB_INVALID",
    });
  }

  return normalized;
}

function normalizeIdempotencyKey(key: string): string {
  if (
    typeof key !== "string" || key.trim().length === 0 ||
    hasControlCharacter(key)
  ) {
    throw new JobError("Idempotency key is invalid", {
      code: "JOB_INVALID",
    });
  }

  return key.trim();
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new JobError(`${field} must be greater than zero`, {
      code: "JOB_INVALID",
      details: { field },
    });
  }

  return Math.floor(value);
}

function normalizeNonNegativeInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new JobError(`${field} must be zero or greater`, {
      code: "JOB_INVALID",
      details: { field },
    });
  }

  return Math.floor(value);
}

function normalizeOptionalPositiveInteger(
  value: number | undefined,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizePositiveInteger(value, field);
}

function normalizeOptionalNonNegativeInteger(
  value: number | undefined,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeNonNegativeInteger(value, field);
}

function cloneMetadata(metadata: JobMetadata): JobMetadata {
  if (!isRecord(metadata) || Array.isArray(metadata)) {
    throw new JobError("Job metadata must be an object", {
      code: "JOB_INVALID",
    });
  }

  return { ...metadata };
}

function compareJobsForClaim(a: JobRecord, b: JobRecord): number {
  const priority = priorityRank(b.priority) - priorityRank(a.priority);

  if (priority !== 0) {
    return priority;
  }

  const runAt = toDate(a.timestamps.runAt).getTime() -
    toDate(b.timestamps.runAt).getTime();

  if (runAt !== 0) {
    return runAt;
  }

  return compareJobsByCreatedAt(a, b);
}

function compareJobsByCreatedAt(a: JobRecord, b: JobRecord): number {
  const createdAt = toDate(a.timestamps.createdAt).getTime() -
    toDate(b.timestamps.createdAt).getTime();

  if (createdAt !== 0) {
    return createdAt;
  }

  return a.id.localeCompare(b.id);
}

function priorityRank(priority: JobPriority): number {
  if (priority === "critical") {
    return 4;
  }

  if (priority === "high") {
    return 3;
  }

  if (priority === "normal") {
    return 2;
  }

  return 1;
}

function evictOverflowJobs(
  jobs: Map<JobId, JobRecord>,
  maxJobs: number | undefined,
): void {
  if (maxJobs === undefined || jobs.size <= maxJobs) {
    return;
  }

  const terminal = [...jobs.values()]
    .filter((job) => isTerminalJobStatus(job.status))
    .sort(compareJobsByCreatedAt);

  for (const job of terminal) {
    if (jobs.size <= maxJobs) {
      return;
    }

    jobs.delete(job.id);
  }

  const remaining = [...jobs.values()].sort(compareJobsByCreatedAt);

  for (const job of remaining) {
    if (jobs.size <= maxJobs) {
      return;
    }

    jobs.delete(job.id);
  }
}

function createRandomHexId(crypto: Crypto): string {
  if (typeof crypto.getRandomValues !== "function") {
    throw new JobError("Secure random generation is unavailable", {
      code: "JOB_INVALID",
      severity: "fatal",
    });
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toDate(value: Date | string | number): Date {
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new JobError("Invalid date", {
      code: "JOB_INVALID",
    });
  }

  return date;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

function safeName(name: unknown): string | undefined {
  return typeof name === "string" ? name : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toJobError(
  error: unknown,
  code: JobErrorCode,
  details: Record<string, unknown>,
): JobError {
  if (error instanceof JobError) {
    return error;
  }

  return new JobError("Job operation failed", {
    code,
    details,
    cause: error,
  });
}

// Examples:
//
// const sendWelcomeEmail = defineJob({
//   name: "sendWelcomeEmail",
//   async run(input: { userId: string }, ctx) {
//     ctx.logger?.info({ userId: input.userId }, "sending welcome email");
//     return { sent: true };
//   },
// });
//
// const queue = createJobQueue({
//   jobs: [sendWelcomeEmail],
//   store: memoryJobStore(),
// });
//
// await queue.enqueue("sendWelcomeEmail", {
//   userId: "u_123",
// });
//
// await queue.processNext();
//
// await queue.enqueue("sendWelcomeEmail", {
//   userId: "u_123",
// }, {
//   attempts: 3,
//   backoffMs: 1_000,
// });
//
// await queue.enqueue("sendWelcomeEmail", {
//   userId: "u_123",
// }, {
//   delayMs: 60_000,
// });
//
// const worker = queue.worker({
//   intervalMs: 1_000,
//   concurrency: 2,
// });
// worker.start();
// await worker.stop();
//
// const disabledQueue = noopJobQueue();
