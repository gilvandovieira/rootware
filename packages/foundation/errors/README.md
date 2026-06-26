# @rootware/errors

Application error primitives for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { RootwareError } from "jsr:@rootware/errors";
```

## Example

```ts
throw new RootwareError("Missing configuration", {
  code: "ROOTWARE_CONFIGURATION_ERROR",
  status: 500,
  severity: "fatal",
  details: { variable: "DATABASE_URL" },
});
```

## Package-specific errors

Higher-level packages build their own error types on top of this contract with
`createErrorFactory`, so every Rootware failure shares one shape:

```ts
import { createErrorFactory, defineErrorCode } from "jsr:@rootware/errors";

// @rootware/env
export const EnvError = createErrorFactory({
  name: "EnvError",
  code: defineErrorCode("ROOTWARE_CONFIGURATION_ERROR"),
  status: 500,
  severity: "fatal",
});

// @rootware/log
export const LogError = createErrorFactory({
  name: "LogError",
  code: defineErrorCode("LOG_WRITE_FAILED"),
  status: 500,
});

// @rootware/http
export const HttpError = createErrorFactory({
  name: "HttpError",
  code: defineErrorCode("ROOTWARE_EXTERNAL_SERVICE_ERROR"),
  status: 502,
  expose: true,
});

throw EnvError("Missing DATABASE_URL", {
  details: { variable: "DATABASE_URL" },
});
```

## API

- `RootwareError`
- `toRootwareError`
- `serializeError`
- `getErrorChain`
- `createErrorFactory`
- `defineErrorCode`
- `registerErrorRedactor` / `clearErrorRedactors` / `redactErrorKeys`

## Security

`serializeError` hides non-exposed messages and details by default. Use
`expose: true` only for errors that are safe to show to users.

It is the **safe, no-stack** serializer for user-facing payloads. For internal
logs that need the stack and full (non-redacted) fields, reach for
`serializeErrorForLog` from `@rootware/log` instead — the two are deliberately
distinct so an app can import both without a name collision.

### `expose` in detail

`expose` controls the **serialized** payload, not the live error object. The
fields you set are always readable in-process (`error.message`, `error.details`,
`error.cause`); `expose` only decides what `toJSON()` / `serializeError()`
reveal to the outside world:

| Field                          | `expose: false` (default) | `expose: true`             |
| ------------------------------ | ------------------------- | -------------------------- |
| `message`                      | generic placeholder       | the real message           |
| `details`                      | omitted                   | included (after redaction) |
| `cause`                        | omitted                   | recursed (depth-limited)   |
| `code` / `status` / `severity` | always included           | always included            |

Keep internal/infrastructure errors **un-exposed** so a 500 never leaks a stack,
query, or connection string. Mark an error `expose: true` only when its message
and details are written for the end user (validation failures, 4xx client
errors). `code`, `status`, and `severity` are considered safe metadata and are
always serialized regardless of `expose`.

### Redaction hooks

Even on exposed errors, `details` can accidentally carry a secret. Register a
redactor as a centralized safety net — it runs on every serialization and only
affects output, never the live `error.details`:

```ts
import { redactErrorKeys, registerErrorRedactor } from "jsr:@rootware/errors";

registerErrorRedactor(redactErrorKeys(["password", "token", "apiKey"]));

// or pass a one-off redactor for a single call:
serializeError(error, { redact: redactErrorKeys(["sessionId"]) });
```

A redactor that throws causes the affected `details` to be dropped rather than
risk leaking unredacted values. `serializeError` also accepts `maxDepth` to cap
how far the `cause` chain is walked; use `getErrorChain(error)` to inspect that
chain as an array of `RootwareError`s.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package only defines error primitives. Package-specific errors live in the
packages that need them.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
