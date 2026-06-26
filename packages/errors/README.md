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
- `createErrorFactory`
- `defineErrorCode`

## Security

`serializeError` hides non-exposed messages and details by default. Use
`expose: true` only for errors that are safe to show to users.

It is the **safe, no-stack** serializer for user-facing payloads. For internal
logs that need the stack and full (non-redacted) fields, reach for
`serializeErrorForLog` from `@rootware/log` instead — the two are deliberately
distinct so an app can import both without a name collision.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package only defines error primitives. Package-specific errors live in the
packages that need them.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
