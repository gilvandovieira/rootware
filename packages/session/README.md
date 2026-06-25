# @rootware/session

Session and actor boundary primitives for Rootware packages and Deno backends.

Status: experimental / early development.

## Import

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

## API Summary

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

## Limitations

This package is not a full authentication provider. It does not implement OAuth,
JWT, encrypted cookies, CSRF, RBAC, or framework middleware yet.

[Back to Rootware](../../README.md)
