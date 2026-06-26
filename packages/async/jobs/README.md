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

## Security

Jobs never log payloads, outputs, or full metadata by default. Memory storage is
only for tests and local development.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package does not implement distributed workers, Redis, Deno KV, SQL queue
adapters, cron parsing, dashboards, or OpenTelemetry yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
