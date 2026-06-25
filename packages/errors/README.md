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

## API

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

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
