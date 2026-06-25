# @rootware/errors

Application error primitives for Rootware packages and Deno backends.

Status: experimental / early development.

## Import

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

## API Summary

- `RootwareError`
- `toRootwareError`
- `serializeError`
- `createErrorFactory`
- `defineErrorCode`

## Security

`serializeError` hides non-exposed messages and details by default. Use
`expose: true` only for errors that are safe to show to users.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package only defines error primitives. Package-specific errors live in the
packages that need them.

[Back to Rootware](../../README.md)
