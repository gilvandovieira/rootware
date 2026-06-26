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

## Production hardening (`0.2`)

`createLogger` accepts options for real applications:

```ts
const logger = createLogger({
  level: "info",
  base: { service: "api" },
  messageKey: "msg", // key for the message (default "msg")
  errorKey: "error", // key for the serialized error (default "error")
  redact: ["password", "req.headers.authorization", "*.token"],
  onWriteError: (error, line) => reportToStderr(error, line),
});

logger.isLevelEnabled("debug"); // gate expensive log payloads
```

- **Redaction** matches dot-separated paths where `*` is a single-key wildcard;
  matched leaves become `"[Redacted]"` (override with `redact.censor`).
- **`onWriteError`** receives sink failures instead of throwing. Without it,
  synchronous failures still throw, while asynchronous failures are swallowed
  rather than surfacing as unhandled rejections.

## API

- `createLogger`
- `memorySink`
- `bufferedSink`
- `unbufferedSink`
- `createNoopLogger`
- `serializeErrorForLog`

## Security

The logger serializes errors safely and does not require logging request bodies
or secrets. Application code should avoid passing sensitive fields as log
objects; use `redact` for fields that may carry secrets.

`serializeErrorForLog` is the **internal** error serializer: it keeps the stack
and all fields for diagnostics. It was renamed from `serializeError` in `0.2` so
it no longer collides with the safe, `expose`-respecting `serializeError` from
`@rootware/errors` — reach for that one for user-facing payloads.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package does not include pretty printing, file transports, or OpenTelemetry
integration yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
