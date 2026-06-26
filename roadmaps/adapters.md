# Rootware Adapters and Integrations Roadmap

## Status

Rootware has a `v0.1` package foundation. Adapter packages should remain
secondary until the relevant core package contracts are stable.

Last reviewed: `2026-06-26`

## Product thesis

Rootware adapters are thin integration packages that connect Rootware core
contracts to frameworks, runtimes, databases, storage providers, identity
providers, mail providers, billing providers, and observability systems.

They exist because Rootware should not compete with frameworks or providers. It
should make them easier to use together.

One-line strategy:

> Rootware adapters make existing Deno/JSR tools production-complete without
> polluting core packages with provider dependencies.

## Canonical adapter naming

Preferred names:

```txt
@rootware/hono
@rootware/otel
@rootware/neon
@rootware/postgres
@rootware/sqlite
@rootware/libsql
@rootware/turso
@rootware/resend
@rootware/s3
@rootware/clerk
@rootware/stripe
```

A subpath strategy is acceptable only when the external dependency is genuinely
tiny and central. Hono is **not** such a case and a `@rootware/log/hono` subpath
is explicitly rejected: Hono middleware lives in the dedicated `@rootware/hono`
package (see below). This is settled — do not reintroduce a `@rootware/log/hono`
subpath.

The default is separate adapter packages once dependencies become meaningful.

## Adapter layering

```txt
Core package -> adapter contract -> provider/framework adapter -> application
```

Examples:

```txt
@rootware/log -> @rootware/hono
@rootware/orm -> @rootware/neon
@rootware/storage -> @rootware/s3
@rootware/session -> @rootware/clerk
@rootware/http -> provider clients
```

## Adapter rules

Core packages must not import adapters.

Adapters may import:

- Core Rootware packages.
- Their target external framework/provider.

Adapters must not:

- Create circular dependencies.
- Hide important provider limitations.
- Pull provider dependencies into the core package.
- Become full frameworks.
- Reimplement provider SDKs unnecessarily if a clean `fetch` adapter is enough.

## Phase 1 — Foundation integrations

### @rootware/hono

Purpose:

- Error handling middleware.
- Request logging middleware.
- Session actor context.
- Request ID context.
- Optional env/log integration.

Depends on:

- `@rootware/errors`
- `@rootware/log`
- `@rootware/session` once stable
- Hono

This is the **single home** for Hono middleware. Because Hono is a meaningful
external dependency, it belongs in this separate package rather than a
`@rootware/log/hono` subpath. `log.md` agrees: its request-logging section
points Hono middleware here, not to a `log` subpath. The request-logging
middleware is folded into `@rootware/hono` so there is exactly one place Hono
integration lives. This is settled.

### @rootware/otel

Purpose:

- Correlate logs, HTTP, ORM queries, migrations, and jobs.
- Provide conventions before full instrumentation.

Depends on:

- `@rootware/log`
- `@rootware/http`
- `@rootware/orm`
- `@rootware/jobs` as they stabilize.

### @rootware/neon

Purpose:

- Serverless Postgres adapter for ORM/migrate.
- Deno Deploy + Neon examples.
- Query logging and env examples.

Depends on:

- `@rootware/orm`
- `@rootware/migrate`
- `@rootware/env`
- `@rootware/log`

## Phase 2 — Production app integrations

### @rootware/resend

Purpose:

- Transactional email boundary.
- Test mailbox support.
- Jobs integration for async delivery.
- Redacted logs.

Core relation:

- Should use `@rootware/http`.
- Should integrate with `@rootware/jobs`.

### @rootware/s3

Purpose:

- S3-compatible storage adapter.
- Cloudflare R2 compatibility.
- Signed URL support.
- Upload validation.

Core relation:

- Implements `@rootware/storage` adapter contract.

### @rootware/clerk

Purpose:

- Map Clerk identity/session to Rootware actor.
- Keep authorization boundary inside Rootware app code.
- Avoid making Clerk a hard dependency of `@rootware/session`.

Core relation:

- Implements an auth/session adapter.

## Phase 3 — Data adapters

### @rootware/postgres

Purpose:

- Native Postgres driver adapter for ORM/migrate.
- Local/server Postgres first.

### @rootware/sqlite

Purpose:

- Local SQLite adapter.
- Test DB.
- Local-first experiments.

### @rootware/libsql

Purpose:

- libSQL adapter.
- Turso-compatible local/remote behavior.

### @rootware/turso

Purpose:

- Turso-specific connection/config helpers.
- Deployment examples.

## Phase 4 — SaaS integrations

### @rootware/stripe

Purpose:

- Billing boundary.
- Webhook verification.
- Subscription event normalization.
- Jobs integration.

### @rootware/webhooks

Purpose:

- Shared webhook verification/idempotency/replay contract.
- Provider-specific subpackages or adapters.

### @rootware/ai

Purpose:

- Typed AI provider boundary.
- Redacted logs.
- Cost tracking.
- Test fake model.
- Jobs integration.

## Release roadmap

## v0.1.x — Adapter policy

- Document adapter rules.
- Decide separate package vs subpath criteria.
- Add examples showing adapter dependency isolation.

## v0.2.0 — Hono and OTel first

- Build `@rootware/hono` after errors/log/session are stable enough.
- Build `@rootware/otel` after log/http have hooks.

## v0.3.0 — Database adapters

- Neon/Postgres first.
- SQLite next.
- libSQL/Turso after migration and ORM contracts settle.

## v0.4.0 — Storage and mail

- S3/R2 adapter.
- Resend adapter.
- Testing helpers for provider fakes.

## v0.5.0 — Identity and billing

- Clerk adapter.
- Supabase auth adapter.
- Stripe adapter.
- Webhook layer.

## Product rule

Adapters should make Rootware feel integrated without making the core packages
heavy.
