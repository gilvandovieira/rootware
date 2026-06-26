# @rootware/errors Product Plan

## Status

`@rootware/errors` exists as part of the Rootware `v0.1` foundation.

This package is the bottom of the Rootware dependency ladder. It should remain
small, dependency-free, and stable because every other package will eventually
use it.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/errors` is a JSR-native, Deno-first application error contract for
Rootware packages and Deno backends.

It exists because backend packages need a shared way to represent failures
without leaking secrets, relying on framework-specific exceptions, or returning
inconsistent error shapes.

The package should provide:

- A base `RootwareError`.
- Typed error codes.
- HTTP status metadata.
- Exposure control for user-safe errors.
- Severity metadata for logs and observability.
- Safe serialization.
- Cause preservation.
- Error factories for package-specific errors.
- No required npm runtime dependency.
- No dependency on any other Rootware package.

One-line strategy:

> `@rootware/errors` gives every Rootware package one safe, typed, serializable
> failure model.

## Canonical package

```ts
jsr:@rootware/errors
```

Expected imports:

```ts
import { createErrorFactory, RootwareError } from "@rootware/errors";
```

Naming rules:

- Always refer to this package as `@rootware/errors`.
- Do not use `@rootware/error` or `@rootware/exceptions`.
- Package-specific errors should extend `RootwareError`.

## Rootware workspace fit

This package sits first.

Allowed dependencies:

- None.

Disallowed dependencies:

- `@rootware/env` — would create a cycle.
- `@rootware/log` — errors must be usable before logging exists.
- `@rootware/testing` — production packages must not depend on testing.
- Any framework adapter — errors must be framework-neutral.

## Responsibilities

This package owns:

- Base error class.
- Error code typing.
- Error serialization.
- Safe error conversion from unknown values.
- Factory helpers.
- Public error metadata conventions.

This package does not own:

- HTTP response rendering.
- Logging.
- Environment configuration.
- Framework middleware.
- Observability exporters.
- User-facing localization.

## Relationship with other Rootware packages

### @rootware/env

`@rootware/env` should define `EnvError extends RootwareError`.

### @rootware/log

`@rootware/log` should safely serialize `RootwareError` instances and respect
`expose`.

### @rootware/http

`@rootware/http` should use error codes and status metadata for retry/error
classification.

### @rootware/testing

`@rootware/testing` should provide assertions for Rootware errors without
becoming a dependency of this package.

## Architecture

```txt
unknown thrown value -> RootwareError conversion -> safe JSON -> package-specific handling
```

### 1. Public API

The main public API is the `RootwareError` class and conversion helpers.

### 2. Error model

The internal model should stay simple:

- `code`
- `message`
- `status`
- `expose`
- `severity`
- `details`
- `cause`

### 3. Serialization boundary

Serialization must not leak sensitive data by default.

### 4. Factory boundary

Factories allow higher-level packages to create domain-specific errors without
reimplementing boilerplate.

## Public contracts

### Error severity

```ts
export type ErrorSeverity = "debug" | "info" | "warn" | "error" | "fatal";
```

`severity` is **metadata**, not a logging instruction. It deliberately omits
`trace` and `silent`, so it is a subset of `@rootware/log`'s level names and the
two are not interchangeable. `@rootware/log` records an error's `severity` as a
field; it does not use it to choose the log level (the call site picks the level
via `logger.warn` / `logger.error`). Document this so no one assumes logging a
`severity: "warn"` error through `logger.error` is a contradiction — it is not.

### RootwareError

```ts
export class RootwareError extends Error {
  override name: string;
  override cause: unknown; // declared `override`, mutable, matches Error.cause
  readonly code: RootwareErrorCode;
  readonly status: number; // defaulted, not optional
  readonly expose: boolean; // defaults to false
  readonly severity: ErrorSeverity; // defaults to "error"
  readonly details?: Record<string, unknown>;

  toJSON(): RootwareErrorJson; // expose-respecting, never includes `stack`
}
```

Note `cause` is declared with `override` (mutable) so it cooperates with the
native ES2022 `Error.cause` rather than redeclaring it as a conflicting
`readonly` field — the published code does this; an earlier draft of this sketch
showed `readonly cause?`, which fights the base type.

### Error factory

```ts
const configurationError = createErrorFactory({
  code: "ROOTWARE_CONFIGURATION_ERROR",
  status: 500,
  expose: false,
  severity: "fatal",
});
```

## Security and safety model

Rules:

- `expose: false` by default.
- `details` must be structured and serializable.
- Unknown thrown values must become safe errors.
- Native `Error` messages may be preserved for internal logs but should not be
  exposed blindly to users.
- `cause` should be preserved but not recursively leaked in public JSON unless
  explicitly serialized for internal logs.

## Runtime targets

Primary:

- Deno local.
- Deno Deploy.
- JSR consumers.

Compatible by design:

- Bun.
- Node ESM.
- Cloudflare Workers, if no Deno-only APIs are used.

## Non-goals before v1

- Localization.
- Framework-specific response helpers.
- OpenTelemetry export.
- Validation library integration.
- Problem Details RFC implementation.
- Stack trace source map processing.

## Release roadmap

## v0.1.x — Foundation cleanup

### Chunk 1 — Audit current package

Confirm the current `mod.ts` API, exported names, and dependency-free status.

### Chunk 2 — Freeze naming

Standardize names: `RootwareError`, `RootwareErrorOptions`, `RootwareErrorJson`,
`RootwareErrorCode`.

### Chunk 3 — Add minimal README

Document the base error contract and factory use.

### Chunk 4 — Add first tests

Test construction, `instanceof`, `toJSON`, and `isRootwareError`.

## v0.2.0 — Product spine

### Chunk 5 — RootwareError complete contract

Implement stable fields: code, status, expose, severity, details, cause.

### Chunk 6 — Safe conversion helpers

Implement `toRootwareError`, `getErrorMessage`, `getErrorCause`, and
`serializeError`.

### Chunk 7 — Factory helper

Implement `createErrorFactory(defaults)`.

### Chunk 8 — Code helper

Implement `defineErrorCode(code)`.

### Chunk 9 — Serialization rules — **done (`0.2.0`)**

The user-safe path already existed: `toJSON()` / `serializeError()` emit
`RootwareErrorJson`, which respects `expose` and **never includes `stack`**,
with a cycle-guarded recursive `cause`. The work here was to decide where the
**with-stack, internal** serialization lives.

`@rootware/log` previously shipped its own `serializeError()` that _does_
include `stack`, so two functions named `serializeError` were exported from the
workspace and collided if an app imported both. **Resolved by renaming log's
variant to `serializeErrorForLog`** (with stack, all fields, ignores `expose`),
keeping the safe/no-stack `serializeError` here as the user-facing default. The
two now have distinct names and an app can import both.

### Chunk 10 — Package-specific examples

Show `EnvError`, `LogError`, and `HttpError` examples.

## v0.3.0 — Hardening — **done (`0.3.0`)**

- **Redaction hooks** — `registerErrorRedactor` / `clearErrorRedactors` and the
  `redactErrorKeys` helper install a global safety net applied to `details` on
  every serialization path; `serializeError(value, { redact })` adds a per-call
  redactor. Redactors affect serialized output only, never the live
  `error.details`, and a throwing redactor drops `details` rather than leaking.
- **Better cause-chain handling** — `getErrorChain(value, { maxDepth })` walks
  the `cause` chain cycle-safely into an array of `RootwareError`; serialization
  is now depth-limited (`DEFAULT_MAX_CAUSE_DEPTH = 16`, overridable via
  `serializeError(value, { maxDepth })`) in addition to its existing cycle
  guard.
- **Compatibility tests** — added for native errors, strings, unknown objects,
  `null`, and `undefined`, covering `toRootwareError`, `getErrorMessage`,
  `getErrorCause`, and `serializeError`.
- **`expose` docs** — README now has an `expose` field-by-field table and a
  redaction section.
- `assertRootwareError` lives in `@rootware/testing` (its `/testing` home), not
  here, per the package boundary rule.

## v0.4.0 — Cross-package integration — **done (`0.4.0`)**

- **Cross-package use verified** — `@rootware/env` (`EnvError`), `@rootware/log`
  (`LogError`), `@rootware/http` (`HttpError`), and every other package extend
  `RootwareError` via `createErrorFactory`; documented in the README.
- **Error-code naming conventions** — codified as
  `namespacedErrorCode(ns, name)` (`SCREAMING_SNAKE_CASE`, base owns
  `ROOTWARE_*`, packages prefix with their uppercase name) with validation +
  tests, and documented in the README.
- **Package-specific subclasses** — README documents the
  `<Pkg>Error extends RootwareError` pattern with `EnvError`/`LogError`/
  `HttpError` examples.

## v1.0.0 — Stable public API

- Freeze base class fields.
- Freeze JSON shape.
- Freeze factory API.
- Commit to semver for error contract changes.

## Suggested issue backlog

### Documentation

- README quick start.
- Error code naming guide.
- Safe serialization guide.

### API

- `RootwareError`
- `createErrorFactory`
- `serializeError`
- `toRootwareError`

### Testing

- Native Error conversion.
- Unknown value conversion.
- Cause preservation.
- Details safety.

## First 10 implementation chunks

1. Audit current `mod.ts`.
2. Confirm no dependencies.
3. Implement/verify `RootwareError`.
4. Implement `RootwareErrorOptions`.
5. Implement `toJSON`.
6. Implement `isRootwareError`.
7. Implement `toRootwareError`.
8. Implement `serializeError`.
9. Implement `createErrorFactory`.
10. Add tests and README.

## Product rule

`@rootware/errors` must stay boring. Its value is stability, not feature volume.
