/**
 * Public entrypoint for @rootware/jobs.
 *
 * TODO: Implement job queues, workers, retries, schedules, and dead-letter handling.
 */

export type JobId = string;
export type JobName = string;
export type JobPayload = Record<string, unknown>;

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface Job<TPayload extends JobPayload = JobPayload> {
  readonly id: JobId;
  readonly name: JobName;
  readonly payload: TPayload;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly createdAt: Date;
}

export interface JobEnqueueOptions {
  readonly delayMs?: number;
  readonly priority?: number;
  readonly maxAttempts?: number;
}

export interface JobContext<TPayload extends JobPayload = JobPayload> {
  readonly job: Job<TPayload>;
  readonly signal?: AbortSignal;
}

export type JobHandler<TPayload extends JobPayload = JobPayload> = (
  context: JobContext<TPayload>,
) => void | Promise<void>;

export interface JobQueue {
  enqueue<TPayload extends JobPayload = JobPayload>(
    name: JobName,
    payload: TPayload,
    options?: JobEnqueueOptions,
  ): Promise<Job<TPayload>>;
  cancel(id: JobId): Promise<boolean>;
  get(id: JobId): Promise<Job | null>;
}

export interface JobWorkerOptions {
  readonly concurrency?: number;
  readonly queues?: readonly string[];
}

export interface JobWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface JobSchedule {
  readonly name: JobName;
  readonly cron: string;
  readonly payload?: JobPayload;
}

export class RootwareJobs implements JobQueue {
  enqueue<TPayload extends JobPayload = JobPayload>(
    _name: JobName,
    _payload: TPayload,
    _options?: JobEnqueueOptions,
  ): Promise<Job<TPayload>> {
    throw new Error("Not implemented");
  }

  cancel(_id: JobId): Promise<boolean> {
    throw new Error("Not implemented");
  }

  get(_id: JobId): Promise<Job | null> {
    throw new Error("Not implemented");
  }

  process<TPayload extends JobPayload = JobPayload>(
    _name: JobName,
    _handler: JobHandler<TPayload>,
    _options?: JobWorkerOptions,
  ): JobWorker {
    throw new Error("Not implemented");
  }

  schedule(_schedule: JobSchedule): Promise<void> {
    throw new Error("Not implemented");
  }
}

export function createJobs(): RootwareJobs {
  throw new Error("Not implemented");
}
