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
- `calculateBackoffMs`

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
