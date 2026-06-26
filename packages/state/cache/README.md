# @rootware/cache

Async-first cache abstraction for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { createCache, memoryCacheStore } from "jsr:@rootware/cache";
```

## Example

```ts
const cache = createCache({
  store: memoryCacheStore(),
  namespace: "app",
});

await cache.set("settings", { theme: "dark" }, { ttlMs: 60_000 });

const settings = await cache.get<{ theme: string }>("settings");
```

## API

- `createCache`
- `memoryCacheStore`
- `createNamespacedCache`
- `noopCache`
- `createCacheEntry`
- `normalizeCacheKey`
- `joinCacheKey`
- `CacheValue` (`unknown`; adapters may narrow through serializers)
- `jsonCacheSerializer` / `CacheSerializer`
- `CacheStore` / `CacheLock` / `CacheLockOptions` (adapter contracts)
- `RedisLikeClient` / `RedisCacheAdapterOptions`
- `DenoKvLike` / `DenoKvCacheAdapterOptions`
- `fixedWindowRateLimiter` / `tokenBucketRateLimiter` → `RateLimiter`,
  `RateLimitResult`

The memory store keeps raw values. Out-of-process adapters (Redis, KV) use a
`CacheSerializer` — `jsonCacheSerializer()` is the default — to convert values
to and from a string wire format.

## Adapter readiness (`0.3`)

An adapter implements `CacheStore`. The package ships the contracts a future
Redis/KV/SQL adapter conforms to, so the wiring is settled even though the
drivers (which need live services) are not bundled:

- **Redis** — implement `CacheStore` over a `RedisLikeClient`
  (`RedisCacheAdapterOptions`): store each entry as a serialized string with a
  per-key `PX` expiry from `CacheEntry.ttlMs`; back `keys`/`clear` with `SCAN`
  under `keyPrefix`.
- **Deno KV** — implement `CacheStore` over a `DenoKvLike`
  (`DenoKvCacheAdapterOptions`): map the cache key to a KV key tuple, use
  `expireIn` for TTL, and `list({ prefix })` for `keys`/`clear`.
- **Database-backed** — a SQL adapter stores `(key, value, expires_at)` rows.
  Constraints: TTL is enforced by an `expires_at` filter on read **and** a
  periodic sweep (the DB will not evict for you); `clear` is a prefix/`DELETE`;
  reads must tolerate a value whose `expires_at` has passed between the filter
  and the read (treat as a miss).

### Distributed caveats

The in-memory store is single-process and non-durable; `namespace` is a key
prefix, not isolation. Across processes, `getOrSet`'s in-process dedup does
**not** prevent a cache stampede. A store that can lock implements
`acquireLock`, and `getOrSet({ lockTimeoutMs })` then takes the lock,
double-checks the value, and computes at most once across nodes. `clear()` is
namespace-scoped when called on a namespaced client; stores support that either
through `deleteByPrefix` or by exposing `keys()` so the client can delete the
matching prefix safely.

## Rate limiting (`0.4`)

Two counter-based limiters build on the `CacheStore` contract (default
in-memory; pass a shared store for distributed limits):

```ts
import {
  fixedWindowRateLimiter,
  tokenBucketRateLimiter,
} from "jsr:@rootware/cache";

// 100 requests per minute per key.
const window = fixedWindowRateLimiter({ limit: 100, windowMs: 60_000 });
const { allowed, remaining, retryAfterMs } = await window.consume(clientIp);

// Burst up to 20, refilling 5 tokens/second.
const bucket = tokenBucketRateLimiter({
  capacity: 20,
  refillTokens: 5,
  refillIntervalMs: 1_000,
});
if (!(await bucket.consume(userId)).allowed) {
  // 429 with Retry-After…
}
```

Each returns a `RateLimiter` (`consume(key, cost?)`, `peek`, `reset`) and a
`RateLimitResult` (`allowed`, `limit`, `remaining`, `resetAt`, `retryAfterMs`)
shaped for `RateLimit-*`/`Retry-After` headers. Same-key operations are
serialized in-process, so concurrent `consume` calls don't over-admit within one
isolate; **cross-process** correctness requires an atomic backing store. TTL is
not a security guarantee.

## Security

Cache operations log keys and operations only. Values are not included in logs
or error details.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package ships memory and noop primitives only. Distributed adapters such as
Redis, Deno KV, and SQL stores are future work.

## Status

**Experimental.** The public API was audited and **frozen at `0.9`** to reduce
churn on the way to `1.0` — but until this package has real-world consumers it
stays experimental, so breaking changes remain possible **even at `1.0`**. The
version tracks roadmap progress, not a production-stability guarantee.

## License

MIT

[Back to Rootware](../../../README.md)
