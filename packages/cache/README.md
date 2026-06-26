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
- `jsonCacheSerializer` / `CacheSerializer`

The memory store keeps raw values. Out-of-process adapters (Redis, KV) use a
`CacheSerializer` — `jsonCacheSerializer()` is the default — to convert values
to and from a string wire format.

## Security

Cache operations log keys and operations only. Values are not included in logs
or error details.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package ships memory and noop primitives only. Distributed adapters such as
Redis, Deno KV, and SQL stores are future work.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
