# @rootware/session

Session and actor boundary primitives for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import {
  createSessionManager,
  memorySessionStore,
} from "jsr:@rootware/session";
```

## Example

```ts
const sessions = createSessionManager({
  store: memorySessionStore(),
  cookie: {
    name: "sid",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  },
});

const session = await sessions.create({
  actor: { id: "u_123", type: "user" },
});

const headers = new Headers();
sessions.commit(headers, session);
```

## API

- `createSessionManager`
- `memorySessionStore`
- `cacheSessionStore`
- `createSessionId`
- `parseCookieHeader`
- `serializeCookie`
- `noopSessionManager`

## Cache-backed sessions (`0.3`)

`cacheSessionStore(cache, options)` persists sessions through a
`@rootware/cache` client:

```ts
import { createCache, memoryCacheStore } from "jsr:@rootware/cache";
import { cacheSessionStore, createSessionManager } from "jsr:@rootware/session";

const cache = createCache({ store: memoryCacheStore() });
const sessions = createSessionManager({
  store: cacheSessionStore(cache, { prefix: "sess", ttlMs: 86_400_000 }),
});
```

### TTL vs `expiresAt`

Each session's cache entry TTL is **derived from the session's `expiresAt`** —
the remaining lifetime at write time. If a session has no `expiresAt` (or it has
already passed), the store falls back to the configured `ttlMs`, or no entry TTL
at all. Two layers therefore decide validity, and the session layer is
authoritative:

- **Cache TTL** is a best-effort eviction hint that bounds how long a backend
  _keeps_ the entry.
- **`expiresAt`** is the source of truth. `SessionManager.get` re-checks it on
  read, so an entry the cache still holds past its `expiresAt` resolves to
  `undefined` anyway.

### Non-durability caveats

A cache is not durable storage. A session can vanish before its `expiresAt` —
eviction (size/memory pressure), a flush, or a restarted in-memory backend all
drop entries — so treat a missing session as logged-out and re-authenticate. Use
a durable store (or a cache backed by durable storage) when sessions must
survive. `namespace`/`prefix` is a key prefix, not isolation.

## Security

Cookies store only the session id. Actor and session data stay server-side.
Cookies are `HttpOnly`, `Secure`, and `SameSite=Lax` by default.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package is not a full authentication provider. It does not implement OAuth,
JWT, encrypted cookies, CSRF, RBAC, or framework middleware yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
