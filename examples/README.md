# Rootware Examples

Runnable examples for the local workspace APIs. Each script imports packages by
their public `@rootware/*` names and uses in-memory or fake adapters, so the
examples do not require external services.

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
```

Coverage by script:

- `foundation.ts`: `@rootware/errors`, `@rootware/env`, `@rootware/log`,
  `@rootware/log/compat/pino`, and `@rootware/testing`.
- `data.ts`: `@rootware/schema`, `@rootware/orm`, and `@rootware/migrate`.
- `web_state_async.ts`: `@rootware/http`, `@rootware/cache`,
  `@rootware/storage`, `@rootware/session`, and `@rootware/jobs`.
- `postgres_adapters.ts`: `@rootware/orm/postgres` and
  `@rootware/migrate/postgres` with fake PostgreSQL clients/executors.
