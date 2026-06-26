# @rootware/testing Product Plan

## Status

> **API freeze (`0.9.0`):** the public surface is audited and frozen to reduce
> churn toward `1.0`. The package stays **experimental** until it has real
> consumers — breaking changes remain possible even at `1.0`.

`@rootware/testing` exists as part of the Rootware `v0.1` foundation.

This package should become the deterministic test harness for Rootware packages
and apps.

> **Current `v0.1` surface (reconciled with source).** Ships the generic
> assertions (`assert`, `assertEquals`, `assertThrows`, …), `createTestContext`,
> `createFakeClock`, `testEnv`, `testLogger`, `assertLog` (over
> `MemoryLogSink`), `createFixture`, `captureError`, plus `wait`/`noop`. It
> imports only `@rootware/errors`, `@rootware/env`, and `@rootware/log` — i.e.
> the dependency direction is currently clean. This alignment pass added
> `assertRootwareError`, `assertErrorCode`, and `assertThrowsRootwareError`.
>
> **Keep it clean: where the higher-package fakes live.** Fakes/fixtures for
> `@rootware/http`, `@rootware/cache`, `@rootware/storage`, and
> `@rootware/session` are needed, but those packages sit _above_
> `@rootware/testing` in the ladder, so a fake that implements their contracts
> (e.g. an `HttpTransport`) must import _their_ types — which would make
> `@rootware/testing` depend on a higher package and break the direction. They
> live in each package's own `/testing` subpath (for example
> `@rootware/http/testing`), which may import `@rootware/testing` core
> (downward, allowed) plus its own types. The core `@rootware/testing` package
> stays generic + errors/env/log only. `assertRootwareError` belongs here
> (errors is below testing); HTTP/cache/storage/session fakes do not. The
> roadmap below reflects this split.

Last reviewed: `2026-06-26`

## Product thesis

`@rootware/testing` is a JSR-native, Deno-first testing utility package for
backend infrastructure and applications.

It exists because app-level tests need more than assertions. They need fake env
sources, memory log assertions, fake clocks, test contexts, deterministic
cleanup, and package-specific assertions — without dragging the test harness
above its place in the dependency ladder.

The package should provide:

- Test env helpers.
- Memory logger assertions.
- Error assertions.
- Fake clock helpers.
- Test context factory.
- Fixture helpers.
- Deterministic cleanup utilities.
- No framework lock-in.
- No production package dependency on testing.

It deliberately does **not** ship fakes for packages above it in the ladder
(`http`, `cache`, `storage`, `session`, `orm`, `migrate`). Those fakes would
have to import their target package's types, which would make
`@rootware/testing` depend on a higher package. They live in each package's own
`/testing` subpath instead (see the Canonical package and Responsibilities
sections below).

One-line strategy:

> `@rootware/testing` makes Rootware packages easy to dogfood and Deno apps easy
> to test without fragile integration setup.

## Canonical package

```ts
jsr:@rootware/testing
```

Expected imports:

```ts
import {
  assertRootwareError,
  createTestContext,
  testEnv,
} from "@rootware/testing";
```

`@rootware/testing` has no `/storage` or `/database` subpath. Fakes for higher
packages are imported from _those packages_, each of which depends on
`@rootware/testing` core (downward, allowed) for the shared scaffolding:

```ts
import { memoryStorage } from "@rootware/storage/testing"; // owned by @rootware/storage
import { testDatabase } from "@rootware/orm/testing"; // owned by @rootware/orm
import { mockTransport } from "@rootware/http/testing"; // owned by @rootware/http
```

These `/testing` subpaths are planned ownership locations. They should not be
added to package `exports` until the corresponding files and tests exist.

## Rootware workspace fit

This package sits after:

- `@rootware/errors`
- `@rootware/env`
- `@rootware/log`

Allowed dependencies:

- `@rootware/errors` — error assertions.
- `@rootware/env` — test env sources.
- `@rootware/log` — memory log helpers.

Disallowed dependencies:

- Production packages depending on `@rootware/testing`.
- Framework adapters in the core testing package.
- Database drivers in the core testing package before data milestone.

## Responsibilities

This package owns:

- Cross-package, generic test helpers.
- In-memory fakes only for the packages below it (env source, memory log sink).
- Assertions for Rootware errors and logs.
- Deterministic utility functions (fake clock, cleanup stack).
- Test context composition.

This package does not own:

- Full test runner.
- Replacement for `Deno.test`.
- Browser testing.
- E2E test orchestration.
- Database containers.
- Framework-specific test clients in the core.
- **Fakes for `http`, `cache`, `storage`, `session`, `orm`, or `migrate`.**
  Those live in each package's own `/testing` subpath, which imports this
  package for shared helpers. Putting them here would invert the dependency
  direction.

## Architecture

```txt
Deno.test -> test context -> below-package fakes -> assertions -> deterministic cleanup
```

### 1. Test context

A small object that carries env, logs, clock, and cleanup callbacks.

### 2. Fakes and test doubles

In-memory fakes should model public contracts, not private implementation
details. Core ships only the below-package fakes (env source, memory log sink).
A fake for a higher package — an `HttpTransport`, a cache store, a storage
store, a session manager, a test database — lives in that package's own
`/testing` subpath, follows the same modelling rule, and imports this package
for the shared cleanup/context/assert helpers.

### 3. Assertions

Assertions should be tiny and composable.

### 4. Cleanup boundary

Tests should be able to register cleanup functions and run them
deterministically.

## Public contracts

### Test context

```ts
export interface TestContext {
  readonly env: Record<string, unknown>;
  readonly cleanup: () => Promise<void>;
}
```

### Error assertions

```ts
assertRootwareError(error, {
  code: "ENV_MISSING_VARIABLE",
});
```

### Log assertions

```ts
assertLog(logs).hasMessage("post created");
```

## Security and safety model

Testing helpers must not weaken production APIs.

Rules:

- Keep testing package out of production dependency graph.
- Fake secrets should be obviously fake.
- Memory logs can expose full records in tests.
- Test adapters must not be accidentally used in production without explicit
  import.

## Runtime targets

Primary:

- Deno local test runner.
- JSR package tests.

Compatible by design:

- Bun/Node ESM where explicit sources/fakes are used.

## Non-goals before v1

- Full mocking framework.
- Snapshot test framework.
- Browser automation.
- Container orchestration.
- Test database server management.
- Framework-specific test client in the core.

## Release roadmap

## v0.1.x — Foundation cleanup

### Chunk 1 — Audit current package

Confirm current stubs and dependency direction.

### Chunk 2 — Define testing scope

Document that production packages must not import testing.

### Chunk 3 — Add README skeleton

Show `Deno.test` examples.

## v0.2.0 — Core deterministic helpers

### Chunk 4 — Error assertions (ships after alignment pass)

Verify `assertRootwareError`, `assertErrorCode`, and
`assertThrowsRootwareError`.

### Chunk 5 — Env helpers

Implement `testEnv()` and `withEnvSource()` helpers.

### Chunk 6 — Log assertions

Implement `assertLog()` helpers for memory sinks.

### Chunk 7 — Fake clock

Implement a minimal fake clock or deterministic time provider contract.

### Chunk 8 — Cleanup stack

Implement `createCleanupStack()`.

### Chunk 9 — Test context

Implement `createTestContext()`.

### Chunk 10 — Tests for the testing package

Dogfood the package against errors/env/log.

## v0.3.0 — Shared scaffolding for package fixtures — **done (`0.3.0`)**

This milestone hardens the _shared_ helpers that higher packages' `/testing`
subpaths build on. The HTTP/cache/storage fixtures themselves ship from
`@rootware/http/testing`, `@rootware/cache/testing`, and
`@rootware/storage/testing`, not from here.

- **Composition seam** — `TestContext` gained `use(fixture)`, which runs a
  `TestFixture` and registers its teardown on the context's LIFO cleanup stack.
  This is the join point a subpath fixture plugs into; the fake clock, cleanup
  stack, and memory log sink are exposed on the context for composition.
- **`/testing`-subpath convention documented** — README explains that
  package-owned fakes ship from each package's own `/testing` subpath (never
  this core), with a worked `@rootware/cache/testing` fixture example consuming
  `createFixture` + `ctx.use`.
- **Better memory-log assertion ergonomics** — `assertLog` added
  `hasMessageMatching(RegExp)`, `hasNoRecord`, `isEmpty`, `messages()`, and
  `last()`.
- **Test context composition docs** — added to the README.
- `assertRootwareError` already lives here (its `/testing` home), satisfying the
  `@rootware/errors` v0.3 cross-reference.

## v0.4.0 — App testing helpers — **done (`0.4.0`)**

- **Request helper for `Deno.serve`-style handlers** — `testRequest(url, init)`
  builds a `Request` (bare paths resolve against `http://localhost`; `json` and
  `query` conveniences), and `callHandler(handler, url, options)` invokes a
  `ServeHandler` with a synthetic `ServeHandlerInfo` (overridable `remoteAddr`),
  returning a `TestResponse` whose body is buffered once so it can be read and
  asserted repeatedly (`assertStatus`/`assertOk`/`assertHeader`/`assertJson`/
  `assertBodyIncludes`, chainable). No server, network, or permissions.
- **Hono adapter** — deferred to the dedicated `@rootware/hono` package (it
  carries an external dependency), not a `@rootware/testing` subpath. The
  `ServeHandler`/`callHandler` seam is what that adapter will build on.
- **Doomscrollr reference app testing utilities** — app-specific; they live with
  the reference app, composed from these primitives rather than shipped here.

## v0.5.0 — Data testing foundation — **done (`0.5.0`)**

The test database and migration fakes live in `@rootware/orm/testing` and
`@rootware/migrate/testing`. This milestone provides only the shared pieces they
depend on:

- **Transaction-rollback scaffolding** — `RollbackHandle<T>`, `rollbackFixture`
  (a `TestFixture` that begins a rollback scope in setup and always rolls back
  on teardown — composes with `context.use`), and `withRollback(begin, fn)`
  (runs `fn` and always rolls back, re-throwing the original failure). The
  `begin` function is injected by the higher package, so this core never imports
  a database.
- **Test-database contract** — `TestDatabaseContract<TConnection>`: the
  `connect()` → rollback-scoped connection shape an `@rootware/orm/testing`
  fixture implements, documented here without depending on the ORM.
- **ORM type-test utilities** — `Equal<A, B>` and `Expect<T>` for compile-time
  type assertions (the assertions live in core; the schema fixtures live in
  `@rootware/orm/testing`).

## v1.0.0 — Stable test support

- Freeze assertions.
- Freeze context API.
- Keep the below-package fakes and shared helpers aligned with public contracts.

## Cross-package integrations

### @rootware/errors

Provide assertions for error codes and safe serialization.

### @rootware/env

Provide test env sources.

### @rootware/log

Provide log assertions over memory sinks.

### @rootware/http/cache/storage/session

These packages own their own fakes in a `/testing` subpath
(`@rootware/http/testing`, etc.) that imports `@rootware/testing` core for the
shared cleanup/context/assert helpers. `@rootware/testing` does not provide
their fakes, and must not import them.

## First 10 implementation chunks

1. Audit current package.
2. Verify error assertions.
3. Implement env source helper.
4. Implement log assertion helper.
5. Implement cleanup stack.
6. Implement test context.
7. Add fake clock contract.
8. Test against errors/env/log.
9. Document production dependency rule.
10. Add Doomscrollr test example.

## Product rule

`@rootware/testing` should make correct package design easier. If a package is
hard to test, improve the contract, not just the test helper.
