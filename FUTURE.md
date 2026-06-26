# Rootware Future Ecosystem

> Long-term direction for Rootware after the twelve-package core proves
> coherence.

This document is a companion to `VISION.md`.

`VISION.md` defines the current working strategy: twelve packages, a thin
coherence slice, and strict scope discipline. This document explains where that
vision can go after the core proves useful in a real application.

This is not the active roadmap.

This is the destination map.

The purpose of this document is to preserve the larger ecosystem thinking
without allowing it to corrupt the current build scope. Rootware should begin
small, but it should not forget where it can go.

---

## 1. Relationship to `VISION.md`

The canonical vision says Rootware currently focuses on exactly twelve packages:

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

That remains the active scope.

The future ecosystem described here only begins after the core proves its
differentiator:

```txt
errors + env + log + request context + http
```

That coherence slice must feel materially better than manually assembling
independent packages.

The rule:

> Do not widen the ecosystem until the coherence model is proven in a real app.

This document is therefore a constraint document as much as a roadmap document.
It says where Rootware can go, but also explains when it is allowed to go there.

---

## 2. Expansion Principle

Every future package must justify itself through at least one of these reasons:

1. **Material npm compatibility tax**
   - The existing npm ecosystem works poorly or awkwardly on Deno.
   - Native JSR/Deno behavior is materially better.

2. **Ecosystem coherence**
   - The package makes Rootware feel like one system.
   - It reuses the same error model, env model, log model, request context,
     lifecycle, and testing conventions.

3. **Adapter pressure**
   - A core contract exists and users need a concrete implementation for a
     runtime, framework, vendor, or infrastructure provider.

4. **Operational necessity**
   - Real apps need the package to run, debug, observe, secure, or maintain
     production systems.

5. **Developer experience leverage**
   - The package reduces repeated project setup, diagnostics, generation, or
     boilerplate across Rootware apps.

If a proposed package satisfies none of these, it should not exist.

---

## 3. Long-Term Ecosystem Shape

Rootware can eventually grow into these layers:

```txt
Foundation:
  errors, env, log, testing

Kernel:
  app, context, lifecycle, plugin

Web:
  http, fetch, ws, realtime, rpc, openapi, rate-limit

Data:
  schema, orm, migrate, seed, pagination, search

State:
  cache, storage, session

Async:
  jobs, events, queue, scheduler, messaging

Security:
  auth, rbac, csrf, crypto, entitlements

Observability:
  health, metrics, tracing, otel, audit

Framework Adapters:
  hono, fresh, oak, effect, express, fastify, elysia

Infrastructure Adapters:
  postgres, sqlite, libsql, turso, neon, redis, deno-kv,
  s3, r2, nats, kafka, rabbitmq

Tooling:
  cli, create, doctor, dev, codegen

Domain/Vertical Extensions:
  upload, media, moderation, reporting, trust, billing
```

The public package names should stay flat:

```txt
@rootware/errors
@rootware/http
@rootware/hono
@rootware/postgres
@rootware/doctor
```

The filesystem may be grouped, but the JSR namespace should stay direct and
predictable.

---

## 4. Future Monorepo Layout

The eventual repository can look like this:

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
│  │  ├─ fetch/
│  │  ├─ ws/
│  │  ├─ realtime/
│  │  ├─ rpc/
│  │  ├─ openapi/
│  │  └─ rate-limit/
│  │
│  ├─ data/
│  │  ├─ schema/
│  │  ├─ orm/
│  │  ├─ migrate/
│  │  ├─ seed/
│  │  ├─ pagination/
│  │  └─ search/
│  │
│  ├─ state/
│  │  ├─ cache/
│  │  ├─ storage/
│  │  └─ session/
│  │
│  ├─ async/
│  │  ├─ jobs/
│  │  ├─ events/
│  │  ├─ queue/
│  │  ├─ scheduler/
│  │  └─ messaging/
│  │
│  ├─ security/
│  │  ├─ auth/
│  │  ├─ rbac/
│  │  ├─ csrf/
│  │  ├─ crypto/
│  │  └─ entitlements/
│  │
│  ├─ observability/
│  │  ├─ health/
│  │  ├─ metrics/
│  │  ├─ tracing/
│  │  ├─ otel/
│  │  └─ audit/
│  │
│  ├─ adapters/
│  │  ├─ framework/
│  │  │  ├─ hono/
│  │  │  ├─ fresh/
│  │  │  ├─ oak/
│  │  │  ├─ effect/
│  │  │  ├─ express/
│  │  │  ├─ fastify/
│  │  │  └─ elysia/
│  │  │
│  │  ├─ database/
│  │  │  ├─ postgres/
│  │  │  ├─ sqlite/
│  │  │  ├─ libsql/
│  │  │  ├─ turso/
│  │  │  └─ neon/
│  │  │
│  │  ├─ cache/
│  │  │  ├─ redis/
│  │  │  └─ deno-kv/
│  │  │
│  │  ├─ storage/
│  │  │  ├─ s3/
│  │  │  └─ r2/
│  │  │
│  │  └─ messaging/
│  │     ├─ nats/
│  │     ├─ kafka/
│  │     └─ rabbitmq/
│  │
│  ├─ domain/
│  │  ├─ upload/
│  │  ├─ media/
│  │  ├─ moderation/
│  │  ├─ reporting/
│  │  ├─ trust/
│  │  └─ billing/
│  │
│  └─ tooling/
│     ├─ cli/
│     ├─ create/
│     ├─ doctor/
│     ├─ dev/
│     └─ codegen/
│
├─ examples/
│  ├─ minimal-api/
│  ├─ hono-api/
│  ├─ fresh-app/
│  ├─ orm-migrate/
│  ├─ jobs-worker/
│  ├─ websocket-chat/
│  ├─ fullstack-app/
│  ├─ doomscrollr-demo/
│  ├─ quire-lite/
│  └─ church-crm-demo/
│
├─ docs/
│  ├─ VISION.md
│  ├─ future-ecosystem.md
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

Do not create this full layout early.

The current repo should only contain folders for packages that exist.

---

## 5. Kernel Layer

The kernel layer is what eventually turns Rootware from a package collection
into a coherent application substrate.

Future packages:

```txt
@rootware/app
@rootware/context
@rootware/lifecycle
@rootware/plugin
```

### `@rootware/context`

Purpose:

- controlled request/task context propagation
- request id
- trace id
- span id
- user principal
- tenant
- logger binding
- job id
- correlation fields

This package should expose the public context API. Its underlying mechanism may
use AsyncLocalStorage, explicit context passing, or another runtime-safe
strategy.

It should not become uncontrolled global state.

Example direction:

```ts
import { runWithContext, useContext } from "@rootware/context";

await runWithContext({ requestId, logger }, async () => {
  const ctx = useContext();
  ctx.logger.info("request started");
});
```

### `@rootware/lifecycle`

Purpose:

- startup hooks
- shutdown hooks
- resource cleanup
- signal handling
- graceful shutdown
- worker lifecycle
- plugin initialization order
- health/readiness coordination

This package becomes important once databases, jobs, queues, WebSockets, and
plugins exist.

Example direction:

```ts
lifecycle.onStart(async () => {
  await db.connect();
});

lifecycle.onShutdown(async () => {
  await db.close();
});
```

### `@rootware/app`

Purpose:

- application composition
- shared app definition
- provider registration
- env/log/context/lifecycle integration
- framework adapter target
- plugin host

This package should not arrive early. It should appear only after the lower
primitives reveal the right composition API.

Example direction:

```ts
import { defineApp } from "@rootware/app";

export const app = defineApp({
  env,
  logger,
  plugins: [
    dbPlugin,
    sessionPlugin,
    jobsPlugin,
  ],
});
```

### `@rootware/plugin`

Purpose:

- explicit plugin contract
- plugin metadata
- env registration
- lifecycle hooks
- providers
- routes
- jobs
- migrations
- health checks
- test helpers

Plugins should solve composition, not hide behavior.

Example direction:

```ts
import { definePlugin } from "@rootware/plugin";

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

Plugin rule:

> No hidden magic, no uncontrolled global state, no implicit dependency
> injection that users cannot inspect.

---

## 6. Web Layer

The web layer begins with `@rootware/http`, but can eventually expand.

Future packages:

```txt
@rootware/http
@rootware/fetch
@rootware/ws
@rootware/realtime
@rootware/rpc
@rootware/openapi
@rootware/rate-limit
```

### `@rootware/http`

Current scope:

- server/request/response conventions
- request IDs
- context binding
- response helpers
- structured error mapping
- request logging
- status helpers
- headers
- testing utilities

Future role:

- bridge between context, errors, log, session, auth, framework adapters, and
  observability

### `@rootware/fetch`

Potential split from `@rootware/http`.

Purpose:

- HTTP client helpers
- retries
- timeouts
- backoff
- JSON helpers
- error mapping
- request context propagation
- outbound request logging

This package should only split out if HTTP client behavior becomes large enough
to justify a separate surface.

### `@rootware/ws`

Purpose:

- WebSocket utilities
- upgrade helpers
- connection lifecycle
- heartbeat
- close handling
- typed messages
- auth handshake
- context binding
- testable in-memory connections

It should not arrive until HTTP, context, session, log, and errors are stable
enough.

### `@rootware/realtime`

Purpose:

- channels
- rooms
- broadcasting
- presence
- typed event messages
- fanout
- connection registry
- app-level real-time API

`ws` is the protocol layer. `realtime` is the application layer.

Example direction:

```ts
const realtime = defineRealtime({
  channels: {
    "post.comments": {
      input: CommentEvent,
      auth: requireUser,
      handler(ctx, event) {
        ctx.broadcast.to(`post:${event.postId}`).send(event);
      },
    },
  },
});
```

### `@rootware/rpc`

Purpose:

- typed server/client contracts
- request validation
- response typing
- error mapping
- context propagation
- client generation

This should wait until HTTP conventions stabilize.

### `@rootware/openapi`

Purpose:

- OpenAPI helpers
- route metadata
- schema integration
- documentation generation
- client generation hooks

This should be adapter-friendly and should not force one validation library.

### `@rootware/rate-limit`

Purpose:

- rate limit contract
- cache-backed counters
- HTTP middleware integration
- user/IP/session limits
- burst windows
- test helpers

It depends on cache and HTTP conventions.

---

## 7. Data Layer

The current data layer is:

```txt
@rootware/schema
@rootware/orm
@rootware/migrate
```

Future additions:

```txt
@rootware/seed
@rootware/pagination
@rootware/search
```

### `@rootware/seed`

Purpose:

- deterministic seed data
- fixtures for local dev
- test database setup
- environment-aware seed plans

This can build on schema and ORM.

### `@rootware/pagination`

Purpose:

- cursor pagination
- offset pagination helpers
- stable ordering
- sort/filter contracts
- API response shape
- ORM integration

This is valuable because nearly every app repeats it badly.

Example direction:

```ts
const page = await paginate(db.posts, {
  cursor,
  limit: 20,
  orderBy: ["created_at", "id"],
});
```

### `@rootware/search`

Purpose:

- search abstraction
- Postgres full-text search adapter
- external search adapter later
- query normalization
- ranking helpers

This should not start early. Search becomes valuable once real apps need it.

---

## 8. State Layer

The state layer begins with:

```txt
@rootware/cache
@rootware/storage
@rootware/session
```

Future direction includes stronger adapters and higher-level use cases.

### Cache adapters

Potential packages:

```txt
@rootware/cache-redis
@rootware/cache-deno-kv
```

Rules:

- `@rootware/cache` defines the contract.
- Adapter packages implement the contract.
- Core cache never imports Redis, Deno KV, or vendor clients.

### Storage adapters

Potential packages:

```txt
@rootware/storage-fs
@rootware/storage-s3
@rootware/storage-r2
```

Rules:

- `@rootware/storage` defines the contract.
- Adapter packages implement the contract.
- Core storage never imports S3/R2 clients.

### Session future

`@rootware/session` can later integrate with:

```txt
@rootware/http
@rootware/hono
@rootware/fresh
@rootware/auth
@rootware/rate-limit
@rootware/audit
```

Session should remain auth-provider-neutral.

---

## 9. Async Layer

The active scope includes only:

```txt
@rootware/jobs
```

Future splits are possible, but not automatic.

Potential packages:

```txt
@rootware/events
@rootware/queue
@rootware/scheduler
@rootware/messaging
```

### `@rootware/jobs`

Current/foundation async package.

Purpose:

- named jobs
- retries
- backoff
- delayed execution
- worker lifecycle
- job status
- failure handling
- memory adapter
- Postgres adapter later

This package should initially absorb job, queue, and scheduling primitives until
real pressure justifies decomposition.

### `@rootware/events`

Potential future split.

Purpose:

- in-process domain events
- event handlers
- sync/async dispatch
- context propagation
- test recording

Example:

```ts
await events.emit("user.created", {
  userId,
  email,
});
```

Split trigger:

- multiple packages need domain events independently of jobs
- events become a shared abstraction across HTTP, ORM, sessions, jobs, audit,
  and plugins

### `@rootware/queue`

Potential future split.

Purpose:

- queue contract
- enqueue/dequeue
- visibility timeout
- delayed jobs
- dead-letter behavior
- queue adapters

Split trigger:

- multiple queue backends emerge
- jobs becomes too tied to transport concerns
- users need queue semantics without the full jobs API

### `@rootware/scheduler`

Potential future split.

Purpose:

- cron-like schedules
- recurring jobs
- delayed tasks
- calendar-aware scheduling
- worker coordination

Split trigger:

- scheduling becomes large enough to obscure the jobs API

### `@rootware/messaging`

Potential future split.

Purpose:

- pub/sub
- broker integration
- NATS/Kafka/RabbitMQ adapters
- message envelopes
- topic routing
- durable subscriptions

Split trigger:

- Rootware has real apps needing broker-based communication
- adapters become necessary
- pub/sub semantics differ enough from jobs/queue semantics

---

## 10. Security Layer

Potential packages:

```txt
@rootware/auth
@rootware/rbac
@rootware/csrf
@rootware/crypto
@rootware/entitlements
```

These should not be early packages. They require mature context, HTTP, session,
and audit primitives first.

### `@rootware/auth`

Purpose:

- auth context
- principal model
- login/session integration hooks
- adapter-friendly provider model
- no forced provider

Rootware should not try to replace Clerk, WorkOS, Auth.js, OAuth providers, or
custom auth immediately. It should define the internal auth model and adapt
providers later.

Example direction:

```ts
type Principal = {
  id: string;
  type: "user" | "service" | "anonymous";
  roles: string[];
  permissions: string[];
};
```

### `@rootware/rbac`

Purpose:

- roles
- permissions
- policy checks
- route/job authorization
- test helpers

### `@rootware/csrf`

Purpose:

- CSRF token helpers
- session integration
- HTTP middleware integration
- form/action protection

### `@rootware/crypto`

Purpose:

- signing helpers
- token helpers
- password hashing wrappers if needed
- secure random helpers
- encoding utilities

This package should be conservative. Security APIs are high-risk and should not
be invented casually.

### `@rootware/entitlements`

Purpose:

- feature access
- paid plan access
- course/content access
- usage-based gating
- billing-independent permission checks

This is useful for apps like Quire and SaaS products.

Example:

```ts
await entitlements.can(user).access("course", courseId);
await entitlements.can(user).use("feature:ai-report");
```

---

## 11. Observability Layer

Potential packages:

```txt
@rootware/health
@rootware/metrics
@rootware/tracing
@rootware/otel
@rootware/audit
```

These become important once Rootware apps have lifecycle, HTTP, jobs, database,
and adapters.

### `@rootware/health`

Purpose:

- health checks
- readiness checks
- liveness checks
- dependency checks
- HTTP integration
- lifecycle integration

Example:

```ts
health.check("postgres", async () => {
  await db.execute("select 1");
});
```

### `@rootware/metrics`

Purpose:

- counters
- gauges
- histograms
- request duration
- job duration
- DB query count
- cache hit ratio

### `@rootware/tracing`

Purpose:

- spans
- trace context
- request/job/db trace propagation
- internal abstraction over tracing behavior

### `@rootware/otel`

Purpose:

- OpenTelemetry bridge
- exporters
- instrumentation hooks
- integration with log/context/http/orm/jobs

This should depend on the observability contracts, not define the entire
observability model by itself.

### `@rootware/audit`

Purpose:

- audit log contract
- actor/action/resource model
- admin action tracking
- moderation action tracking
- security-sensitive event history

Example:

```ts
await audit.record({
  actorId: user.id,
  action: "course.published",
  resource: ["course", courseId],
});
```

Audit is highly useful for admin panels, moderation systems, CRMs, course
platforms, and paid content systems.

---

## 12. Framework Adapters

Rootware should integrate with frameworks rather than replace them.

Potential packages:

```txt
@rootware/hono
@rootware/fresh
@rootware/oak
@rootware/effect
@rootware/express
@rootware/fastify
@rootware/elysia
```

Priority:

```txt
Wave 1:
  @rootware/hono
  @rootware/fresh

Wave 2:
  @rootware/oak
  @rootware/effect

Wave 3:
  @rootware/express
  @rootware/fastify
  @rootware/elysia
```

Rules:

- `@rootware/http` does not depend on any framework.
- Framework adapters depend on `@rootware/http`.
- Hono and Fresh are the first serious targets.
- Rootware remains the substrate; the framework remains the framework.

### Hono adapter

Purpose:

- request context middleware
- request logger middleware
- error handler
- session middleware
- health route helper
- route testing helpers

Example direction:

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

### Fresh adapter

Purpose:

- middleware integration
- SSR-safe request context
- session helpers
- error mapping
- form/action helpers later
- state integration

Example direction:

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

---

## 13. Infrastructure Adapters

Infrastructure adapters implement contracts. They do not define them.

Potential packages:

```txt
Database:
  @rootware/postgres
  @rootware/sqlite
  @rootware/libsql
  @rootware/turso
  @rootware/neon

Cache:
  @rootware/cache-redis
  @rootware/cache-deno-kv

Storage:
  @rootware/storage-fs
  @rootware/storage-s3
  @rootware/storage-r2

Jobs:
  @rootware/jobs-postgres
  @rootware/jobs-deno-kv
  @rootware/jobs-redis

Messaging:
  @rootware/messaging-nats
  @rootware/messaging-kafka
  @rootware/messaging-rabbitmq
```

Rules:

- adapters depend on contracts
- contracts never depend on adapters
- adapters should be optional
- adapter packages can carry vendor-specific dependencies
- adapter packages should preserve Rootware errors, logging, context, and
  testing conventions

Adapter package example:

```txt
@rootware/cache-redis -> @rootware/cache
@rootware/storage-s3  -> @rootware/storage
@rootware/jobs-postgres -> @rootware/jobs
@rootware/postgres -> @rootware/orm
```

---

## 14. Tooling Layer

Potential packages:

```txt
@rootware/cli
@rootware/create
@rootware/doctor
@rootware/dev
@rootware/codegen
```

Tooling should come after package contracts stabilize. Tooling built too early
tends to freeze bad abstractions.

### `@rootware/create`

Purpose:

- scaffold new Rootware apps
- choose framework adapter
- choose database
- choose session/cache/storage setup
- generate minimal examples

Example:

```bash
deno run -A jsr:@rootware/create app
```

### `@rootware/cli`

Purpose:

- package commands
- migration commands
- job commands
- diagnostics shell
- project inspection

Example:

```bash
rootware migrate
rootware jobs work
rootware doctor
```

### `@rootware/doctor`

Purpose:

- Deno version checks
- JSR package version checks
- permissions checks
- env validation
- database connectivity
- migration state
- adapter diagnostics
- common runtime issue detection

This could become one of Rootware's strongest DX packages.

### `@rootware/dev`

Purpose:

- local development workflow
- process supervision
- log formatting
- local services
- reload helpers
- integration with examples

Given Deno watch/runtime constraints, this package should be designed carefully
and only after actual dev workflow pain is understood.

### `@rootware/codegen`

Purpose:

- schema-based code generation
- route/client generation
- OpenAPI generation hooks
- migration generation support

This should not arrive before schema, ORM, HTTP, and OpenAPI conventions are
stable.

---

## 15. Domain and Vertical Extensions

These packages are not core infrastructure. They are optional accelerators for
common product categories.

Potential packages:

```txt
@rootware/upload
@rootware/media
@rootware/moderation
@rootware/reporting
@rootware/trust
@rootware/billing
```

### `@rootware/upload`

Purpose:

- multipart upload helpers
- file validation
- storage integration
- signed upload flows
- upload sessions
- progress metadata

Useful for Doomscrollr, Quire, and most content apps.

### `@rootware/media`

Purpose:

- media metadata
- thumbnail workflows
- audio/video processing hooks
- storage integration
- job integration

This should likely be an integration layer around external tools rather than a
full media processing engine.

### `@rootware/moderation`

Purpose:

- content status
- report queues
- moderator actions
- appeal workflow
- policy metadata
- audit integration

Useful for social apps and community platforms.

### `@rootware/reporting`

Purpose:

- user reports
- abuse reports
- admin review queues
- moderation workflow integration

### `@rootware/trust`

Purpose:

- user trust levels
- rate limit modifiers
- reputation signals
- abuse prevention hooks

### `@rootware/billing`

Purpose:

- billing abstraction
- provider adapters
- invoices
- payments
- webhooks
- entitlements integration

Billing should not be early. A safer earlier package is
`@rootware/entitlements`, because access control is useful even before payment
providers exist.

---

## 16. Product Proof Applications

Rootware needs real applications to prove the ecosystem.

Suggested proof apps:

```txt
minimal-api
hono-api
fresh-app
orm-migrate
jobs-worker
websocket-chat
doomscrollr-demo
quire-lite
church-crm-demo
```

### `minimal-api`

Purpose:

- prove errors/env/log/http coherence
- smallest possible useful Rootware app

### `hono-api`

Purpose:

- prove Hono adapter
- request context middleware
- structured errors
- sessions
- health route

### `fresh-app`

Purpose:

- prove Fresh adapter
- SSR request context
- sessions
- form/action behavior
- frontend/backend integration

### `orm-migrate`

Purpose:

- prove schema + migrate + orm
- Postgres-first persistence
- migration history
- typed query surface

### `jobs-worker`

Purpose:

- prove jobs contract
- memory adapter
- Postgres adapter later
- retries and failure handling
- logging and context propagation

### `websocket-chat`

Purpose:

- prove ws/realtime later
- auth handshake
- presence
- rooms
- typed messages

### `doomscrollr-demo`

Purpose:

- prove content app needs
- uploads/storage
- moderation
- sessions
- jobs
- pagination
- social feed patterns

### `quire-lite`

Purpose:

- prove course/content platform needs
- storage
- media jobs
- entitlements
- audit
- uploads
- sessions

### `church-crm-demo`

Purpose:

- prove modular monolith needs
- people/households/connections
- audit
- permissions
- sessions
- search
- pagination

The proof apps should not be toy examples. They should be small, but
production-shaped.

---

## 17. Expansion: Horizons and Gates

Rootware grows along two dimensions, and they answer different questions.

- **Gates** are the rule. Each one is a checkable precondition: _are we allowed
  through this door yet?_ Gates are normative — nothing past them is built until
  they are cleared.
- **Horizons** are the map. Each one is a thematic phase of maturity: _where are
  we in the arc, and what comes next?_ Horizons are descriptive — a legible
  projection of the gates, not a second system.

A horizon is entered by clearing its gate(s). Where a horizon and a gate appear
to disagree, the gate governs — the same precedence `VISION.md` holds over this
document.

One caveat the table cannot show: horizons read as a sequence, but the gates
allow parallelism. A horizon's number is its theme, not a strict serialization.
The expanded framework adapters (Horizon 5) become available the moment Gate E
clears, even though their horizon number is high. The gate is the true unlock;
the horizon is the arc.

### Horizons

| Horizon                     | What it adds                                                                                      | Gate(s) to enter                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **0 — Core**                | The twelve packages + the coherence slice                                                         | — (defined in `VISION.md`; precondition for everything) |
| **1 — Composition**         | Kernel: `app`, `context`, `lifecycle`, `plugin`. First adapters: `hono`, `fresh`                  | Gate A, then the **Composition Gate**                   |
| **2 — Persistence & State** | `seed`, `pagination`; database adapters; cache & storage adapters; `rate-limit`                   | Gate B and Gate C                                       |
| **3 — Async Expansion**     | `events`, `queue`, `scheduler`, `messaging` (by decomposition); jobs & messaging adapters         | Gate D                                                  |
| **4 — Operations**          | `health`, `metrics`, `tracing`, `otel`, `audit`; `auth`, `rbac`, `csrf`, `crypto`, `entitlements` | Gate F                                                  |
| **5 — Reach**               | Remaining framework adapters: `oak`, `effect`, `express`, `fastify`, `elysia`                     | Gate E                                                  |
| **6 — Tooling**             | `cli`, `create`, `doctor`, `dev`, `codegen`                                                       | Contracts stable (≥ Horizon 2)                          |
| **7 — Vertical**            | `upload`, `media`, `moderation`, `reporting`, `trust`, `billing`                                  | **Gate G**                                              |

`upload` is the seam between Horizon 2 and Horizon 7: the storage-integration
primitive can land at Horizon 2 under Gate C, while the higher-level vertical
accelerators wait for Gate G. Build the primitive early if storage needs it;
hold the opinionated workflow until the pattern is proven.

### The Gates

Gates are listed in logical order. Each names the horizon it admits.

#### Gate A — Coherence Slice Proven · _admits Horizon 1_

Required before any new public package beyond the twelve:

- `errors`/`env`/`log`/`context`/`http` are wired together
- at least one real app uses the slice
- request IDs flow through logs
- errors map to HTTP responses
- env controls logger/HTTP behavior
- tests are easy to write
- the result feels materially better than manual assembly

#### Composition Gate — _admits the kernel within Horizon 1_

This gate is new. The kernel had no gate in the original list, yet everything in
the mature-DX example depends on it. It exists to ensure the kernel is _earned_,
not anticipated:

- the coherence slice (Gate A) is proven
- the same wiring — env, logger, context, error mapping — has been
  hand-assembled in more than one real app
- the repetition, not the anticipation, is what motivates the abstraction
- the lower primitives are API-stable enough that a composition layer will not
  thrash

Unlocks, in order: `@rootware/context` (public), `@rootware/lifecycle`,
`@rootware/app`, then `@rootware/plugin` last (per §18). Framework adapters
`hono` and `fresh` are built against the app definition once it exists; clearing
them is Gate E.

#### Gate B — Data Core Proven · _admits the data half of Horizon 2_

Required before data expansion:

- `schema` is stable enough for `orm` and `migrate`
- `migrate` can track history and apply migrations
- `orm` has a working Deno-native driver/pool
- a real app uses `schema` + `migrate` + `orm` together

Unlocks: `seed`, `pagination`, database adapters.

#### Gate C — State Core Proven · _admits the state half of Horizon 2_

Required before state expansion:

- the `cache` contract works
- the `storage` contract works
- `session` uses the contracts
- memory adapters are stable
- one real app uses `session`/`cache`/`storage` together

Unlocks: cache adapters, storage adapters, `rate-limit`, the `upload` primitive.

#### Gate D — Async Core Proven · _admits Horizon 3_

Required before async expansion:

- `jobs` has named jobs, retries, delayed execution, worker lifecycle
- the memory adapter works
- Postgres adapter pressure is real
- one real app uses `jobs` for actual background work

Unlocks: `events`, `queue`, `scheduler`, `messaging`, jobs adapters.

#### Gate E — Framework Integration Proven · _admits Horizon 5_

Required before broad adapter expansion:

- the Hono adapter works naturally
- the Fresh adapter works naturally
- Rootware does not leak framework-specific assumptions into `@rootware/http`

Unlocks: `oak`, `effect`, `express`, `fastify`, `elysia`.

#### Gate F — Production Operation Proven · _admits Horizon 4_

Required before observability/security expansion:

- `lifecycle` exists
- health checks have real dependencies
- logs and context are stable
- jobs and database emit useful structured events

Unlocks: `health`, `metrics`, `tracing`, `otel`, `audit`, `auth`, `rbac`.

#### Gate G — Vertical Extraction · _admits Horizon 7_

This gate is new. The vertical layer (§15) had no gate, and it is the layer most
at risk of pulling Rootware from substrate into framework. It is the strictest
gate for that reason:

- the pattern — upload flow, moderation queue, trust signal, and so on — has
  been implemented in **at least two proof apps**
- the implementations were similar enough that a shared package would have
  helped rather than constrained
- the package can stay app-neutral, or the opinion it encodes is one you are
  willing to make canonical
- it does not pull Rootware across the line from substrate into framework

Vertical packages are extractions from the proof apps, never speculative
greenfield. A vertical package with no two-app precedent does not pass this
gate.

---

> Gates govern. Horizons describe. The twelve-package core is Horizon 0, and no
> later horizon begins until the gate in front of it is clear.

## 18. Package Split Rules

Rootware should resist premature package splitting.

A new package should be split out only when at least two of these are true:

- the current package has two clearly different audiences
- the dependency graph would improve
- the implementation requires optional vendor dependencies
- the API surface is becoming confusing
- the feature is useful independently
- the feature has a different release cadence
- the feature has different stability risk
- real users are asking for it separately

Examples:

### `@rootware/fetch`

Split from `@rootware/http` only if client behavior grows beyond small helpers.

### `@rootware/queue`

Split from `@rootware/jobs` only if queue transport becomes independently
useful.

### `@rootware/scheduler`

Split from `@rootware/jobs` only if scheduling becomes large and distinct.

### `@rootware/context`

May begin internal. Publish only when multiple packages need direct public
access.

### `@rootware/app`

Do not publish until manual composition becomes repetitive and the lower APIs
have stabilized.

### `@rootware/plugin`

Do not publish until app composition exists and at least three real
plugins/adapters need a common contract.

---

## 19. Dependency Direction for the Future

The future ecosystem must preserve the same dependency law:

```txt
foundation
  ↓
kernel
  ↓
web / data / state / async / security / observability
  ↓
adapters
  ↓
tooling / examples
```

Examples of correct dependency direction:

```txt
@rootware/hono            -> @rootware/http
@rootware/fresh           -> @rootware/http
@rootware/postgres        -> @rootware/orm
@rootware/cache-redis     -> @rootware/cache
@rootware/storage-s3      -> @rootware/storage
@rootware/jobs-postgres   -> @rootware/jobs
@rootware/rate-limit      -> @rootware/cache + @rootware/http
@rootware/auth            -> @rootware/session + @rootware/http
@rootware/audit           -> @rootware/log + @rootware/context
```

Examples of bad dependency direction:

```txt
@rootware/http       -> @rootware/hono
@rootware/cache      -> @rootware/cache-redis
@rootware/storage    -> @rootware/storage-s3
@rootware/jobs       -> @rootware/jobs-postgres
@rootware/orm        -> @rootware/postgres
@rootware/testing    -> @rootware/cache
@rootware/errors     -> @rootware/http
```

If a package would require bad dependency direction, the package design is
wrong.

---

## 20. Long-Term Developer Experience

A mature Rootware application can eventually look like this:

```ts
import { defineApp } from "@rootware/app";
import { honoAdapter } from "@rootware/hono";
import { postgresPlugin } from "@rootware/postgres";
import { sessionPlugin } from "@rootware/session";
import { jobsPlugin } from "@rootware/jobs";
import { healthPlugin } from "@rootware/health";

const app = defineApp({
  env,
  logger,
  plugins: [
    postgresPlugin(),
    sessionPlugin(),
    jobsPlugin(),
    healthPlugin(),
  ],
});

export default honoAdapter(app);
```

But users should also be able to start much smaller:

```ts
import { createLogger } from "@rootware/log";

const log = createLogger();

log.info({ userId }, "user created");
```

Then adopt more:

```ts
import { defineEnv } from "@rootware/env";
import { RootwareError } from "@rootware/errors";
import { createLogger } from "@rootware/log";
```

Then:

```ts
import { mapErrorToResponse } from "@rootware/http";
import { runWithContext } from "@rootware/context";
```

Then:

```ts
import { defineSchema } from "@rootware/schema";
import { migrate } from "@rootware/migrate";
import { createDb } from "@rootware/orm";
```

The adoption path must stay incremental.

Rootware should never require a user to adopt the whole ecosystem just to use
one package.

---

## 21. Long-Term Success Criteria

The future ecosystem succeeds if:

- Rootware remains modular but feels coherent.
- Packages can be adopted incrementally.
- Framework adapters feel native.
- Infrastructure adapters do not leak into contracts.
- Request context ties together HTTP, logs, ORM, jobs, sessions, and audit.
- Production diagnostics are built in, not bolted on.
- Real apps use the packages together.
- The ecosystem avoids npm compatibility tax where that tax is material.
- The public namespace remains disciplined and predictable.
- The active package count grows only when real pressure justifies it.

It fails if:

- the future roadmap becomes a permission slip for scope creep
- packages are published before they are needed
- adapters leak into contracts
- the plugin system arrives before composition pressure exists
- the ORM becomes a Drizzle-parity project
- jobs splits into five packages without real users
- examples are toy demos instead of production-shaped apps
- Rootware becomes a namespace full of half-finished 0.x packages

---

## 22. Final Direction

Rootware begins with twelve packages.

It can eventually become a broad backend ecosystem.

The correct path is not to build the future all at once. The correct path is to
let each future layer emerge when the current layer creates real pressure for
it.

The future is:

```txt
foundation -> kernel -> web/data/state/async -> adapters -> tooling -> vertical extensions
```

But the immediate path remains:

```txt
errors -> env -> log -> context prototype -> http -> coherence slice -> schema -> orm -> migrate -> cache -> storage -> session -> jobs
```

This document preserves the destination.

`VISION.md` protects the focus.

Together, they keep Rootware ambitious without letting it become unfocused.
