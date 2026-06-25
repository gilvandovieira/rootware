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

Run the standard local CI:

```sh
deno task ci
```

## Writing Tests

- Put tests next to each package as `packages/<name>/mod_test.ts`.
- Use `@std/assert` through the root import map.
- Use `@rootware/testing` when testing application code or higher-level flows.
- Prefer explicit inputs and test doubles.
- Avoid real network calls, real databases, real filesystem state, and real
  environment variables.
- Prefer memory/noop stores and mock fetch functions.
- Keep waits short and deterministic.

## Permissions

The default test command is `deno test`. Add permissions only when a test truly
needs them. Do not use `--allow-all` in package tests or CI.
