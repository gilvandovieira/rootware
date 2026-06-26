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

## Sinks (`0.4`)

Sinks are composable. Beyond `stdoutSink`/`stderrSink`/`memorySink` and the
`bufferedSink`/`unbufferedSink` wrappers, `0.4` adds:

```ts
import {
  createLogger,
  failoverSink,
  fanoutSink,
  fileSink,
  filterSink,
  levelSink,
  stdoutSink,
  writableStreamSink,
} from "jsr:@rootware/log";

// Tee one logger to several destinations.
const logger = createLogger(
  { level: "info" },
  fanoutSink(
    stdoutSink(),
    fileSink("./app.log"), // append-by-default; needs --allow-write
    levelSink(stderrSink(), "error"), // only error/fatal reach stderr
  ),
);

// Route around a flaky primary.
const resilient = failoverSink(remoteSink, fileSink("./fallback.log"));

// Drop records that fail a predicate (unparseable lines pass through).
const tenantOnly = filterSink(stdoutSink(), (record) => record.tenant === "a");

// Adapt any web WritableStream<Uint8Array> (e.g. a compression/transform stream).
const streamed = writableStreamSink(someWritableStream);
```

- **`fileSink(path, { append })`** is Deno-native and permission-minimal (only
  `--allow-write` for the target path); it appends by default, or truncates with
  `{ append: false }`.
- **`fanoutSink(...sinks)`** writes every line to all sinks and aggregates their
  flush/close.
- **`filterSink` / `levelSink`** decode each JSON line to decide whether to
  forward it.
- **`failoverSink(primary, fallback)`** forwards to `fallback` when the primary
  `write` throws or rejects.

## API

The complete, stable public surface (frozen for `1.0` — see
[Stability](#stability-and-the-10-freeze-09)).

**Loggers**

- `createLogger(options?, sink?)` · `createNoopLogger()`

**Sinks**

- `stdoutSink` · `stderrSink` · `memorySink` · `fileSink` · `writableStreamSink`
- `unbufferedSink` · `bufferedSink` · `fanoutSink` · `filterSink` · `levelSink`
  · `failoverSink`

**Levels**

- `levels` · `isLogLevelName` · `getLogLevelNumber` · `shouldLog`

**Observability conventions**

- `logFields` · `eventName` · `isEventName`

**Errors & formatting (advanced / custom sinks)**

- `LogError` · `serializeErrorForLog` · `formatLogRecord` · `normalizeLogInput`
  · `defaultTimestamp`

**Types**

- `Logger` · `LogSink` · `LogRecord` · `LogLevel` · `LogLevelName` ·
  `LogLevelNumber` · `LogValue` · `LogObject` · `LogBindings` · `LoggerOptions`
  · `ChildLoggerOptions` · `MemoryLogSink` · `BufferedSinkOptions` ·
  `FileSinkOptions` · `RedactOptions` · `LogRecordFilter` · `LogSinkResult` ·
  `LogWriteErrorHandler` · `LogFields` · `LogFieldName` · `LogErrorCode` ·
  `LogErrorOptions`

**Subpaths**

- `pino` (default export, from `@rootware/log/compat/pino`)
- `withRequestLogging` (from `@rootware/log/http`)

## Request logging (`0.5`)

`@rootware/log/http` wraps a `Deno.serve`-style handler so each request is
logged safely — no bodies, only the pathname (query secrets never leak), and
headers only when allow-listed:

```ts
import { withRequestLogging } from "jsr:@rootware/log/http";

Deno.serve(withRequestLogging(handler, { logger }));
```

It honors/generates an `x-request-id` (echoed on the response), measures
`durationMs`, escalates the completion level by status (`5xx` → error, `4xx` →
warn), and logs + re-throws a handler that throws. (Hono middleware lives in the
separate `@rootware/hono` package, not here.)

## Observability conventions (`0.7`)

Rootware packages log under a shared vocabulary so records are queryable and
correlatable. Use `logFields` for field names and `eventName` for the
`package.area.action` event convention:

```ts
import { eventName, logFields } from "jsr:@rootware/log";

logger.info({
  [logFields.event]: eventName("http", "request", "completed"),
  [logFields.requestId]: requestId,
  [logFields.status]: 200,
  [logFields.durationMs]: 12,
}, "request completed");
```

`logFields` covers `event`, `requestId`, `traceId`, `spanId`, `actorId`,
`service`, `component`, `operation`, `durationMs`, `attempt`, `status`, `error`.
Event names are lowercase, dot-separated, and three segments
(`package.area.action`) — e.g. `cache.entry.hit`, `storage.object.put`,
`job.completed`; `eventName` validates segments (`isEventName` checks one).

## Testing logs (`0.6`)

`memorySink()` and the `LogRecord` shape are the stable seam test helpers build
on. `@rootware/testing` ships `captureLogs()` — a logger with inline assertions
(`assertEvent`, `assertContains`, `assertCount`) and snapshot-friendly
`normalized()` — composed over this package's `memorySink()` + `createLogger`.

## Benchmarks (`0.8`)

Reproduce locally with `deno task bench` (runs `benchmark/cases/log.bench.ts`
plus the rest of `benchmark/cases/`), or `deno task benchmark` to write a
machine-tagged JSON envelope under `benchmark/results/`. The numbers below come
from a single run on a 12th Gen Intel i7-12700H, Deno 2.8.3 (V8 14.9,
`x86_64-linux`) — treat them as **relative**, not absolute.

**Emitting one structured info record** (`log.write.json`) — each case
serializes the same ~12-field object to a discarding sink:

| logger                           | time/op |     throughput | vs `rootware:unbuffered` |
| -------------------------------- | ------- | -------------: | ------------------------ |
| `rootware:unbuffered` (baseline) | 1.85 µs |   541,000 op/s | —                        |
| `rootware:buffered`              | 3.30 µs |   303,400 op/s | 1.78× slower             |
| `platform:json-line`             | 1.29 µs |   775,200 op/s | 1.43× faster             |
| `npm:pino`                       | 849 ns  | 1,178,000 op/s | 2.18× faster             |
| `std:log`                        | 364 ns  | 2,748,000 op/s | 5.08× faster             |

**A call below the active level** (`log.disabled`, should be near-free):

| logger     | time/op | throughput      |
| ---------- | ------- | --------------- |
| `rootware` | 30.4 ns | 32,900,000 op/s |
| `npm:pino` | 5.3 ns  | —               |
| `std:log`  | 11.0 ns | —               |

**`memorySink` throughput** (`log.memory`, the test sink): `rootware:memorySink`
2.31 µs/op (433,800 op/s).

What the numbers say:

- The write path runs at ~1.85 µs and is ~1.4× a hand-rolled `JSON.stringify`.
  That overhead is the cost of redaction, safe error serialization, child
  bindings, and the timestamp/level/event conventions — skip the logger only if
  you need none of those. (`0.8.1` removed a redundant second serialization
  pass; see below.)
- **`buffered` is slower than `unbuffered` here, not faster.** The benchmark
  sink is a synchronous in-memory discard, so buffering only adds a copy and
  bookkeeping. Buffering pays off when the underlying sink is I/O-bound (a file
  or socket where batching amortizes syscalls), not against a no-op.
- `npm:pino` and `std:log` are faster on the hot write path. The `std:log` case
  uses a JSON formatter so it serializes a comparable object (its default text
  formatter would not); `pino` runs with a synchronous in-process destination
  (no worker transport), its fastest configuration.
- Disabled logging is ~30 ns and effectively free — reach for `isLevelEnabled`
  only when **building** the payload (not the log call) is itself expensive.

### Hot-path optimizations (`0.8.1`)

The write path was ~2.7 µs in `0.8.0`. Records built internally are already
JSON-safe — bindings pass through the sanitizer once at construction, the
per-call object passes through it in `normalizeLogInput`, and errors are
pre-serialized — so the old code paid for a **second** full sanitize pass (and
its intermediate allocation) before `JSON.stringify`. `0.8.1` serializes those
records with a single direct `JSON.stringify` (byte-for-byte identical output,
with a guarded fallback for type-violating fields), precomputes the static
`base + bindings` prefix once per logger, and drops the throwaway per-call
spread temporaries. Net effect: ~30% faster writes (~2.7 µs → ~1.85 µs) and a
faster `memorySink` (~3.37 µs → ~2.31 µs), with **no API or output change**.
Redaction keeps the original sanitize-then-redact path.

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

## Stability and the 1.0 freeze (`0.9`)

`0.9` is the API-freeze candidate: the public surface above was audited, found
intentional (no accidental exports — internal helpers like the record sanitizer
stay unexported), and is now **frozen** to reduce churn toward `1.0`. The
package nonetheless stays **experimental** until it has real-world consumers —
breaking changes remain possible even at `1.0` (the whole `@rootware/*`
workspace holds this stance). The freeze is about minimizing needless churn, not
a production-stability promise.

Frozen contracts:

- **`LogRecord` shape** — `level` (number), `levelName`, `time` (always
  emitted), optional `msg`/`name`/`error`, plus arbitrary structured fields. The
  message and error keys are configurable (`messageKey`/`errorKey`).
- **`LogSink` contract** — `write(line: Uint8Array)` with optional
  `flush()`/`close()`, each returning `void | Promise<void>`.
- **`Logger` interface** — the level methods, `child()`, `isLevelEnabled()`,
  `flush()`, `close()`; `level` stays **read-only** (derive a new level with
  `child(bindings, { level })`, not `logger.level = …`).
- **Redaction** — `redact: string[] | RedactOptions`; dot-separated paths with a
  single-key `*` wildcard; matched leaves become `censor` (default
  `"[Redacted]"`).
- **Error field naming** — the Rootware default key is `error`; the
  `/compat/pino` constructor defaults it to `err` (Pino's name). Override either
  with `errorKey`.
- **Pino compatibility stays subpath-only** — `pino` is exported only from
  `@rootware/log/compat/pino`, never as a root default export, so the root
  module stays explicit (`createLogger`, sinks). This is final for `1.0`.

### Migrating `0.x` → `1.0`

No code changes are required from `0.9`; `1.0` is the same surface with
stability guarantees. The only historical rename, already in effect since `0.2`,
is the internal error serializer `serializeError` → **`serializeErrorForLog`**
(the safe, `expose`-respecting `serializeError` lives in `@rootware/errors`).
Anything relying on a settable `logger.level` should switch to
`child(bindings, { level })` (read-only since `0.1`). Transports, worker
threads, and `pino-pretty` remain out of scope — compose a `LogSink` instead.

## Limitations

This package does not include pretty printing or OpenTelemetry integration yet.
File logging is available through `fileSink` (`0.4`), but there is no rotating
file transport.

## Status

**Experimental.** The public API was audited and **frozen at `0.9`** to reduce
churn on the way to `1.0` — but until this package has real-world consumers it
stays experimental, so breaking changes remain possible **even at `1.0`**. The
version tracks roadmap progress, not a production-stability guarantee.

## License

MIT

[Back to Rootware](../../../README.md)
