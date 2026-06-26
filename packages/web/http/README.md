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

## Integration hooks (`0.4`)

`hooks` observe the request lifecycle without touching the request. They are
awaited but isolated — a throwing or rejecting hook can never fail the request —
and receive only safe metadata (a stable `requestId`, method, redacted URL,
attempt, status, duration; never a body). This is the seam tracing, metrics, and
audit adapters build on:

```ts
// OpenTelemetry-style span adapter (sketch).
const spans = new Map<string, Span>();
const api = createHttpClient({
  baseUrl: "https://api.example.com",
  hooks: {
    onRequest: (c) => spans.set(c.requestId, tracer.startSpan(c.method, c.url)),
    onResponse: (c) => spans.get(c.requestId)?.end({ status: c.status }),
    onError: (c) => spans.get(c.requestId)?.recordError(c.error),
  },
});
```

`requestId` is stable across retries, so one span covers a logical request.

### Response cache hook (`0.4`)

Pass a `cache` implementing `HttpResponseCache` to short-circuit safe requests.
The HTTP client consults it for `GET`/`HEAD` only, never caches an
`Authorization`-bearing request, and stores only `2xx` responses — the cache
owns freshness/TTL and storage (wire it to an `@rootware/cache` store):

```ts
const store = new Map<string, Response>();
const api = createHttpClient({
  baseUrl: "https://api.example.com",
  cache: {
    get: (key) => store.get(key),
    set: (key, res) => void store.set(key, res),
  },
});
// A cache hit is reported to onResponse with `fromCache: true` and skips fetch.
```

Cache read/write failures degrade gracefully to a normal request.

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
- Types: `HttpHooks`, `HttpRequestContext`, `HttpResponseContext`,
  `HttpRetryContext`, `HttpErrorContext`, `HttpResponseCache`

## Security

Request bodies and sensitive headers are not logged. URLs are redacted before
entering logs and error details.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package does not implement OAuth, cookie jars, or circuit breakers. It does
not ship an OpenTelemetry exporter — instead it exposes `hooks` (`0.4`) as the
contract a tracing/metrics adapter plugs into.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
