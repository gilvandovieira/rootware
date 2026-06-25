# @rootware/log

Structured JSON logger for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

```ts
import { createLogger, stdoutSink } from "jsr:@rootware/log";
```

## Example

```ts
const logger = createLogger({
  level: "info",
  name: "api",
}, stdoutSink());

logger.info({ port: 8000 }, "server started");
```

## API

- `createLogger`
- `memorySink`
- `bufferedSink`
- `unbufferedSink`
- `createNoopLogger`
- `serializeError`

## Security

The logger serializes errors safely and does not require logging request bodies
or secrets. Application code should avoid passing sensitive fields as log
objects.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package does not include pretty printing, file transports, or OpenTelemetry
integration yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
