# Rootware Package Roadmap

## Status

Rootware has a working pre-1.0 foundation for the 12 current packages: `errors`,
`schema`, `env`, `log`, `testing`, `http`, `cache`, `storage`, `session`,
`migrate`, `orm`, and `jobs`. The data packages now also ship explicit
PostgreSQL subpaths: `@rootware/orm/postgres` and `@rootware/migrate/postgres`.
`@rootware/log` also ships `@rootware/log/compat/pino`. Adapter packages and all
other subpaths are still planned work; the repository does **not** currently
contain `@rootware/adapters`, `@rootware/orm/neon`, `@rootware/http/testing`, or
`@rootware/migrate/cli`.

This document does not replace the dedicated package plans. It defines the
sequencing logic for building the workspace as a coherent product.

> Reconciled against source on 2026-06-26. Several packages ship more than a
> bare foundation: `@rootware/log` already has a Pino compatibility subpath;
> `@rootware/orm` already has the `sql` tag, the full predicate set,
> select/insert/update/delete builders with type inference, and a PostgreSQL
> execution subpath; `@rootware/migrate` already has a programmatic up/**down**
> migrator with checksums and a PostgreSQL execution subpath;
> `@rootware/session` already has `requireActor`, a cache-backed store, and
> secure cookie defaults; `@rootware/cache` already has `has()` and `getOrSet()`
> with single-process in-flight de-duplication for concurrent misses. The
> dedicated package `ROADMAP.md` files should describe only real gaps (CLI,
> CSRF, durable adapters, additional subpaths), not re-implementation.

The next architectural milestone is now:

- continued mechanical graph enforcement;
- a package export/subpath policy that avoids dead exports;
- canonical schema snapshots through `@rootware/schema`;
- ORM -> schema -> migrate integration through serializable snapshots;
- one real Postgres vertical slice using the shipped data subpaths, then
  additional adapters after the contracts are stable.

Last reviewed: `2026-06-26`

## Product thesis

Rootware is a JSR-native, Deno-first backend DX workspace.

It is not:

- A web framework.
- A runtime.
- A build system.
- A replacement for Hono, Fresh, Oak, or `Deno.serve()`.

It is the application substrate for real Deno backends:

- Typed errors.
- Typed environment configuration.
- Structured logging.
- Testing helpers.
- Production-safe HTTP client.
- Cache abstraction.
- Storage abstraction.
- Session/auth boundary.
- Database migrations.
- ORM/data access.
- Jobs and background work.
- Thin adapters for frameworks and providers.

One-line strategy:

> Rootware helps Deno developers build production backends without defaulting to
> Node/npm-shaped infrastructure packages.

## Canonical package ladder

The core package order is:

```txt
1. @rootware/errors
2. @rootware/env
3. @rootware/log
4. @rootware/testing
5. @rootware/http
6. @rootware/cache
7. @rootware/storage
8. @rootware/session
9. @rootware/schema   (leaf: snapshot type only; depends on nothing)
10. @rootware/migrate
11. @rootware/orm
12. @rootware/jobs
13. adapters and integrations
```

`@rootware/schema` is a dependency-free leaf (like `@rootware/errors`) that
holds only the `RootwareSchemaSnapshot` type. It is listed near migrate/orm for
readability, but it has no dependencies and could sit anywhere among the leaves.

## Dependency direction

Allowed direction:

Runtime imports (the actual import graph; these are the edges CI enforces):

```txt
errors -> nothing
schema -> nothing
env -> errors
log -> errors
testing -> errors, env, log
http -> errors, log
cache -> errors, log
storage -> errors, log
session -> errors, cache, log
migrate -> errors, log, schema
orm -> errors, log, schema
jobs -> errors, log
jobs adapters -> jobs, cache, orm/migrate, external queue/provider
adapters -> relevant core packages + external provider/framework
```

Notes on the runtime table:

- `env` is **not** a runtime edge of `log`, `http`, `cache`, `storage`,
  `session`, `migrate`, `orm`, or `jobs`. Those packages read configuration only
  in examples and accept already-validated values at runtime. It _is_ a runtime
  import of `@rootware/testing` (which provides `testEnv`). See the example/dev
  table below.
- Several `log` and `cache` edges above are **type-only** in the source (an
  injected `Logger`/`CacheClient`), e.g. `http -> log`, `cache -> log`,
  `storage -> log`, `session -> log`, `session -> cache`, `migrate -> log`,
  `orm -> log`. They are build edges, not value imports, but they still count
  for direction. The per-package docs mark which is which.
- `migrate`/`orm` gain only the `schema` leaf edge; they never import each
  other.

Example / dev-only imports (NOT runtime edges; allowed in examples and tests):

```txt
http    -> env (examples), testing (tests)
cache   -> env (examples), testing (tests)
storage -> env (examples), testing (tests)
session -> env (examples), testing (tests)
migrate -> env (examples), orm (examples only: the app builds the snapshot), testing (tests)
orm     -> env (examples), testing (tests)
jobs    -> env (examples), testing (tests)
log     -> env (examples)
```

`migrate -> orm` appears **only** here, and only at the application layer: the
app calls `orm.createSchemaSnapshot(schema)` and passes the plain result into
migrate config. The `@rootware/migrate` package never imports `@rootware/orm`.

`migrate` and `orm` are intentionally **siblings**, not a chain. Neither imports
the other. They integrate only through the serializable `RootwareSchemaSnapshot`
type owned by the dependency-free `@rootware/schema` leaf (see "Schema snapshot
handoff" below). This matches the current source: `../packages/data/orm/mod.ts`
and `../packages/data/migrate/mod.ts` import `@rootware/schema` in addition to
their `@rootware/errors` / `@rootware/log` edges, and never import each other.

Disallowed direction:

```txt
errors -> anything Rootware
schema -> anything Rootware
env -> log/testing/http/cache/storage/session/migrate/orm/jobs
log -> env (at runtime) or any package above it
production packages -> testing
core packages -> framework/provider adapters
adapters -> each other without explicit justification
migrate -> orm   (package-level; example/app wiring is the only exception)
orm -> migrate
jobs -> cache or orm as jobs-core dependencies (they are adapter-only)
```

## Schema snapshot handoff

`@rootware/orm` and `@rootware/migrate` must not depend on each other. The
integration contract between them is a plain, serializable
`RootwareSchemaSnapshot` (versioned data, no functions or class instances).

Direction of data, not of imports:

```txt
orm  produces  RootwareSchemaSnapshot   (createSchemaSnapshot)
app  passes    the snapshot to migrate  (migrate config takes a prebuilt snapshot)
migrate consumes the snapshot           (diff + SQL generation)
```

The snapshot type is owned by a dedicated **`@rootware/schema`** leaf package.
This is the decided approach (not a menu) — it prevents the type from drifting
between orm and migrate, which is exactly the kind of duplication the `v0.1`
review found:

- **`@rootware/schema`** — dependency-free, owns `RootwareSchemaSnapshot` and
  members.
- **`@rootware/orm`** — imports `@rootware/schema`, _produces_ snapshots via
  `createSchemaSnapshot(schema)`.
- **`@rootware/migrate`** — imports `@rootware/schema`, _consumes_ a prebuilt
  snapshot (validate, store, diff, journal). Its config takes `snapshot`, never
  raw `schema`.

The application is the only place `createSchemaSnapshot` is called; it hands the
plain result to migrate. `migrate` must never call `createSchemaSnapshot` from
inside its own package, and `defineConfig` must not take raw `schema` (ORM table
objects) — both would create the `migrate -> orm` import the table above
forbids.

(The earlier "type lives in orm, migrate takes a prebuilt snapshot" fallback is
explicitly _not_ chosen, to avoid `migrate` depending on `@rootware/orm` for the
type.)

## Enforce the ladder mechanically

The mismatches found during the `v0.1` review (an `orm -> migrate` edge in this
document that never existed in code; per-package roadmaps scheduling features
that already shipped) show that convention-only enforcement is not enough.
`deno task graph` now asserts the dependency direction:

```sh
# fail if any package's mod.ts imports a package above it in the ladder,
# or if any non-test module imports @rootware/testing
deno task graph
```

The repository now has a root `deno.json` workspace, local `@rootware/*`
imports, root `check`/`test`/`lint`/`fmt` tasks, and `scripts/check_graph.ts`
for package boundary enforcement. CI runs the same task set, including
`deno task graph`.

Package export policy:

- Every package has a root `mod.ts` export.
- `@rootware/log/compat/pino`, `@rootware/orm/postgres`, and
  `@rootware/migrate/postgres` are the current implemented subpath exports.
- Do not add new subpath exports until the target files exist and have tests.
- Planned subpaths must remain roadmap/documentation-only until implemented.
- Roadmap validation should check that docs do not describe missing packages or
  subpaths as shipped.

## Milestone 1 — Rootware Core

Packages:

- `@rootware/errors`
- `@rootware/env`
- `@rootware/log`
- `@rootware/testing`

Goal:

Make every future package easier to implement, configure, diagnose, and test.

Gate:

- All four packages compile.
- All four packages have tests.
- Public APIs are documented.
- Examples use workspace imports.
- No circular dependencies.
- `@rootware/errors` remains dependency-free.

## Milestone 2 — Rootware App Kit

Packages:

- `@rootware/http`
- `@rootware/cache`
- `@rootware/storage`
- `@rootware/session`

Goal:

Provide the missing app infrastructure around routers and runtimes.

Gate:

- HTTP client supports timeout/retry/error classification.
- Cache has memory adapter and stable contract.
- Storage has memory/local adapter and bucket contract.
- Session has cookie/session store contract and security documentation.

## Milestone 3 — Rootware Data

Packages:

- `@rootware/migrate`
- `@rootware/orm`
- shipped Postgres subpaths plus future adapters/subpaths for Neon, SQLite,
  libSQL, and Turso.

Goal:

Provide Deno-first database development, starting with SQL-first migrations and
Postgres ORM vertical slice.

Gate:

- SQL-first migrations can be run without ORM.
- ORM can create schema metadata for migrate.
- Query logs and migration logs use `@rootware/log`.
- Migration and ORM errors use `@rootware/errors`.

## Milestone 4 — Rootware Operations

Packages:

- `@rootware/jobs`
- `@rootware/webhooks` or webhook adapter package.
- `@rootware/mail` or provider adapters.
- `@rootware/otel`
- optional billing/AI integrations later.

Goal:

Support production workflows: asynchronous work, retries, provider events,
notifications, and observability.

Gate:

- Job contract supports memory adapter first.
- Durable adapters are designed but not rushed.
- Webhooks integrate idempotency with jobs.
- OpenTelemetry adapter correlates logs, HTTP, DB, and jobs.

## Reference app

Use a small 9GAG-like app as the main dogfood target.

Working name:

```txt
Doomscrollr
```

The app should test:

- Users.
- Sessions.
- Posts.
- Media uploads.
- Votes.
- Comments.
- Feeds.
- Reports/moderation.
- Background jobs.
- Storage.
- Logs.
- Errors.
- Migrations.
- ORM.
- Cache.
- Tests.

First vertical slice:

```txt
User signs in -> user uploads meme -> post appears in feed -> another user votes/comments -> logs/tests prove the flow
```

## Release strategy

Use independent package versions.

Good:

```txt
@rootware/errors@0.2.0
@rootware/env@0.1.3
@rootware/log@0.2.1
```

Avoid forcing all packages to the same version.

## Documentation rule

Each package should eventually have:

- Product plan markdown.
- README.
- Quick start.
- API overview.
- Testing section.
- Runtime support section.
- Security/safety section where relevant.
- Roadmap section.
- Examples.

## Product rule

Build the next package only when the previous package has enough real value to
be dogfooded by it.
