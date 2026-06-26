# @rootware/http

Production-safe fetch wrapper for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { createHttpClient } from "jsr:@rootware/http";
```

## Example

```ts
const api = createHttpClient({
  baseUrl: "https://api.example.com",
  timeoutMs: 5000,
  retry: { attempts: 3, backoffMs: 250 },
});

const user = await api.getJson<{ id: string }>("/users/u_123");
```

## Hardening (`0.3`)

```ts
const api = createHttpClient({
  baseUrl: "https://api.example.com",
  timeoutMs: 5000,
  maxResponseBytes: 1_000_000, // reject bodies larger than 1 MB
  retry: {
    attempts: 3,
    backoffMs: 250, // exponential: 250, 500, 1000...
    maxBackoffMs: 2000, // caps the delay (and any Retry-After)
    jitter: true, // full jitter in [0, capped] (default)
    respectRetryAfter: true, // honor Retry-After on 429/503 (default)
  },
});
```

- **Retry delay** is exponential (`backoffMs * 2^(attempt-1)`) capped at
  `maxBackoffMs`, with full jitter by default. A server `Retry-After` header
  (delta-seconds or HTTP-date) takes precedence but is still bounded by
  `maxBackoffMs`, so a hostile header cannot pin the client. `computeRetryDelay`
  and `parseRetryAfter` are exported and pure for testing.
- **Response size limits** — `maxResponseBytes` streams the body and fails with
  `HTTP_RESPONSE_TOO_LARGE` (rejecting early on `Content-Length`) instead of
  buffering an oversized body. Applies to JSON bodies and structured error
  bodies alike.
- **Error classification** — `AbortSignal.timeout` (`TimeoutError`) maps to
  `HTTP_TIMEOUT`, caller aborts to `HTTP_ABORTED` (with the abort reason in
  details), network failures to `HTTP_NETWORK_ERROR`.

### Logging hook ordering

When a `logger` is injected, the request lifecycle emits, in this guaranteed
order: `http request started` (debug) → zero or more `http request retrying`
(warn, one per retry, with `attempt` and `delayMs`) → exactly one terminal
`http request completed` (debug) or `http request failed` (error). Logging
failures never affect the request.

### Redaction policy

The internal sensitivity policy is exposed as `isSensitiveHttpName(name)`: a
name is sensitive if it is a known credential header (`authorization`, `cookie`,
`set-cookie`, `x-api-key`, `proxy-authorization`) or contains `token`, `secret`,
`password`, `private_key`, or `api_key`/`apikey`. It drives URL credential/query
redaction, error-body key redaction, and the `redactHttpHeaders` /
`redactHttpUrl` / `redactHttpJson` helpers you can call before logging your own
fields. Request bodies are never logged.

## API

- `createHttpClient`
- `request`
- `buildUrl`
- `mergeHeaders`
- `parseJsonResponse` (`{ maxBytes }`)
- `computeRetryDelay`, `parseRetryAfter`
- `redactHttpHeaders`, `redactHttpUrl`, `redactHttpJson`, `isSensitiveHttpName`
- `createMockFetch`
- `createJsonResponse`

## Security

Request bodies and sensitive headers are not logged. URLs are redacted before
entering logs and error details.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package does not implement interceptors, OAuth, cookie jars, circuit
breakers, or OpenTelemetry yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
