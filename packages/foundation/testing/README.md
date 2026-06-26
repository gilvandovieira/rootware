# @rootware/testing

Testing utilities for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { assertLog, testLogger } from "jsr:@rootware/testing";
```

## Example

```ts
const { logger, sink } = testLogger();

logger.info({ userId: "u_123" }, "user created");

assertLog(sink).hasMessage("user created");
```

## Capturing logs (`0.6`)

`captureLogs()` bundles a logger with inline assertions — the
`@rootware/log`-to-`@rootware/testing` integration point:

```ts
const logs = captureLogs();

logs.logger.info({ event: "user.created", userId: "u_123" }, "created");

logs.assertEvent("user.created", { userId: "u_123" });
logs.assertCount(1);

// Snapshot-friendly: `normalized()` strips the volatile `time` field.
assertSnapshot(logs.normalized());
```

## Test context composition

`createTestContext` bundles a non-global fake clock, an in-memory log sink, and
a LIFO cleanup stack. Compose setup/teardown with `context.use(fixture)`, which
runs the fixture and registers its teardown automatically:

```ts
const ctx = createTestContext({ name: "checkout" });
const clock = ctx.clock; // deterministic time, no global Date patch
const resource = await ctx.use(myFixture); // teardown auto-registered

// ... exercise code, assert against ctx.logs ...

await ctx.runCleanup(); // LIFO teardown, aggregates the first failure
```

## The `/testing` subpath convention

The core here (`createFixture`, `createCleanupStack`, `createFakeClock`,
`createTestContext`, `assertLog`) is what higher packages build
**package-owned** fakes on. A package ships its production-shaped fakes from its
own `/testing` subpath (e.g. `@rootware/cache/testing`), never from this core —
that keeps `@rootware/testing` free of higher-level dependencies.

A `/testing` fixture is just a `TestFixture<T>` that composes the core:

```ts
// @rootware/cache/testing (illustrative)
import { createFixture } from "jsr:@rootware/testing";
import { memoryCacheStore } from "jsr:@rootware/cache";

export const memoryCacheFixture = () =>
  createFixture(
    "memory-cache",
    () => memoryCacheStore(),
    (store) => store.clear(),
  );

// in a test
const cache = await ctx.use(memoryCacheFixture());
```

## Testing `Deno.serve` handlers (`0.4`)

Exercise a fetch-style handler with no server, network, or permissions.
`testRequest` builds a `Request`; `callHandler` invokes a `Deno.serve`-style
handler and buffers the response body so it can be asserted (chainably):

```ts
import { callHandler, testRequest } from "jsr:@rootware/testing";

const handler = (request: Request) =>
  request.method === "POST"
    ? Response.json({ ok: true }, { status: 201 })
    : new Response("home");

const res = await callHandler(handler, "/users", { json: { name: "ada" } });
res.assertStatus(201).assertOk().assertJson({ ok: true });

// Or build a request yourself and call the handler directly:
const req = testRequest("/search", { query: { q: "deno" } });
```

`callHandler` accepts everything `testRequest` does plus `remoteAddr` to
override the synthetic `ServeHandlerInfo`. A handler that throws surfaces as a
`TestError` (`TEST_HANDLER_FAILED`).

## API

- `assert`, `assertEquals`, `assertThrows`, `assertRejects`
- `assertRootwareError`, `assertErrorCode`, `assertThrowsRootwareError`
- `testEnv`, `withEnvSource`
- `testLogger`
- `assertLog` (`hasMessage`, `hasMessageMatching`, `hasField`, `hasRecord`,
  `hasNoRecord`, `isEmpty`, `messages`, `last`, `count`)
- `captureLogs` (`0.6`) → `CapturedLogs` (`logger`, `assertContains`,
  `assertEvent`, `assertCount`, `assertEmpty`, `normalized`)
- `testRequest`, `callHandler` → `TestResponse` (`assertStatus`, `assertOk`,
  `assertHeader`, `assertJson`, `assertBodyIncludes`, `text`, `json`, `header`)
- `createFakeClock`
- `createFixture`, `useFixture`
- `createTestContext` (`use`, `cleanup`, `runCleanup`)
- `createCleanupStack`
- Data testing (`0.5`) — `rollbackFixture`, `withRollback`, `RollbackHandle`,
  `TestDatabaseContract`, and the `Equal`/`Expect` type-test utilities

## Data testing foundation (`0.5`)

Shared scaffolding for the database fixtures that live in
`@rootware/orm/testing` (this core never imports a database). A test runs inside
a rollback scope so it leaves nothing behind — the higher package injects
`begin`:

```ts
import { rollbackFixture, withRollback } from "jsr:@rootware/testing";

// One-off: always rolls back, even if the body throws.
await withRollback(begin, async (db) => {
  await db.insert(users).values(row).execute();
});

// As a fixture composed onto a context's cleanup stack:
const db = await ctx.use(rollbackFixture("db", begin));
```

`Equal<A, B>` + `Expect<T>` give compile-time type assertions for ORM/schema
type tests: `type _ = Expect<Equal<InferSelect<typeof users>, Row>>;`.

## Security

Helpers avoid mutating globals, `Date`, and `Deno.env`. Prefer explicit sources
and fakes.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package complements `Deno.test`; it is not a test runner and does not
modify globals.

## Status

**Experimental.** The public API was audited and **frozen at `0.9`** to reduce
churn on the way to `1.0` — but until this package has real-world consumers it
stays experimental, so breaking changes remain possible **even at `1.0`**. The
version tracks roadmap progress, not a production-stability guarantee.

## License

MIT

[Back to Rootware](../../../README.md)
