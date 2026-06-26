# @rootware/session Product Plan

## Status

`@rootware/session` exists as part of the Rootware `v0.1` foundation.

This package should become the session and actor boundary for Rootware apps. It
is security-sensitive and should move slower than errors, env, log, testing,
HTTP, cache, and storage.

> **Current `v0.1` surface (reconciled with source).** Session is further along
> than "foundation" implies, and several items the version roadmap below
> schedules for `v0.3`/`v0.4` already ship. Present today:
> `createSessionManager` with `create`/`read`/`requireActor`/`destroy`, both
> `memorySessionStore` **and** `cacheSessionStore` (cache-backed sessions,
> listed under v0.3 below — already done), `createSessionId` using
> `crypto`-grade randomness, full cookie parse/serialize helpers,
> `safeSessionInfo`, `noopSessionManager`, `isSessionExpired`, and
> `refreshSession`. Secure cookie defaults are in place: `HttpOnly`, `Secure`,
> and `SameSite=Lax` by default. The version gates below were annotated so they
> no longer schedule `requireActor` or the cache store as future work.
>
> The genuine gaps remain **session rotation / fixation handling** and **CSRF**
> (neither is implemented), so those are the items the roadmap should actually
> drive. Design decision: based on the current code, `@rootware/session` is
> primarily a server-side opaque session-id manager. Stateless signed-cookie or
> JWT-like sessions are not owned by the current implementation and should not
> be added without an explicit product decision.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/session` is a JSR-native, Deno-first session package for backend
applications.

It exists because apps need a consistent current-user/current-actor boundary
without implementing cookie handling, session expiration, store adapters, and
test actors from scratch.

The package should provide:

- Session manager.
- Signed cookie conventions.
- Session store contract.
- Memory store for development/tests.
- Cache-backed store integration.
- Current actor helpers.
- Test actor support through `@rootware/testing`.
- Security-focused defaults.

One-line strategy:

> `@rootware/session` gives Deno backends a small, explicit session boundary
> that can sit above any identity provider.

## Canonical package

```ts
jsr:@rootware/session
```

Expected imports:

```ts
import { createSessionManager } from "@rootware/session";
```

Expected usage:

```ts
const sessions = createSessionManager({
  secret: env.SESSION_SECRET,
  store,
});

const actor = await sessions.requireActor(request);
```

## Rootware workspace fit

This package sits after:

- `@rootware/errors`
- `@rootware/env`
- `@rootware/log`
- `@rootware/cache`

### Runtime imports

- `@rootware/errors` — `SessionError` (value import).
- `@rootware/cache` — **type-only** (`CacheClient`), for the optional
  cache-backed store. The store instance is injected, so this is a build/type
  edge, not a runtime dependency.
- `@rootware/log` — **type-only** (optional audit `Logger`).

### Example / dev-only imports

- `@rootware/env` — examples only (session secret); not imported by the package.

### Disallowed dependencies

- `@rootware/orm` in the core.
- Identity provider SDKs in the core (Clerk etc. live in adapters).
- Framework adapters in the core.
- `@rootware/testing` in runtime code.

## Responsibilities

This package owns:

- Session lifecycle.
- Cookie parsing/serialization contract.
- Session store interface.
- Memory session store.
- Current actor contract.
- Expiration and rotation behavior.
- Security documentation.

This package does not own:

- Password authentication.
- OAuth provider flows.
- Full authorization/policy engine.
- User database schema.
- Provider-specific identity SDKs.
- CSRF framework in v0.2.

## Architecture

```txt
request cookies -> session token -> session store -> actor/session object -> app authorization
```

### 1. Session manager

Main API for creating, reading, refreshing, and destroying sessions.

### 2. Store boundary

Store can be memory, cache-backed, database-backed, or provider-backed.

### 3. Cookie boundary

Cookie behavior must be explicit and secure by default.

### 4. Actor boundary

The app should depend on an actor shape, not a provider-specific user object.

## Public contracts

### Session manager

```ts
export interface SessionManager<TActor = unknown> {
  create(actor: TActor, options?: CreateSessionOptions): Promise<Session>;
  read(request: Request): Promise<Session | undefined>;
  requireActor(request: Request): Promise<TActor>;
  destroy(request: Request): Promise<void>;
}
```

### Session store

```ts
export interface SessionStore<TSession = Session> {
  get(id: string): Promise<TSession | undefined>;
  set(
    id: string,
    session: TSession,
    options?: SessionStoreSetOptions,
  ): Promise<void>;
  delete(id: string): Promise<boolean>;
}
```

## Security and safety model

Rules:

- Secure cookie defaults.
- HttpOnly by default.
- SameSite Lax by default. Lax is the correct default here, not Strict: it keeps
  a user logged in when they follow a top-level link back into the app from an
  external context (the dogfood app's WhatsApp share-and-return loop is exactly
  this), while still blocking cookies on cross-site subrequests. Strict would
  break that loop.
- Because `SameSite=Lax` still allows cookies on top-level cross-site GET
  navigations, Lax alone does not fully prevent CSRF for any state-changing
  request. The package must either ship a CSRF defense (double-submit token or
  origin/sec-fetch checks) or document that state-changing routes must use a
  bearer token rather than relying on the cookie. This is currently unaddressed
  in code and is scheduled below; until it lands, cookie-session apps should not
  expose state-changing GETs and should add their own CSRF check at the
  framework layer.
- Explicit production secret requirement.
- Session IDs must be cryptographically random.
- Session fixation must be considered; rotate the session id on privilege change
  (login) once rotation lands.
- Rotation should be planned before v1.
- Memory store must not be recommended for production.

## Runtime targets

Primary:

- Deno local.
- Deno Deploy.
- JSR consumers.

Compatible by design:

- Bun.
- Node ESM.
- Workers.

## Non-goals before v1

- Full auth provider.
- Password storage.
- OAuth flow implementation.
- RBAC/ABAC policy engine.
- JWT validation for every provider.
- Stateless signed-cookie/JWT-like sessions until the package explicitly decides
  to own that model.
- CSRF framework in the first implementation.

## Release roadmap

## v0.1.x — Foundation cleanup

### Chunk 1 — Audit current package

Confirm current stubs and public API intent.

### Chunk 2 — Security review note

Document that session is security-sensitive and should not rush to v1.

### Chunk 3 — README skeleton

Show session manager concept without overpromising.

## v0.2.0 — Session contract and memory store

> **These already ship in `v0.1`.** Read the chunks below as verify, add tests,
> and document the existing implementation — not build from scratch, and do not
> replace the shipped code. All chunks 4–9 already ship; Chunk 10 (tests) is the
> remaining work in this milestone. The real new work is rotation/CSRF in v0.4.

### Chunk 4 — Verify Session type (ships in v0.1)

Verify the shipped Session shape (id, actor, createdAt, expiresAt, metadata).

### Chunk 5 — Verify store interface (ships in v0.1)

Verify the shipped `SessionStore` contract.

### Chunk 6 — Verify memory store (ships in v0.1)

Development/test only.

### Chunk 7 — Verify cookie utilities (ships in v0.1)

Parse and serialize session cookies.

### Chunk 8 — Verify create/read/destroy (ships in v0.1)

Basic session manager behavior.

### Chunk 9 — Verify SessionError (ships in v0.1)

Use `RootwareError`.

### Chunk 10 — Add tests

Cookie flags, expiration, destroy, missing session.

## v0.3.0 — Cache-backed sessions (largely shipped) — **done (`0.3.0`)**

`cacheSessionStore` already exists in `v0.1`. This milestone is documentation
and hardening, not new construction:

- **TTL ↔ `expiresAt` documented** — README explains the cache entry TTL is
  derived from the session's remaining lifetime, with a fallback to the store
  `ttlMs`/none, and that `expiresAt` is authoritative (`SessionManager.get`
  re-checks it). Covered by a TTL-derivation test using a recording cache.
- **`@rootware/cache` integration + non-durability caveats documented** — a
  session can vanish before `expiresAt` (eviction/flush/restart); prefix ≠
  isolation; use durable storage when sessions must survive.
- **Eviction-vs-expiry tests added** — a still-valid session evicted by a
  `maxEntries` cache resolves to a miss, and an already-expired session the
  cache still holds is resolved to `undefined` by the manager.

## v0.4.0 — Rotation, fixation, and CSRF — **done (`0.4.0`)**

`requireActor` and the actor contract already shipped, so this milestone closed
the genuine gaps:

- **Session id rotation** — `SessionManager.rotate(session, options?)` mints a
  fresh id, persists the record under it, and deletes the old id (so a fixed id
  is invalidated). It optionally applies actor/data/maxAge updates in the same
  step and takes an `idPrefix`; data is preserved by default. Call it on login
  and privilege change, then re-`commit` to set the new cookie.
- **CSRF defense (default for cookie sessions)** — origin validation **plus** a
  double-submit cookie token: `createCsrfToken()`, `createCsrfCookieHeader()`
  (deliberately non-`HttpOnly` so the client can echo it), `verifyCsrf(request)`
  / `assertCsrf(request)`, and `isSameOriginRequest()`. Safe methods pass;
  unsafe methods require a same-origin (or allow-listed)
  `Origin`/`Sec-Fetch-Site` and a cookie/header token match compared in constant
  time. Failures raise `SESSION_CSRF_INVALID` (403, exposed) with the reason.
- **Role/permission metadata** — predicates `actorHasRole`/`actorHasAnyRole`/
  `actorHasPermission`/`actorHasAllPermissions` and guards `assertActorRole`/
  `assertActorPermission` (throw `SESSION_FORBIDDEN`, 403) over the existing
  actor `roles`/`permissions` shape — no policy engine.

## v0.5.0 — Provider adapters

Possible adapters:

- Clerk.
- Supabase.
- Auth0.
- Custom JWT.

Adapters should be separate packages or subpaths.

## v1.0.0 — Stable session contract

- Freeze cookie defaults.
- Freeze store contract.
- Freeze actor boundary.
- Complete security review.

## Cross-package integrations

### @rootware/env

Session secret examples.

### @rootware/cache

Cache-backed session store.

### @rootware/log

Audit session lifecycle events without logging tokens.

### @rootware/testing

Test actors and fake session manager should live outside runtime core.

## First 10 implementation chunks

The session manager, stores (memory + cache), cookies, and `requireActor`
already ship in `v0.1`; start with verification and the security gaps.

1. Audit the published surface (`createSessionManager`, `memorySessionStore`,
   `cacheSessionStore`, `createSessionId`, cookie helpers, `SessionError`).
2. Verify the `Session` / `SessionStore` / `SessionManager` contracts.
3. Verify cookie parse/serialize and secure defaults (`HttpOnly` / `Secure` /
   `SameSite=Lax`).
4. Verify create / read / `requireActor` / destroy and expiration.
5. Verify the cache-backed store and its TTL semantics.
6. Implement session-id rotation on login (fixation defense — genuine gap).
7. Implement CSRF defense (double-submit token or origin / `Sec-Fetch-Site` —
   genuine gap).
8. Add role/permission metadata on the actor (no full policy engine).
9. Expand security docs.
10. Add the Hono actor-context example via `@rootware/hono`.

## Product rule

`@rootware/session` should be boring and conservative. Security-sensitive
packages earn trust by doing less, correctly.
