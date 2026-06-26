# @rootware/cache Product Plan

## Status

`@rootware/cache` exists as part of the Rootware `v0.1` foundation.

This package should become the runtime-neutral cache abstraction for Rootware
apps and higher-level packages.

> **Current `v0.1` surface (reconciled with source).** The shipped client is
> `CacheClient` (not `Cache`) and already includes `has()` and `getOrSet()` —
> the latter scheduled as v0.2 work below but already present. It also ships
> `createCache`, `memoryCacheStore`, `createNamespacedCache`, key/ttl helpers,
> and `noopCache`. The store layer (`CacheStore`) returns a `CacheEntry<T>`
> envelope, so a cache **miss** is distinguishable from a stored
> `undefined`/`null` value even though `CacheClient.get` flattens to
> `T | undefined` (use `has()` when the distinction matters). In this alignment
> pass `getOrSet` gained single-process per-key in-flight de-duplication for
> concurrent misses. This is not a distributed lock. The public contract below
> was corrected to match these names.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/cache` is a JSR-native, Deno-first cache abstraction.

It exists because applications need cache semantics that work locally, in tests,
and in production without hard-coding Redis, Deno KV, or a database table into
application code.

The package should provide:

- Small cache interface.
- Memory adapter.
- TTL support.
- Namespacing.
- Serialization boundary.
- Optional stampede protection.
- Test-friendly behavior.
- Future adapters for Redis, Deno KV, Postgres, SQLite, and edge stores.

One-line strategy:

> `@rootware/cache` gives Deno backends one stable cache contract across memory,
> edge, Redis, and database-backed adapters.

## Canonical package

```ts
jsr:@rootware/cache
```

Expected imports:

```ts
import { createCache } from "@rootware/cache";
```

Expected usage:

```ts
const cache = createCache(); // memory store by default

await cache.set("post:123", post, { ttlMs: 60_000 });
const cached = await cache.get<Post>("post:123");
```

## Rootware workspace fit

This package sits after:

- `@rootware/errors`
- `@rootware/env`
- `@rootware/log`

### Runtime imports

- `@rootware/errors` — `CacheError` (value import).
- `@rootware/log` — **type-only** (optional injected `Logger`).

### Example / dev-only imports

- `@rootware/env` — examples only (adapter config); not imported by the package.

### Disallowed dependencies

- Redis/Deno KV/Postgres drivers in the core.
- `@rootware/testing` in runtime code.
- `@rootware/session` — session depends on cache, not the reverse.
- `@rootware/jobs` — jobs use cache via an adapter, not the reverse.

## Responsibilities

This package owns:

- Cache interface.
- Memory adapter.
- TTL semantics.
- Cache key conventions.
- Serialization hooks.
- Namespaces.
- Optional get-or-set helper.

This package does not own:

- Session security.
- Rate limiting product.
- Queue/job durability.
- Database migrations for cache tables.
- External adapter dependencies in the core.

## Architecture

```txt
cache API -> key namespace -> serializer -> adapter -> ttl/cleanup behavior
```

### 1. Public API

Expose `CacheClient`, `CacheStore`, `createCache`, `memoryCacheStore`, and
helper operations.

### 2. Adapter boundary

Adapters should implement a minimal contract.

### 3. TTL boundary

TTL behavior must be documented per adapter because stores differ.

### 4. Serialization boundary

Core should not assume JSON is always correct for all values.

## Public contracts

### Cache client

```ts
export interface CacheClient {
  get<T = unknown>(
    key: string,
    options?: CacheGetOptions,
  ): Promise<T | undefined>;
  set<T = unknown>(
    key: string,
    value: T,
    options?: CacheSetOptions,
  ): Promise<void>;
  delete(key: string, options?: CacheDeleteOptions): Promise<boolean>;
  has(key: string): Promise<boolean>;
  getOrSet<T = unknown>(
    key: string,
    factory: () => T | Promise<T>,
    options?: GetOrSetOptions,
  ): Promise<T>;
}
```

`get` returns `T | undefined`. Because `undefined` is itself a storable
`CacheValue`, `get` alone cannot tell a miss from a stored `undefined`; use
`has()` for that. The underlying `CacheStore` returns a
`CacheEntry<T> | undefined` envelope so adapters preserve the distinction
internally.

### Options

```ts
export interface CacheSetOptions {
  ttlMs?: number;
}
```

## Security and safety model

Rules:

- Cache keys should not contain raw secrets.
- Values may contain sensitive data; docs must warn users about adapter
  persistence.
- Memory cache is not durable and not distributed.
- TTL semantics must not be presented as security guarantees.
- Session package must add its own security layer.

## Runtime targets

Primary:

- Deno local.
- Deno Deploy.
- JSR consumers.

Compatible by design:

- Bun.
- Node ESM.
- Workers for memory adapter.

## Non-goals before v1

- Redis adapter in the core.
- Distributed locks.
- Full rate limiter.
- Persistent cache table migrations.
- Cache invalidation framework.
- LRU tuning beyond simple memory safety.

## Release roadmap

## v0.1.x — Foundation cleanup

### Chunk 1 — Audit current package

Confirm current stubs and package boundaries.

### Chunk 2 — Define cache contract

Stabilize `CacheClient`, `CacheStore`, and TTL options.

### Chunk 3 — Add README skeleton

Show memory cache and get-or-set examples.

## v0.2.0 — Memory cache spine

> Most of this milestone already ships in `v0.1`: the memory adapter
> (`memoryCacheStore`), TTL handling, the namespace helper
> (`createNamespacedCache`), `getOrSet`, and `CacheError` all exist. Treat the
> chunks below as verify-and-test for those, and focus new effort on the
> serialization contract (Chunk 8) and adapter readiness (v0.3).

### Chunk 4 — Verify memory adapter (ships in v0.1)

Verify `createCache` / `memoryCacheStore`.

### Chunk 5 — Verify TTL (ships in v0.1)

Support expiration on read and optional cleanup.

### Chunk 6 — Verify namespace helper (ships in v0.1)

Support `cache.namespace("feed")`.

### Chunk 7 — Verify get-or-set (ships in v0.1, hardened in alignment pass)

Support per-key in-flight promise de-duplication for a single process. Future
adapter work can add optional lock timeouts or distributed coordination where
supported.

### Chunk 8 — Implement serialization contract

Define serializer API even if memory adapter stores raw values.

### Chunk 9 — Verify CacheError (ships in v0.1)

Use `RootwareError`.

### Chunk 10 — Add tests

Test TTL, delete, clear, namespace, and get-or-set.

## v0.3.0 — Adapter readiness — **done (`0.3.0`)**

- **Redis adapter contract** — `RedisLikeClient` + `RedisCacheAdapterOptions`
  (serialized string entries, per-key `PX` TTL, `SCAN` for keys/clear).
- **Deno KV adapter contract** — `DenoKvLike` + `DenoKvCacheAdapterOptions`
  (key-tuple mapping, `expireIn` TTL, `list({ prefix })`).
- **Database-backed constraints** — documented in the README
  (`(key, value,
  expires_at)` rows, read-time filter + periodic sweep,
  miss-on-expired race).
- **Distributed caveats** — documented (single-process memory store,
  namespace-as-prefix, stampede behavior, global `clear`).
- **Optional lock timeout semantics** — `CacheStore.acquireLock` +
  `CacheLock`/`CacheLockOptions` and `getOrSet({ lockTimeoutMs })`: a store that
  can lock gets a double-checked, cross-process single-compute path; the
  in-memory store omits it and keeps in-process dedup. Covered by tests with a
  fake locking store.

The concrete Redis/KV/SQL drivers stay deferred — they require live services and
are not CI-testable under the no-network rule — but the contracts and the
lock-aware `getOrSet` they plug into now ship.

## v0.4.0 — Rate-limit integration — **done (`0.4.0`)**

- **`fixedWindowRateLimiter({ limit, windowMs })`** and
  **`tokenBucketRateLimiter({ capacity, refillTokens, refillIntervalMs })`** —
  counter-based limiters over the `CacheStore` contract (default in-memory; pass
  a distributed store to share state). Each returns a `RateLimiter` with
  `consume(key, cost?)`, `peek(key)`, and `reset(key)`, and a `RateLimitResult`
  (`allowed`, `limit`, `remaining`, `resetAt`, `retryAfterMs`) shaped for
  `RateLimit-*`/`Retry-After` headers. An injectable `now` clock keeps the
  limiters deterministic in tests.
- **Correctness** — operations on the same key are serialized in-process (a
  keyed mutex), so concurrent `consume` calls never over-admit within one
  isolate; cross-process correctness still requires an atomic backing store
  (documented). TTL is set so idle keys expire (window end / full-refill time).
- **Kept out of the core surface** — these are opt-in functions a future
  `@rootware/rate-limit` or `@rootware/session` layer can consume; they do not
  change `CacheClient`/`CacheStore` or make rate limiting implicit.

## v1.0.0 — Stable cache contract

- Freeze cache API.
- Freeze TTL semantics.
- Freeze namespace semantics.

## Cross-package integrations

### @rootware/session

Session store may use cache adapter.

### @rootware/jobs

Jobs may use cache for coordination, but not for durability without explicit
docs.

### @rootware/http

HTTP client may use cache through explicit option later.

## First 10 implementation chunks

The memory cache already ships in `v0.1`; start with verification and the
serialization contract.

1. Audit the published surface (`createCache`, `memoryCacheStore`, `has`,
   `getOrSet`, `createNamespacedCache`, `CacheError`).
2. Verify the `CacheClient` / `CacheStore` contracts and the `CacheEntry`
   envelope (miss vs stored `undefined`).
3. Verify memory adapter + TTL (expiry on read).
4. Verify the namespace helper.
5. Verify `getOrSet` single-process stampede safety and rejection cleanup.
6. Implement the serialization contract (the genuine gap; memory stores raw
   values).
7. Verify `CacheError`.
8. Define the Redis / Deno KV / DB-backed adapter contracts (v0.3).
9. Document distributed caveats and that TTL is not a security guarantee.
10. Expand tests and examples.

## Product rule

`@rootware/cache` should be a contract first and an adapter collection second.
