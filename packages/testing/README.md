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

## API

- `assert`, `assertEquals`, `assertThrows`, `assertRejects`
- `assertRootwareError`, `assertErrorCode`, `assertThrowsRootwareError`
- `testEnv`, `withEnvSource`
- `testLogger`
- `assertLog`
- `createFakeClock`
- `createFixture`
- `createTestContext`
- `createCleanupStack`

## Security

Helpers avoid mutating globals, `Date`, and `Deno.env`. Prefer explicit sources
and fakes.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package complements `Deno.test`; it is not a test runner and does not
modify globals.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
