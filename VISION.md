# Rootware Vision

Rootware is a Deno-first, JSR-native backend ecosystem for building production
TypeScript applications with coherent, composable infrastructure primitives.

Rootware should not become one giant framework too early. It should begin as a
set of small, serious packages that work independently, compose cleanly, and
eventually form a Quarkus-like backend ecosystem for the Deno and JSR world.

The long-term vision is simple:

> Rootware should make building a production Deno backend feel coherent, boring,
> typed, observable, and deployable.

Rootware is not just a logger, ORM, migration tool, or utility collection.
Rootware is the production substrate for Deno backend applications.

---

## 1. Why Rootware Exists

Deno has a strong runtime. JSR gives the ecosystem a native TypeScript package
registry. But the Deno backend ecosystem still lacks a cohesive,
production-oriented application layer.

Most backend projects repeat the same infrastructure work:

- structured errors
- typed environment configuration
- structured logging
- testing utilities
- database schema modeling
- migrations
- ORM/query building
- HTTP utilities
- request errors
- retries and timeouts
- cache
- object/file storage
- sessions
- background jobs
- queues
- workers
- scheduling
- health checks
- observability
- framework adapters
- deployment conventions

In Node, developers usually solve this by assembling many disconnected packages.
In Java, ecosystems such as Quarkus provide a more integrated application
platform. Rootware should learn from that kind of ecosystem thinking, but stay
idiomatic to Deno, JSR, TypeScript, Web Standards, and modern server runtimes.

Rootware should not be a Quarkus clone. Quarkus is a useful north star because
it shows what a mature backend ecosystem can become: conventions, extensions,
integrations, observability, cloud-native behavior, and production defaults.

Rootware should pursue the same level of coherence, but with a package-first
TypeScript design.

---

## 2. Product Thesis

The product is not any single package.

The product is the integrated developer experience.

Each Rootware package should be useful alone, but more valuable together:

- `@rootware/errors` gives every package a shared failure model.
- `@rootware/env` gives every package typed configuration.
- `@rootware/log` gives every package structured logs.
- `@rootware/testing` gives every package deterministic test utilities.
- `@rootware/schema` gives ORM and migrations a shared schema model.
- `@rootware/migrate` handles schema evolution.
- `@rootware/orm` handles database access.
- `@rootware/http` handles HTTP conventions.
- `@rootware/cache` handles cache contracts.
- `@rootware/storage` handles object/file storage contracts.
- `@rootware/session` handles sessions on top of cache/storage-like primitives.
- `@rootware/jobs` handles background work, queues, workers, retries, and
  scheduling primitives.

The thesis:

> Deno developers need a serious JSR-native backend stack. Rootware can become
> that stack by starting with small foundation packages and growing into a
> coherent ecosystem.

---

## 3. What Rootware Is

Rootware is:

- Deno-first
- JSR-native
- TypeScript-native
- Web Standards aligned
- modular
- framework-friendly
- production-oriented
- testable
- observable
- adapter-based
- package-first
- eventually plugin-driven

Rootware should support developers building:

- small APIs
- full-stack Deno apps
- SaaS backends
- internal tools
- content platforms
- worker systems
- real-time apps
- queue-based systems
- modular monoliths
- framework-integrated applications

Rootware should be useful for real applications, not just demos.

---

## 4. What Rootware Is Not

Rootware should not become a giant all-in-one framework too early.

Rootware should not force one web framework.

Rootware should not force Hono, Fresh, Oak, Effect, React, PostgreSQL, Redis,
S3, R2, NATS, Kafka, or any specific vendor as mandatory infrastructure.

Rootware should not hide the runtime.

Rootware should not invent abstractions before real package needs prove them.

Rootware should not turn every package into a dependency of every other package.

Rootware should not publish unstable APIs as if they are final.

The correct path is:

1. Build strong primitives.
2. Define stable contracts.
3. Add adapters.
4. Add integration packages.
5. Add application composition.
6. Add a plugin system.
7. Add CLI and dev tooling.

---

## 5. Current Core Set

The current core set is:

| Package             | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `@rootware/errors`  | Shared structured error system. Foundation for every other package.       |
| `@rootware/env`     | Environment variable loading, parsing, validation, and typed config.      |
| `@rootware/log`     | Pino-inspired structured logger, but JSR-native and Deno-first.           |
| `@rootware/testing` | Test utilities, mocks, assertions, fixtures, and package DX helpers.      |
| `@rootware/schema`  | Database schema snapshot/model layer used by ORM and migrations.          |
| `@rootware/migrate` | Migration runner, migration planning, schema diffs, migration history.    |
| `@rootware/orm`     | Deno-first ORM/query builder inspired by Drizzle, but Rootware-native.    |
| `@rootware/http`    | HTTP client/server utilities, request helpers, errors, retries, timeouts. |
| `@rootware/cache`   | Cache abstraction with memory/cache-store adapters and namespacing.       |
| `@rootware/storage` | Object/file storage abstraction: memory now, S3/R2/etc. later.            |
| `@rootware/session` | Session management on top of cache/storage-like primitives.               |
| `@rootware/jobs`    | Background jobs, queues, workers, retries, scheduling primitives.         |

The true foundation layer is smaller:

```txt
@rootware/errors
@rootware/env
@rootware/log
@rootware/testing
```

A stricter classification:

```txt
Runtime Foundation:
  @rootware/errors
  @rootware/env
  @rootware/log

Dev Foundation:
  @rootware/testing

Core Infrastructure:
  @rootware/schema
  @rootware/http
  @rootware/cache
  @rootware/storage

Application Capabilities:
  @rootware/migrate
  @rootware/orm
  @rootware/session
  @rootware/jobs
```

This distinction matters. Foundation packages should remain small, stable,
dependency-light, and usable everywhere.

---

## 6. Package Responsibilities

### `@rootware/errors`

The shared structured error system.

It should define the common error model used across all packages. It should
support error codes, causes, metadata, status mapping, safe/public messages,
internal/debug messages, and serialization.

Every Rootware package should use this.

Its purpose is to make failures consistent.

### `@rootware/env`

Environment variable loading, parsing, validation, and typed configuration.

It should support required variables, optional variables, defaults, transforms,
runtime-safe access, test overrides, `.env` loading where appropriate, and
deployment-friendly behavior.

Its purpose is to remove untyped, scattered environment access from serious
applications.

### `@rootware/log`

A Pino-inspired structured logger, but JSR-native and Deno-first.

It should support JSON logs, child loggers, request IDs, trace IDs, error
serialization, redaction, buffering for tests, pretty output for development,
and production-safe defaults.

Its purpose is to provide fast, structured, testable logging without requiring
npm packages.

### `@rootware/testing`

Shared testing utilities for Rootware packages and users.

It should provide fixtures, mocks, test loggers, test env helpers, temporary
storage, fake clocks, in-memory adapters, assertions, and package DX helpers.

Its purpose is to make every Rootware package easier to test and easier to use
in user test suites.

### `@rootware/schema`

A database schema snapshot/model layer used by ORM and migrations.

It should represent tables, columns, indexes, constraints, relations, enums,
defaults, and database-specific capabilities in a structured model.

Its purpose is to be the shared schema language between `@rootware/orm` and
`@rootware/migrate`.

This package must avoid becoming abstract for its own sake. It exists because
ORM and migrations need a common model.

### `@rootware/migrate`

Migration runner, migration planning, schema diffs, and migration history.

It should support applying migrations, rolling forward, tracking migration
state, generating migration plans, comparing schema snapshots, and integrating
with the Rootware logger and error system.

Its purpose is to make schema evolution reliable.

### `@rootware/orm`

A Deno-first ORM/query builder inspired by Drizzle, but Rootware-native.

It should be strongly typed, explicit, modular, JSR-native, and designed around
Deno. It should start small and correct before chasing every ORM feature.

Its purpose is to provide a serious persistence layer without requiring
npm-first tooling.

### `@rootware/http`

Framework-neutral HTTP utilities.

It should handle request IDs, response helpers, structured error mapping,
request logging, retries, timeouts, typed handlers, headers, status helpers, and
testing utilities.

It should not depend on Hono, Fresh, Oak, Express, or any specific framework.

Its purpose is to define Rootware HTTP conventions that adapters can use.

### `@rootware/cache`

Cache abstraction with memory/cache-store adapters and namespacing.

It should define get/set/delete, TTL, namespaces, serialization behavior, stale
reads, invalidation helpers, and test adapters.

Its purpose is to provide a common cache contract for sessions, rate limiting,
jobs, and app-level caching.

### `@rootware/storage`

Object/file storage abstraction.

It should support memory storage first, filesystem/S3/R2 later, object metadata,
streams, signed URLs, upload helpers, and test utilities.

Its purpose is to provide a consistent storage contract for uploads, media,
generated files, and app assets.

### `@rootware/session`

Session management built on top of cache/storage-like primitives.

It should support session creation, rotation, expiration, invalidation, cookie
helpers, storage backends, and integration with HTTP/framework adapters.

Its purpose is to provide a consistent session model without forcing a specific
auth provider.

### `@rootware/jobs`

Background jobs, queues, workers, retries, and scheduling primitives.

It should support named jobs, input validation, retries, backoff, job IDs,
worker lifecycle, failure handling, delayed execution, scheduling, and
in-memory/Postgres-backed adapters.

Its purpose is to give Deno applications a serious background work system.

---

## 7. Repository Layout Strategy

Rootware currently uses a flat package layout.

That is acceptable at the very beginning, but the ecosystem is already large
enough that a lightly grouped layout is better.

The recommended near-term layout is:

```txt
rootware/
├─ packages/
│  ├─ foundation/
│  │  ├─ errors/
│  │  ├─ env/
│  │  ├─ log/
│  │  └─ testing/
│  │
│  ├─ data/
│  │  ├─ schema/
│  │  ├─ migrate/
│  │  └─ orm/
│  │
│  ├─ web/
│  │  └─ http/
│  │
│  ├─ state/
│  │  ├─ cache/
│  │  ├─ storage/
│  │  └─ session/
│  │
│  └─ async/
│     └─ jobs/
│
├─ examples/
│  ├─ minimal-api/
│  ├─ orm-migrate/
│  └─ jobs-worker/
│
├─ docs/
├─ deno.json
└─ README.md
```

The public JSR package names should remain flat:

```txt
@rootware/errors
@rootware/env
@rootware/log
@rootware/testing
@rootware/schema
@rootware/migrate
@rootware/orm
@rootware/http
@rootware/cache
@rootware/storage
@rootware/session
@rootware/jobs
```

The filesystem can be grouped by domain, while the public package names remain
direct and predictable.

Example mapping:

```txt
packages/foundation/errors  -> @rootware/errors
packages/foundation/env     -> @rootware/env
packages/foundation/log     -> @rootware/log
packages/data/schema        -> @rootware/schema
packages/data/migrate       -> @rootware/migrate
packages/data/orm           -> @rootware/orm
packages/web/http           -> @rootware/http
packages/state/cache        -> @rootware/cache
packages/state/storage      -> @rootware/storage
packages/state/session      -> @rootware/session
packages/async/jobs         -> @rootware/jobs
```

Do not create empty future folders yet.

Do not create `kernel/`, `security/`, `observability/`, `adapters/`, or
`tooling/` until the packages actually exist.

The vision should live in documentation first. The filesystem should reflect
current reality.

---

## 8. Future Ecosystem Layout

The long-term ecosystem may eventually look like this:

```txt
rootware/
├─ packages/
│  ├─ foundation/
│  │  ├─ errors/
│  │  ├─ env/
│  │  ├─ log/
│  │  └─ testing/
│  │
│  ├─ kernel/
│  │  ├─ app/
│  │  ├─ context/
│  │  ├─ lifecycle/
│  │  └─ plugin/
│  │
│  ├─ web/
│  │  ├─ http/
│  │  ├─ ws/
│  │  ├─ rpc/
│  │  ├─ openapi/
│  │  └─ rate-limit/
│  │
│  ├─ data/
│  │  ├─ schema/
│  │  ├─ orm/
│  │  ├─ migrate/
│  │  ├─ seed/
│  │  └─ pagination/
│  │
│  ├─ state/
│  │  ├─ cache/
│  │  ├─ storage/
│  │  └─ session/
│  │
│  ├─ async/
│  │  ├─ events/
│  │  ├─ queue/
│  │  ├─ jobs/
│  │  ├─ scheduler/
│  │  └─ messaging/
│  │
│  ├─ security/
│  │  ├─ auth/
│  │  ├─ rbac/
│  │  ├─ csrf/
│  │  └─ crypto/
│  │
│  ├─ observability/
│  │  ├─ health/
│  │  ├─ metrics/
│  │  ├─ tracing/
│  │  ├─ otel/
│  │  └─ audit/
│  │
│  ├─ adapters/
│  │  ├─ hono/
│  │  ├─ fresh/
│  │  ├─ oak/
│  │  ├─ effect/
│  │  ├─ postgres/
│  │  ├─ sqlite/
│  │  ├─ libsql/
│  │  ├─ neon/
│  │  ├─ redis/
│  │  ├─ s3/
│  │  ├─ r2/
│  │  ├─ nats/
│  │  └─ kafka/
│  │
│  └─ tooling/
│     ├─ cli/
│     ├─ create/
│     ├─ doctor/
│     └─ dev/
│
├─ examples/
│  ├─ minimal-api/
│  ├─ hono-api/
│  ├─ fresh-app/
│  ├─ orm-migrate/
│  ├─ jobs-worker/
│  ├─ websocket-chat/
│  ├─ fullstack-app/
│  └─ doomscrollr-demo/
│
├─ docs/
│  ├─ packages/
│  ├─ guides/
│  ├─ architecture/
│  ├─ roadmap/
│  └─ decisions/
│
├─ benches/
├─ scripts/
├─ deno.json
├─ README.md
└─ ROADMAP.md
```

This is the destination, not the immediate filesystem target.

---

## 9. Dependency Direction

Rootware must enforce strict dependency direction.

Foundation packages must not depend on higher-level packages.

Good:

```txt
@rootware/hono -> @rootware/http
@rootware/session -> @rootware/cache
@rootware/migrate -> @rootware/schema
@rootware/postgres -> @rootware/orm
@rootware/cache-redis -> @rootware/cache
@rootware/storage-s3 -> @rootware/storage
@rootware/jobs-postgres -> @rootware/jobs
```

Bad:

```txt
@rootware/http -> @rootware/hono
@rootware/orm -> @rootware/postgres
@rootware/cache -> @rootware/cache-redis
@rootware/storage -> @rootware/storage-s3
```

Contracts should not depend on adapters.

Adapters depend on contracts.

This is one of the most important architectural rules in the ecosystem.

---

## 10. Framework Adapters

Rootware should integrate with existing frameworks instead of replacing them.

The first major framework adapters should be:

```txt
@rootware/hono
@rootware/fresh
```

Later:

```txt
@rootware/oak
@rootware/effect
@rootware/express
@rootware/fastify
@rootware/elysia
```

The rule:

```txt
Rootware plugin = app/lifecycle integration
Framework adapter = external framework binding
Framework middleware = request pipeline hook
```

For Hono, the adapter should expose middleware and helpers:

```ts
import { Hono } from "hono";
import { createRootwareHono } from "@rootware/hono";

const app = new Hono();

const rootware = createRootwareHono({
  env,
  logger,
});

app.use("*", rootware.requestContext());
app.use("*", rootware.requestLogger());
app.use("*", rootware.errorHandler());

app.get("/health", rootware.health());

export default app;
```

For Fresh, the adapter should integrate through middleware, state, handlers,
sessions, errors, and SSR-safe request context:

```ts
import { createRootwareFresh } from "@rootware/fresh";

const rootware = createRootwareFresh({
  env,
  logger,
});

export const handler = [
  rootware.requestContext(),
  rootware.requestLogger(),
  rootware.errorHandler(),
];
```

The long-term goal is for framework adapters to consume the same Rootware app
definition:

```ts
import { defineApp } from "@rootware/app";
import { honoAdapter } from "@rootware/hono";

const app = defineApp({
  env,
  logger,
  plugins: [],
});

export default honoAdapter(app);
```

And:

```ts
import { defineApp } from "@rootware/app";
import { freshAdapter } from "@rootware/fresh";

const app = defineApp({
  env,
  logger,
  plugins: [],
});

export const handler = freshAdapter(app);
```

This gives users choice:

- Use Hono for routing.
- Use Fresh for SSR.
- Use Oak if desired.
- Use Effect if desired.
- Use Rootware for the production substrate.

---

## 11. Plugin System

The Rootware plugin system should come after the core contracts stabilize.

A plugin should be able to register:

- env schema
- logger fields
- lifecycle hooks
- health checks
- routes
- middleware
- jobs
- events
- migrations
- providers
- test helpers

Example future shape:

```ts
export default definePlugin({
  name: "rootware:postgres",

  env: PostgresEnv,

  async setup(app) {
    const db = await createDatabase(app.env.DATABASE_URL);

    app.provide("db", db);

    app.lifecycle.onShutdown(() => db.close());

    app.health.check("postgres", async () => {
      await db.execute("select 1");
    });
  },
});
```

Plugins should be explicit.

No hidden magic. No uncontrolled global state. No unpredictable dependency
injection.

The plugin system should solve composition, not obscure it.

---

## 12. Future Packages

The future ecosystem can expand into these areas.

### Kernel

```txt
@rootware/app
@rootware/context
@rootware/lifecycle
@rootware/plugin
```

Purpose:

- app definition
- app context
- provider registration
- lifecycle hooks
- graceful shutdown
- startup checks
- plugin registration
- dependency ordering

### Web

```txt
@rootware/ws
@rootware/rpc
@rootware/openapi
@rootware/rate-limit
```

Purpose:

- WebSocket support
- realtime channels
- typed RPC
- OpenAPI generation/helpers
- rate limiting

### Async

```txt
@rootware/events
@rootware/queue
@rootware/scheduler
@rootware/messaging
```

Purpose:

- in-process domain events
- queue contracts
- scheduled tasks
- external broker integrations
- pub/sub
- worker coordination

### Security

```txt
@rootware/auth
@rootware/rbac
@rootware/csrf
@rootware/crypto
```

Purpose:

- auth context
- sessions integration
- role-based access control
- CSRF helpers
- crypto utilities
- provider adapters later

### Observability

```txt
@rootware/health
@rootware/metrics
@rootware/tracing
@rootware/otel
@rootware/audit
```

Purpose:

- health checks
- structured metrics
- tracing hooks
- OpenTelemetry integration
- audit log primitives

### Infrastructure Adapters

```txt
@rootware/postgres
@rootware/sqlite
@rootware/libsql
@rootware/neon
@rootware/redis
@rootware/s3
@rootware/r2
@rootware/nats
@rootware/kafka
```

Purpose:

- implement contracts
- keep vendors out of core packages
- allow users to choose infrastructure

### Tooling

```txt
@rootware/cli
@rootware/create
@rootware/doctor
@rootware/dev
```

Purpose:

- project scaffolding
- package generation
- diagnostics
- dev workflow
- migration commands
- version checks
- environment checks

---

## 13. Roadmap

### Wave 1: Foundation

Build the packages that every other package needs.

```txt
@rootware/errors
@rootware/env
@rootware/log
@rootware/testing
```

Goal:

- stable error model
- stable env model
- stable logger model
- shared testing utilities
- consistent package DX
- minimal dependencies
- strong docs
- strong examples

Success means a user can use these packages in any Deno project without adopting
the rest of Rootware.

### Wave 2: Persistence Core

Build the database layer.

```txt
@rootware/schema
@rootware/migrate
@rootware/orm
```

Goal:

- shared schema model
- migrations
- migration history
- schema diffs
- typed query builder/ORM
- Postgres-first behavior
- later SQLite/libsql/Turso support

Success means a user can define schema, generate/apply migrations, and query the
database through Rootware packages.

### Wave 3: Application Primitives

Build the app infrastructure layer.

```txt
@rootware/http
@rootware/cache
@rootware/storage
@rootware/session
@rootware/jobs
```

Goal:

- HTTP utilities
- framework-neutral request/response helpers
- cache contracts
- storage contracts
- session management
- jobs/workers/retries/scheduling
- in-memory adapters for development/testing

Success means a user can build a real backend application without reaching for
many disconnected packages.

### Wave 4: Framework Adapters

Add first-class integration with popular frameworks.

```txt
@rootware/hono
@rootware/fresh
```

Goal:

- middleware
- request context
- error handling
- logging
- sessions
- health route integration
- testing helpers
- examples

Success means Rootware works naturally in Hono APIs and Fresh full-stack apps.

### Wave 5: Kernel and Plugins

Introduce app composition.

```txt
@rootware/app
@rootware/context
@rootware/lifecycle
@rootware/plugin
```

Goal:

- application definition
- lifecycle hooks
- provider registration
- plugin setup
- graceful shutdown
- startup checks
- dependency ordering
- health checks
- clean framework adapter integration

Success means users can compose Rootware apps through stable conventions instead
of manually wiring every package.

### Wave 6: Async and Realtime

Expand into events, queues, scheduling, messaging, and WebSockets.

```txt
@rootware/events
@rootware/queue
@rootware/scheduler
@rootware/messaging
@rootware/ws
```

Goal:

- domain events
- queue abstraction
- scheduled jobs
- external broker adapters
- WebSocket utilities
- realtime channels
- presence later

Success means Rootware supports background systems and real-time apps cleanly.

### Wave 7: Production Infrastructure

Add observability, security, and operational packages.

```txt
@rootware/health
@rootware/metrics
@rootware/tracing
@rootware/otel
@rootware/audit
@rootware/auth
@rootware/rbac
@rootware/rate-limit
```

Goal:

- production diagnostics
- structured health checks
- OpenTelemetry integration
- audit log primitives
- auth context
- permissions
- rate limiting
- security helpers

Success means Rootware applications are easier to operate in production.

### Wave 8: Tooling

Create the developer tooling layer.

```txt
@rootware/cli
@rootware/create
@rootware/doctor
@rootware/dev
```

Goal:

- project scaffolding
- package generation
- migration commands
- diagnostics
- dev workflow
- examples
- version checks
- environment checks

Success means a user can start, inspect, debug, and maintain a Rootware
application with a coherent CLI.

---

## 14. Developer Experience Target

A future Rootware app should feel like this:

```ts
import { defineApp } from "@rootware/app";
import { honoAdapter } from "@rootware/hono";
import { env } from "./env.ts";
import { logger } from "./log.ts";
import { dbPlugin } from "./plugins/db.ts";
import { sessionPlugin } from "./plugins/session.ts";
import { jobsPlugin } from "./plugins/jobs.ts";

const app = defineApp({
  env,
  logger,
  plugins: [
    dbPlugin,
    sessionPlugin,
    jobsPlugin,
  ],
});

export default honoAdapter(app);
```

A user should be able to start simple:

```ts
import { createLogger } from "@rootware/log";

const log = createLogger();

log.info({ userId }, "user created");
```

Then gradually adopt more:

```ts
import { defineEnv } from "@rootware/env";
import { createLogger } from "@rootware/log";
import { RootwareError } from "@rootware/errors";
```

Then later:

```ts
import { defineSchema } from "@rootware/schema";
import { migrate } from "@rootware/migrate";
import { createDb } from "@rootware/orm";
```

Then eventually:

```ts
import { defineApp } from "@rootware/app";
import { freshAdapter } from "@rootware/fresh";
```

The adoption path must be incremental. Rootware should not require users to buy
into the entire ecosystem immediately.

---

## 15. Design Principles

### 1. Package-first, ecosystem-second

Every package should be useful by itself.

The ecosystem should be the result of good composition, not forced coupling.

### 2. Contracts before adapters

Core packages define contracts.

Adapter packages implement contracts.

The cache contract should not depend on Redis.

The storage contract should not depend on S3.

The ORM contract should not depend on Postgres.

The HTTP contract should not depend on Hono.

### 3. Deno-first, not Deno-only forever

Rootware should be designed for Deno and JSR first. It should avoid npm
dependencies where possible.

But it should not reject compatibility where compatibility is useful. Bun, Node,
edge runtimes, and framework adapters can come later through careful boundaries.

### 4. Stable error and logging model

Errors and logs are the nervous system of the ecosystem.

Every package should expose failures consistently and log structured data
predictably.

### 5. Testability is a product feature

Every package should have in-memory adapters, deterministic test helpers, and
clean mocking patterns.

If a Rootware package is hard to test, the package is incomplete.

### 6. No premature magic

The plugin system should be explicit.

The app layer should compose packages, not hide everything.

Rootware should feel powerful, not mysterious.

### 7. Runtime clarity

Rootware should not fight Deno.

It should embrace permissions, Web Standards, explicit imports, JSR publishing,
native TypeScript, and modern deployment constraints.

### 8. Production defaults

Rootware should prefer safe defaults:

- structured logs
- typed env
- explicit errors
- timeout support
- retry controls
- request IDs
- health checks
- graceful shutdown
- test adapters
- no hidden global state

---

## 16. Success Criteria

Rootware is succeeding when:

- developers can use each package independently
- packages compose without awkward glue code
- errors, logs, env, and tests feel consistent across the ecosystem
- users can build real apps with Rootware primitives
- Hono and Fresh integrations feel native
- migrations and ORM share a coherent schema model
- sessions, cache, storage, and jobs use consistent contracts
- examples are production-shaped, not toy demos
- the ecosystem reduces npm dependency for Deno users
- the CLI helps diagnose real project problems
- Rootware becomes a natural recommendation for Deno backend projects

Rootware is not succeeding if:

- every package becomes coupled to every other package
- package APIs are unstable and inconsistent
- the app layer arrives before the primitives are ready
- adapters leak into core contracts
- the ORM becomes too ambitious too early
- the plugin system hides too much behavior
- examples do not reflect real applications
- the ecosystem feels like many unrelated packages under one namespace

---

## 17. Strategic Positioning

Rootware should be positioned as:

> A Deno-first, JSR-native backend ecosystem for production TypeScript
> applications.

Alternative shorter version:

> Production primitives for Deno backends.

Expanded version:

> Rootware provides the foundation for production Deno applications: structured
> errors, typed environment configuration, structured logging, testing
> utilities, schema modeling, migrations, ORM, HTTP utilities, caching, storage,
> sessions, background jobs, framework adapters, and eventually plugins.

Quarkus can remain an internal inspiration, but the public message should not be
“Quarkus clone for Deno.”

The stronger message is:

> Rootware brings coherent backend infrastructure to the Deno and JSR ecosystem.

---

## 18. Long-Term Destination

The long-term destination is a full Rootware application ecosystem:

- small packages
- strong contracts
- clean adapters
- framework integrations
- plugin system
- CLI tooling
- production defaults
- real examples
- serious documentation
- stable release channels

The final experience should let a developer build a Deno backend with
confidence:

```txt
Use @rootware/errors for failures.
Use @rootware/env for config.
Use @rootware/log for logging.
Use @rootware/testing for tests.
Use @rootware/schema, migrate, and orm for data.
Use @rootware/http for request conventions.
Use @rootware/cache and storage for state.
Use @rootware/session for sessions.
Use @rootware/jobs for background work.
Use @rootware/hono or @rootware/fresh for framework integration.
Use @rootware/app and plugin later for composition.
```

Rootware should begin small, but it should not think small.

The future vision is an ecosystem where Deno developers can build serious
applications without constantly reaching outside the JSR-native world for
foundational backend infrastructure.

Rootware should become the reliable backend layer for Deno.
