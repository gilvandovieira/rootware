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

## Security

Cookies store only the session id. Actor and session data stay server-side.
Cookies are `HttpOnly`, `Secure`, and `SameSite=Lax` by default.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package is not a full authentication provider. It does not implement OAuth,
JWT, encrypted cookies, CSRF, RBAC, or framework middleware yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
