# @rootware/http Product Plan

## Status

`@rootware/http` exists as part of the Rootware `v0.1` foundation.

This package should become the production-safe `fetch` wrapper and
provider-client foundation for Rootware applications.

> **Current `v0.1` surface (reconciled with source).** Ships `createHttpClient`
> with `timeoutMs` and `retry` (`attempts`, `retryOnStatuses`,
> `retryOnMethods`), the retry decision helpers (`isRetryableStatus`,
> `isRetryableError`, `shouldRetry`), `HttpError`, `buildUrl`/`mergeHeaders`,
> and response helpers. The test transport ships **in-core** as
> `createMockFetch` (rather than in `@rootware/testing`), so the "fake transport
> lives in testing" line below is aspirational — decide whether to keep
> `createMockFetch` in core or move it to an `@rootware/http/testing` subpath.
>
> Redaction already exists privately for URL credentials/query parameters and
> JSON error bodies, and this alignment pass formalized tested helpers for
> redacting headers, URLs, and JSON-like diagnostics. Logger integration must
> still stay behind redaction policy and ordering tests.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/http` is a JSR-native, Deno-first HTTP client package.

It exists because native `fetch` is excellent but intentionally low-level. Real
applications need timeouts, retries, structured errors, redacted logs, typed
JSON handling, and test adapters.

The package should provide:

- Fetch wrapper with timeout.
- Retry and backoff.
- Typed JSON parsing.
- Error classification.
- Request/response logging hooks.
- Redaction of sensitive headers.
- Testable transport adapter.
- Future OpenTelemetry hooks.

One-line strategy:

> `@rootware/http` gives Deno apps a production-safe fetch boundary without
> hiding the platform fetch API.

## Canonical package

```ts
jsr:@rootware/http
```

Expected imports:

```ts
import { createHttpClient } from "@rootware/http";
```

Expected usage:

```ts
const client = createHttpClient({
  baseUrl: "https://api.example.com",
  timeoutMs: 5000,
  retry: { attempts: 3 },
});
```

## Rootware workspace fit

This package sits after:

- `@rootware/errors`
- `@rootware/env`
- `@rootware/log`
- `@rootware/testing` for tests only, not runtime imports.

### Runtime imports

- `@rootware/errors` — `HttpError` (value import).
- `@rootware/log` — **type-only** (`Logger`). The logger is injected, so this is
  a build/type edge, not a runtime dependency.

### Example / dev-only imports

- `@rootware/env` — examples only (base URLs, secrets); not imported by the
  package.
- `@rootware/testing` — tests only. (`createMockFetch`, the test transport,
  currently ships in-core; see the v0.1 note above.)

### Disallowed dependencies

- `@rootware/testing` in runtime code.
- Provider SDKs in the core.
- Framework adapters in the core.

## Responsibilities

This package owns:

- HTTP client contract.
- Retry policy.
- Timeout behavior.
- Response parsing.
- Error classification.
- Safe request/response diagnostics.
- Test transport contract.

This package does not own:

- Provider-specific SDKs.
- Web framework routing.
- Browser UI fetch hooks.
- OAuth flows.
- Caching semantics beyond explicit future integration with `@rootware/cache`.

## Architecture

```txt
client API -> request builder -> transport adapter -> response parser -> error classifier
```

### 1. Public API

Expose `createHttpClient`, `HttpClient`, `HttpRequestOptions`, and
`HttpResponse`.

### 2. Transport boundary

Default transport uses global `fetch`. Tests can inject a transport.

### 3. Retry boundary

Retries should be explicit and conservative.

### 4. Parsing boundary

JSON parsing errors should produce typed `HttpError`.

## Public contracts

### Client

```ts
export interface HttpClient {
  request(path: string, options?: HttpRequestOptions): Promise<Response>;
  get(path: string, options?: HttpRequestOptions): Promise<Response>;
  post(path: string, options?: HttpRequestOptions): Promise<Response>;
  requestJson<T = unknown>(
    path: string,
    options?: JsonRequestOptions,
  ): Promise<T>;
}
```

### Transport

```ts
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
```

## Security and safety model

Rules:

- Redact `authorization`, `cookie`, `set-cookie`, `x-api-key`, and provider
  token headers before they can reach diagnostics.
- Do not log full request bodies by default.
- Timeouts should abort fetch with `AbortController`.
- Retries must not retry unsafe methods by default unless explicitly configured.
- Provider clients should use this package but live in separate adapters.

## Runtime targets

Primary:

- Deno local.
- Deno Deploy.
- JSR consumers.

Compatible by design:

- Bun.
- Node ESM.
- Cloudflare Workers.

## Non-goals before v1

- Full OpenAPI client generator.
- GraphQL client.
- Provider SDKs.
- Browser React hooks.
- Automatic caching.
- Circuit breaker in v0.2.

## Release roadmap

## v0.1.x — Foundation cleanup

### Chunk 1 — Audit package surface

Confirm current stubs and intended public names.

### Chunk 2 — Define client types

Define `HttpClient`, `HttpClientOptions`, `HttpRequestOptions`, and
`HttpTransport`.

### Chunk 3 — Add README skeleton

Show simple GET/POST examples.

## v0.2.0 — Production fetch spine

> **These already ship in `v0.1`.** Read the chunks below as verify, add tests,
> and document the existing implementation — not build from scratch, and do not
> replace the shipped code. All chunks 4–10 already ship (request methods, base
> URL, timeout, JSON, HttpError, retry policy, and the `createMockFetch` test
> transport). Redaction exists and has dedicated tests; the remaining hardening
> is policy documentation, ordering guarantees, and logger integration.

### Chunk 4 — Basic request methods

Verify the shipped request methods (`request`, `get`, `post`, `put`, `patch`,
`delete`).

### Chunk 5 — Base URL support

Resolve relative paths against `baseUrl`.

### Chunk 6 — Timeout support

Use `AbortController`.

### Chunk 7 — JSON helpers

Verify JSON request body and typed response parsing.

### Chunk 8 — HttpError

Verify `HttpError extends RootwareError`.

### Chunk 9 — Retry policy

Verify conservative retries for idempotent methods and selected statuses.

### Chunk 10 — Test transport

Verify fake transport examples and tests (`createMockFetch`).

## v0.3.0 — Hardening — **done (`0.3.0`)**

- **Public redaction policy** — `isSensitiveHttpName(name)` exposes the internal
  sensitivity policy that drives URL/header/body redaction; documented in the
  README alongside `redactHttpHeaders`/`redactHttpUrl`/`redactHttpJson`.
- **Logging hook ordering guarantees** — documented (started → retrying\* →
  completed/failed) and covered by an ordering test asserting the exact message
  sequence and the presence of `delayMs` on retry logs.
- **Header logging tests** — `redactHttpHeaders` + `isSensitiveHttpName` tests
  assert credential headers are masked while safe headers pass through.
- **Better error classification** — `TimeoutError` (`AbortSignal.timeout`) →
  `HTTP_TIMEOUT`; caller aborts → `HTTP_ABORTED` with the abort reason surfaced
  in details.
- **Retry-After handling** — `parseRetryAfter` (delta-seconds + HTTP-date) is
  honored on retryable responses, taking precedence over backoff but bounded by
  `maxBackoffMs`; toggled by `respectRetryAfter` (default on).
- **Backoff and jitter** — `computeRetryDelay` is exponential
  (`backoffMs * 2^(attempt-1)`), capped at `maxBackoffMs`, with full jitter by
  default (`jitter` option; pure + injectable `random` for tests).
- **Better abort/cause handling** — external-signal aborts thread the reason;
  timeouts and aborts are distinguished.
- **Response body size limits** — `maxResponseBytes` streams the body, rejects
  early on `Content-Length`, and fails `HTTP_RESPONSE_TOO_LARGE` without
  buffering oversized bodies; `parseJsonResponse` accepts `{ maxBytes }`.
- **Structured error response hardening** — error bodies are sanitized
  (sensitive keys redacted) **and** bounded by `maxResponseBytes`.

## v0.4.0 — Integration hooks — **done (`0.4.0`)**

- **Lifecycle hooks (`HttpHooks`)** — `onRequest`, `onResponse`, `onRetry`, and
  `onError`, wired into the request loop and passed safe-by-default contexts
  (`HttpRequestContext` and friends carry a stable `requestId`, the method, the
  redacted URL, the attempt index, status/duration — never a body). Hooks are
  awaited but isolated: a throwing or rejecting hook can never fail the request.
- **OpenTelemetry / logger hook contract** — the same lifecycle is the seam a
  tracing or metrics adapter builds on. `requestId` is stable across retries, so
  an adapter can open a span on `onRequest` and close it on `onResponse`/
  `onError`; the README shows a minimal span adapter. The internal redacted
  logging stays as-is and runs alongside hooks.
- **Cache hook contract (`HttpResponseCache`)** — an opt-in `cache` consulted
  only for safe (`GET`/`HEAD`) requests, never for an `Authorization`-bearing
  request; stores `2xx` responses (as clones) and serves hits without fetching
  (`onResponse` reports `fromCache: true`). The implementation owns freshness/
  TTL and storage — e.g. an `@rootware/cache` store — keeping HTTP core free of
  cache policy. Read/write failures degrade to a normal request.
- **Provider adapter examples** — README shows a span adapter and a cache-backed
  client.

## v1.0.0 — Stable client contract

- Freeze transport API.
- Freeze error semantics.
- Document retry safety.

## Cross-package integrations

### @rootware/errors

`HttpError extends RootwareError`.

### @rootware/env

Examples use env for base URLs and secrets.

### @rootware/log

Injected logger records request lifecycle without leaking secrets.

### @rootware/testing

Fake transports and HTTP assertions should live in testing or test subpaths.

## First 10 implementation chunks

Most of the client already ships in `v0.1`; the first moves are verification and
redaction policy hardening, not re-building.

1. Audit the published surface (`createHttpClient`, retry, timeout, `HttpError`,
   `createMockFetch`).
2. Verify request methods, base URL, and timeout (`AbortController`) behavior.
3. Verify JSON request/response handling and typed parsing.
4. Verify `HttpError` classification and the retry policy (idempotent methods
   only by default).
5. Verify `createMockFetch` as the test transport.
6. Verify header/URL/body redaction and document the policy.
7. Add retry-after handling + backoff/jitter.
8. Add logger hooks — only after redaction lands, never before.
9. Add the OpenTelemetry hook contract.
10. Expand tests and README; document retry safety.

## Product rule

`@rootware/http` should make provider integrations boring. If every provider
adapter reimplements retries, this package failed.
