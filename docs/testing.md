# Testing

Run all tests:

```sh
deno task test
```

Run coverage:

```sh
deno task test:coverage
deno task coverage:lcov
```

## Package Tests

Place package tests next to `mod.ts` as `mod_test.ts`.

Use `@std/assert` for direct assertions:

```ts
import { assertEquals } from "@std/assert";
```

Use `@rootware/testing` when a test benefits from Rootware helpers such as fake
clocks, memory loggers, fixture helpers, or typed test env setup.

## Determinism

Prefer:

- Explicit env sources instead of `Deno.env`.
- `memorySink()` instead of stdout or stderr.
- `createMockFetch()` instead of real network requests.
- `memoryCacheStore()` instead of external cache services.
- Fake clocks or fixed timestamps when time matters.

Avoid:

- Real network calls.
- Real filesystem state unless the package is specifically testing filesystem
  behavior.
- Process-global mutation.
- Timezone-dependent assertions.
- `--allow-all`.
