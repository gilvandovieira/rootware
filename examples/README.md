# Rootware Examples

Runnable examples for the local workspace APIs. Each script imports packages by
their public `@rootware/*` names and uses in-memory, fake, or local disposable
adapters, so the examples do not require external services.

Run all examples:

```sh
deno task examples
```

Run one example:

```sh
deno run examples/foundation.ts
deno run examples/data.ts
deno run examples/web_state_async.ts
deno run examples/postgres_adapters.ts
deno task examples:todo-api
deno task examples:todo-api:serve
```

The Todo API example uses a local SQLite database through `@db/sqlite`, so it
needs Deno env/read/write/FFI permissions. A cold Deno cache may also need
network access to GitHub release asset hosts for the SQLite native library. The
serve task also needs network permission.

Coverage by script:

- `foundation.ts`: `@rootware/errors`, `@rootware/env`, `@rootware/log`,
  `@rootware/log/compat/pino`, and `@rootware/testing`.
- `data.ts`: `@rootware/schema`, `@rootware/orm`, and `@rootware/migrate`.
- `web_state_async.ts`: `@rootware/http`, `@rootware/cache`,
  `@rootware/storage`, `@rootware/session`, and `@rootware/jobs`.
- `postgres_adapters.ts`: `@rootware/orm/postgres` and
  `@rootware/migrate/postgres` with fake PostgreSQL clients/executors.
- `todo_api.ts`: Hono via JSR plus `@rootware/errors`, `@rootware/env`,
  `@rootware/log`, `@rootware/log/http`, `@rootware/testing`,
  `@rootware/schema`, `@rootware/orm`, `@rootware/orm/sqlite`,
  `@rootware/migrate`, `@rootware/http`, `@rootware/cache`, and
  `@rootware/session`.

`@rootware/storage` and `@rootware/jobs` are covered by `web_state_async.ts`.

## The errors + env + log + http slice

`todo_api.ts` is the reference wiring of the **errors + env + log + http**
coherence slice with request ids flowing boundary→handler. It injects one
`x-request-id` at the edge, logs the request boundary with `withRequestLogging`
from `@rootware/log/http` (which echoes the id onto the response), and binds a
`logger.child({ requestId })` that the route handlers and `app.onError` log
through. A single request id therefore appears on the response header and in
**both** the boundary record and the in-request logs — the in-process test
asserts exactly that.

What it proves: structured `@rootware/errors`, env-driven config from
`@rootware/env`, request-scoped logging from `@rootware/log` +
`@rootware/log/http`, and the `@rootware/http` client compose end-to-end — using
only shipped exports, with request-scoped context kept example-local (no
kernel/adapter package).
