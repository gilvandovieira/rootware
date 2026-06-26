# @rootware/jobs Product Plan

## Status

`@rootware/jobs` exists as part of the Rootware `v0.1` foundation.

This package should become the background work abstraction for Rootware apps,
but it should come after the foundation and data packages are stable.

> **Current `v0.1` surface (reconciled with source).** The memory job spine
> already ships: `defineJob`/`defineJobs`, `createJobQueue`, `memoryJobStore`,
> the `JobWorker`/`JobRegistry`/`JobStore`/`JobQueue` contracts, retry with
> backoff strategies, delayed/scheduled enqueue via `delayMs` / `runAt`,
> `idempotencyKey` lookup, priority/runAt sorting for claims, terminal `dead`
> state, `createJobId`, and `noopJobStore`/`noopJobQueue`. It imports only
> `@rootware/errors` and `@rootware/log` — `@rootware/cache` and `@rootware/orm`
> are **not yet wired**, which is correct: cache coordination and durable
> (Postgres) adapters are the real forward work, not the memory spine. Update
> the v0.2 chunks to verify-and-test the existing memory queue rather than build
> it again.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/jobs` is a JSR-native, Deno-first background job package.

It exists because apps need retries, scheduled work, durable queues,
idempotency, dead-letter handling, and testable job execution without committing
application code to one queue provider.

The package should provide:

- Job definition API.
- Typed payloads.
- Memory adapter for tests/dev.
- Retry policy.
- Dead-letter model.
- Idempotency key conventions.
- Worker runner.
- Scheduled job model.
- Future adapters for Postgres, SQLite, Deno KV where supported, Redis, and
  provider queues.

One-line strategy:

> `@rootware/jobs` gives Deno apps a stable background work contract that can
> start in memory and graduate to durable adapters.

## Canonical package

```ts
jsr:@rootware/jobs
```

Expected imports:

```ts
import { createJobQueue, defineJob } from "@rootware/jobs";
```

Expected usage:

```ts
const sendWelcomeEmail = defineJob<{ userId: string }>({
  name: "sendWelcomeEmail",
  async run(input, ctx) {
    ctx.logger?.info({ userId: input.userId }, "welcome email requested");
  },
});

const queue = createJobQueue({ jobs: [sendWelcomeEmail] });
await queue.enqueue("sendWelcomeEmail", { userId: "u_123" });
```

## Rootware workspace fit

This package sits after:

- `@rootware/errors`
- `@rootware/env`
- `@rootware/log`

Durable persistence and cache coordination are **adapter** concerns (see below),
so `@rootware/cache` and `@rootware/orm` are deliberately _not_ jobs-core
dependencies. In `v0.1`, `packages/jobs/mod.ts` imports only `@rootware/errors`
and `@rootware/log`.

### Runtime imports

- `@rootware/errors` — `JobError` (value import).
- `@rootware/log` — **type-only** (job lifecycle `Logger`).

### Example / dev-only imports

- `@rootware/env` — examples only; not imported by the package.

### Adapter-only dependencies (not jobs-core)

- `@rootware/cache` — coordination/dedup helpers belong in a cache-backed
  adapter, not in jobs-core.
- `@rootware/orm` / database drivers — durable queue persistence belongs in a
  durable adapter package (e.g. a Postgres job store), never in jobs-core.

### Disallowed dependencies

- Provider queues in the core.
- Mail/billing/webhooks in the core.
- Framework adapters in the core.
- `@rootware/cache` or `@rootware/orm` as jobs-**core** dependencies.
- Testing in runtime code.

## Responsibilities

This package owns:

- Job contract.
- Queue adapter contract.
- Worker loop.
- Retry policy.
- Job status.
- Dead-letter model.
- Scheduling contract.
- Idempotency conventions.

This package does not own:

- Email sending.
- Webhook verification.
- Billing logic.
- Media processing implementation.
- External queue provider SDKs in the core.
- Cron platform configuration.

## Architecture

```txt
job definition -> enqueue -> queue adapter -> worker -> retry/dead-letter -> logs/metrics
```

### 1. Job definition

Typed job names and payloads.

### 2. Queue adapter

Memory first, durable later.

### 3. Worker runner

Controls concurrency, retry, cancellation, and shutdown.

### 4. Scheduling boundary

Scheduled jobs should be a contract, not a platform lock-in.

## Public contracts

### Job

```ts
export interface JobDefinition<TInput> {
  readonly name: string;
  run(input: TInput, context: JobContext): Promise<void>;
}
```

### Queue

```ts
export interface JobQueue {
  enqueue<TInput>(
    job: JobDefinition<TInput>,
    input: TInput,
    options?: EnqueueOptions,
  ): Promise<JobHandle>;
  next(options?: NextJobOptions): Promise<QueuedJob | undefined>;
}
```

### Worker

```ts
export interface JobWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

## Security and safety model

Rules:

- Job payloads may contain sensitive data; logs must redact by default.
- Retried jobs must be idempotency-aware.
- Dead-letter queues must preserve enough data for diagnosis without leaking
  secrets in logs.
- Memory queues are not durable.
- Durable adapters must document transaction behavior.

## Runtime targets

Primary:

- Deno local.
- Deno server/VPS.
- JSR consumers.

Later:

- Deno Deploy depending on current platform capabilities.
- Edge/serverless through provider-specific adapters.

## Non-goals before v1

- Provider-specific queue SDKs in the core.
- Distributed scheduling guarantee.
- Workflow engine.
- DAG orchestration.
- Exactly-once execution claims.
- UI dashboard.

## Release roadmap

## v0.1.x — Foundation cleanup

### Chunk 1 — Audit current package

Confirm current stubs and public API intent.

### Chunk 2 — Define job vocabulary

Standardize job, queue, worker, attempt, dead-letter, idempotency.

### Chunk 3 — README skeleton

Show memory queue and worker example.

## v0.2.0 — Memory queue spine

> **These already ship in `v0.1`.** Read the chunks below as verify, add tests,
> and document the existing implementation — not build from scratch, and do not
> replace the shipped code. All chunks 4–9 already ship (defineJob, JobQueue,
> memory queue, worker via `queue.worker()`, retries/backoff, JobError); Chunk
> 10 (tests) remains. The real new work is durable adapters (v0.4+).

### Chunk 4 — Verify job contract (ships in v0.1)

Verify the shipped `defineJob` behavior.

### Chunk 5 — Verify queue adapter (ships in v0.1)

Verify the shipped `JobQueue` contract.

### Chunk 6 — Verify memory queue (ships in v0.1)

Development/test only.

### Chunk 7 — Verify worker (ships in v0.1)

Single-process worker loop with graceful stop.

### Chunk 8 — Verify retries (ships in v0.1)

Attempt count, delay, backoff.

### Chunk 9 — Verify JobError (ships in v0.1)

Use `RootwareError`.

### Chunk 10 — Add tests

Enqueue, run, retry, failure, dead-letter, shutdown.

## v0.3.0 — Recurring scheduling and idempotency hardening

- Recurring jobs / cron-like scheduling.
- Durable idempotency semantics.
- Retry backoff policy hardening.
- Dead-letter inspection API.
- Worker lifecycle tests.

## v0.4.0 — Durable adapter design

- Postgres adapter design.
- SQLite adapter design.
- Transaction behavior docs.
- Migration requirements.

## v0.5.0 — Postgres durable queue

- Durable job table.
- Locking strategy.
- Retry persistence.
- Dead-letter persistence.
- Visibility timeout semantics.

## v0.6.0 — Integration packages

- Mail jobs.
- Webhook jobs.
- Media processing jobs.
- Doomscrollr thumbnail job.

## v1.0.0 — Stable background work contract

- Freeze job definition API.
- Freeze queue adapter API.
- Freeze retry/dead-letter semantics.

## Cross-package integrations

### @rootware/log

Job lifecycle logs: enqueued, started, succeeded, failed, retried,
dead-lettered.

### @rootware/errors

`JobError extends RootwareError`.

### @rootware/cache (adapter, not jobs-core)

A cache-backed coordination/dedup helper lives in an adapter, not in jobs-core.
Use it for at-most-once-ish coordination, never as durable storage. Jobs-core
never imports `@rootware/cache`.

### @rootware/orm and @rootware/migrate (adapter, not jobs-core)

Durable queue adapters (e.g. a Postgres job store) need database tables and
migrations. That code lives in a separate durable-adapter package that depends
on `@rootware/orm` and `@rootware/migrate`. Jobs-core stays on
`@rootware/errors` + `@rootware/log` and defines the contract those adapters
implement.

## First 10 implementation chunks

The memory job spine already ships in `v0.1`; start with verification, then
scheduling and adapters. Cache coordination and durable persistence are adapter
concerns, not jobs-core dependencies.

1. Audit the published surface (`defineJob`, `defineJobs`, `createJobQueue`,
   `memoryJobStore`, `queue.worker()`, retry/backoff, `JobError`).
2. Verify the `JobDefinition` / `JobQueue` / `JobWorker` / `JobStore` contracts.
3. Verify the memory queue and the single-process worker loop with graceful
   stop.
4. Verify retries, backoff, and dead-letter behavior.
5. Verify `JobError`.
6. Implement recurring jobs / cron-like scheduling and durable idempotency
   semantics (delayed/scheduled one-off jobs and in-memory idempotency already
   ship).
7. Define the durable-adapter contract (Postgres/SQLite) as a separate adapter,
   not a jobs-core dependency.
8. Implement the Postgres durable queue adapter package (v0.5).
9. Add cache-based coordination/dedup via an adapter, keeping jobs-core on
   errors + log.
10. Expand tests and examples.

## Product rule

`@rootware/jobs` must never promise exactly-once execution. Promise clear
contracts, retries, idempotency hooks, and honest durability semantics.
