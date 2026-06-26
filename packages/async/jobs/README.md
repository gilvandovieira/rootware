# @rootware/jobs

Background job queue primitives for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { createJobQueue, defineJob, memoryJobStore } from "jsr:@rootware/jobs";
```

## Example

```ts
const sendWelcomeEmail = defineJob({
  name: "sendWelcomeEmail",
  async run(input: { userId: string }, ctx) {
    ctx.logger?.info({ userId: input.userId }, "sending welcome email");
    return { sent: true };
  },
});

const queue = createJobQueue({
  jobs: [sendWelcomeEmail],
  store: memoryJobStore(),
});

await queue.enqueue("sendWelcomeEmail", { userId: "u_123" });
await queue.processNext();
```

## API

- `defineJob`
- `defineJobs`
- `createJobQueue`
- `memoryJobStore`
- `noopJobStore`
- `noopJobQueue`
- `createJobRecord`
- `calculateBackoffMs` (opt-in `jitter`)
- `queue.deadLetter()` — inspect dead-lettered jobs
- Recurrence — `RecurrenceRule`, `nextRecurrenceAt`, `parseCronExpression`,
  `cronMatches`, `nextCronRun`
- Durable adapters (`0.4`) — `DurableJobStore`, `JobClaimOptions`,
  `jobsTableDdl`, `JOB_TABLE_COLUMNS`, `DEFAULT_JOBS_TABLE`

## Recurring scheduling (`0.3`)

Recurrence is exposed as pure UTC primitives, so the next run is computed
deterministically and the app re-enqueues with `runAt`:

```ts
import { nextRecurrenceAt } from "jsr:@rootware/jobs";

// Interval or 5-field cron (minute hour day-of-month month day-of-week, UTC):
const at = nextRecurrenceAt({ kind: "cron", expression: "0 3 * * 1-5" });
await queue.enqueue("nightly-report", payload, { runAt: at });
// After each run completes, schedule the next occurrence the same way.
```

`parseCronExpression` supports `*`, lists (`a,b`), ranges (`a-b`), and steps
(`*/n`). Cron is evaluated in **UTC**.

### Idempotency, backoff, and dead-letter

- **Idempotency** — pass `enqueue(..., { idempotencyKey })`; the store dedupes
  via `findByIdempotencyKey`, so a retried enqueue returns the existing job
  instead of creating a duplicate.
- **Backoff** — `fixed` / `linear` / `exponential`, capped by `maxBackoffMs`,
  with opt-in full `jitter` (`calculateBackoffMs(attempt, { jitter: true })`).
- **Dead-letter** — exhausted jobs become status `"dead"`; inspect them with
  `queue.deadLetter()` and requeue with `queue.retry(id)`.

## Durable adapters (`0.4`)

The in-memory store is single-process. A durable, multi-worker queue implements
`DurableJobStore` — the contract that makes delivery **at-least-once** across
crashes:

- **Atomic claim with a lease** — `claimNext({ workerId, leaseMs })` marks one
  due job `running` in a transaction (Postgres `... FOR UPDATE SKIP LOCKED`;
  SQLite under its single-writer lock) and stamps `lease_expires_at`.
- **Heartbeats** — a long handler calls `heartbeat(id, leaseMs)`; it returns
  `false` if the lease was already reclaimed, so the worker can abort.
- **Crash recovery** — `reclaimExpired()` returns expired-lease `running` jobs
  to `queued` for another worker.

Because delivery is at-least-once, handlers should be idempotent — pair with
`enqueue(..., { idempotencyKey })`.

The table requirements ship as pure DDL so the app wires them into
`@rootware/migrate` itself (jobs never imports migrate):

```ts
import { jobsTableDdl } from "jsr:@rootware/jobs";

const { statements } = jobsTableDdl({ dialect: "postgres" }); // or "sqlite"
// feed `statements` (CREATE TABLE + claim/lease/idempotency indexes) to migrate
```

## Security

Jobs never log payloads, outputs, or full metadata by default. Memory storage is
only for tests and local development.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package ships the in-memory store and the **durable adapter contract**
(`DurableJobStore`) plus its table DDL (`0.4`); the concrete Postgres/SQLite
queue implementations, Redis/Deno KV adapters, dashboards, and OpenTelemetry are
still future work.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
