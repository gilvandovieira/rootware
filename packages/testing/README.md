# @rootware/testing

Testing utilities for Rootware packages and Deno backends.

Status: experimental / early development.

## Import

```ts
import { assertLog, testLogger } from "jsr:@rootware/testing";
```

## Example

```ts
const { logger, sink } = testLogger();

logger.info({ userId: "u_123" }, "user created");

assertLog(sink).hasMessage("user created");
```

## API Summary

- `assert`, `assertEquals`, `assertThrows`, `assertRejects`
- `testEnv`
- `testLogger`
- `assertLog`
- `createFakeClock`
- `createFixture`
- `createTestContext`

## Security

Helpers avoid mutating globals, `Date`, and `Deno.env`. Prefer explicit sources
and fakes.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).
