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

## Pino compatibility (`0.3`)

Migrating from Pino? Import the Pino-shaped constructor from the `/compat/pino`
subpath — the root module stays explicit (`createLogger`, sinks):

```ts
import pino from "jsr:@rootware/log/compat/pino";

const logger = pino({
  name: "api",
  level: "info",
  base: { service: "api" },
  messageKey: "msg", // Pino default, also the Rootware default
  errorKey: "err", // Pino default (Rootware's own default is "error")
  serializers: { req: (r) => ({ method: r.method, url: r.url }) },
  redact: ["password", "req.headers.cookie"],
});

logger.info("server started");
logger.info({ port: 8000 }, "listening");
logger.error(new Error("boom"), "request failed");
logger.child({ requestId: "req_123" }).debug("loaded user");
```

### `pino` to `@rootware/log` migration guide

| Pino                                | `@rootware/log` compat                              |
| ----------------------------------- | --------------------------------------------------- |
| `import pino from "pino"`           | `import pino from "jsr:@rootware/log/compat/pino"`  |
| `pino({ level, base, messageKey })` | same options                                        |
| `logger.info({ a }, "msg")`         | same call forms                                     |
| `logger.error(err, "msg")`          | error serialized under `errorKey` (`"err"`)         |
| `logger.child({ reqId })`           | `logger.child({ reqId }, { level?, serializers? })` |
| `serializers: { err, req }`         | same — field + error serializers                    |
| `redact: ["a.b.c"]`                 | same dot-paths with `*` wildcard                    |
| `transport` / `pino.destination`    | **not supported** — pass a `LogSink` instead        |
| `logger.level = "debug"`            | **read-only** — use `child(b, { level })`           |
| `timestamp: false`                  | blanks `time` (records always carry `time`)         |

The `time` field is always emitted (ISO by default; pass a `timestamp` function
for a custom format). Transports, worker threads, `pino-pretty`, and Pino symbol
internals are deliberately out of scope.

## API

- `createLogger`
- `memorySink`
- `bufferedSink`
- `unbufferedSink`
- `createNoopLogger`
- `serializeErrorForLog`
- `pino` (from `@rootware/log/compat/pino`)

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
