# `@rootware/log` Specification and Roadmap

Status: experimental, current package manifest version `@rootware/log@0.6.0`\
Repository: `gilvandovieira/rootware`\
Package path: `packages/foundation/log`\
JSR package: `jsr:@rootware/log`\
Last updated: 2026-06-26

---

## 1. Product Positioning

`@rootware/log` is the structured logging package for the Rootware workspace.

It should become a Deno-first, JSR-native structured logger with Pino-shaped
ergonomics, explicit sink composition, deterministic test logging, and no
dependency on Node/npm compatibility layers.

The package exists because Deno applications often want the ergonomics of
Pino-style structured logging, but Pino is consumed in Deno through the npm
compatibility path. Rootware should offer a native alternative under the
`@rootware` scope.

The target identity is:

> `@rootware/log` is a JSR-native structured logger for Deno backends. It
> provides Pino-like logging ergonomics, JSON-line records, child loggers,
> explicit sinks, and first-class support for buffered and unbuffered logging in
> tests.

The package should be treated as infrastructure, not as a demo. It is one of the
foundational packages in the Rootware dependency ladder and will be used by
higher-level packages such as `@rootware/testing`, `@rootware/http`,
`@rootware/cache`, `@rootware/storage`, `@rootware/session`,
`@rootware/migrate`, `@rootware/orm`, and `@rootware/jobs`.

---

## 2. Rootware Workspace Fit

Rootware is a Deno/JSR workspace of independently published packages.

The intended package dependency order is:

1. `@rootware/errors`
2. `@rootware/schema`
3. `@rootware/env`
4. `@rootware/log`
5. `@rootware/testing`
6. `@rootware/http`
7. `@rootware/cache`
8. `@rootware/storage`
9. `@rootware/session`
10. `@rootware/migrate`
11. `@rootware/orm`
12. `@rootware/jobs`

`@rootware/log` is correctly placed after `@rootware/errors`, because
logger-specific failures should be represented with Rootware error primitives.
Its runtime dependency graph remains only `@rootware/errors`; the
dependency-free `@rootware/schema` leaf is unrelated to logging.

`@rootware/log` must not depend on packages later in the order. In particular,
it must not depend on:

- `@rootware/testing`
- `@rootware/http`
- `@rootware/cache`
- `@rootware/storage`
- `@rootware/session`
- `@rootware/migrate`
- `@rootware/orm`
- `@rootware/jobs`

Higher-level packages may accept a `Logger` interface from `@rootware/log`, but
`@rootware/log` should remain low-level and composable.

Canonical namespace rule:

- This package is always referred to as `@rootware/log`.
- Do not use `@rootware/logger` in docs, examples, integrations, or issue
  titles.
- Higher-level packages should name injected values `logger` if that reads
  naturally, but the package name remains `@rootware/log`.

---

## 3. Current `0.3.0` State

The current package is published as:

```ts
import { createLogger, stdoutSink } from "jsr:@rootware/log";
```

The package metadata defines:

```json
{
  "name": "@rootware/log",
  "version": "0.3.0",
  "exports": {
    ".": "./mod.ts",
    "./compat/pino": "./compat/pino/mod.ts"
  },
  "license": "MIT",
  "description": "Structured JSON logger for Rootware packages and Deno backends."
}
```

The root implementation entrypoint is:

```txt
packages/foundation/log/mod.ts
```

The current package README describes the package as an experimental JSR-native
structured JSON logger for Rootware packages and Deno backends.

### Current Exported Concepts

The package currently exposes the following major API surface:

```ts
createLogger;
createNoopLogger;
stdoutSink;
stderrSink;
memorySink;
bufferedSink;
unbufferedSink;
serializeErrorForLog;
normalizeLogInput;
formatLogRecord;
defaultTimestamp;
isLogLevelName;
getLogLevelNumber;
shouldLog;
levels;
LogError;
```

It also exposes the main types:

```ts
LogLevelName;
LogLevelNumber;
LogLevel;
LogErrorCode;
LogValue;
LogObject;
LogBindings;
LogRecord;
LogSink;
Logger;
LoggerOptions;
ChildLoggerOptions;
MemoryLogSink;
BufferedSinkOptions;
LogErrorOptions;
```

### Current Features

`0.3.0` provides the correct foundation, production hardening, and a Pino-shaped
compatibility subpath:

- JSON-line structured logging.
- Standard numeric log levels: `trace`, `debug`, `info`, `warn`, `error`,
  `fatal`, and `silent`.
- `createLogger()` as the main constructor.
- `stdoutSink()` and `stderrSink()` for Deno stream output.
- `memorySink()` for deterministic tests.
- `bufferedSink()` for batched writes.
- `serializeErrorForLog()` for internal, with-stack diagnostics.
- Redaction, configurable message/error keys, `logger.isLevelEnabled`, and
  `onWriteError`.
- `@rootware/log/compat/pino` for common Pino call forms and migration.
- `unbufferedSink()` for immediate writes.
- `createNoopLogger()` for dependency injection and tests.
- `child()` logger support with merged bindings.
- `serializeError()` with support for Rootware errors.
- `LogError` extending `RootwareError`.
- Safe-ish JSON serialization for dates, errors, arrays, bigints, circular
  references, non-finite numbers, functions, symbols, and unknown values.
- Tests for structured records, child bindings, level filtering, memory sink
  behavior, buffered flushing, noop logger behavior, and helper functions.

### Current Example

```ts
import { createLogger, stdoutSink } from "jsr:@rootware/log";

const logger = createLogger({
  level: "info",
  name: "api",
}, stdoutSink());

logger.info({ port: 8000 }, "server started");
```

### Current Test Example

```ts
import { createLogger, memorySink, unbufferedSink } from "jsr:@rootware/log";
import { assertEquals } from "jsr:@std/assert";

Deno.test("logs user creation", () => {
  const sink = memorySink();
  const logger = createLogger({ level: "debug" }, unbufferedSink(sink));

  logger.info({ userId: "u_123" }, "user created");

  const records = sink.records();
  assertEquals(records[0].msg, "user created");
  assertEquals(records[0].userId, "u_123");
});
```

---

## 4. Core Product Goals

### 4.1 Deno-first and JSR-native

The package should avoid Node-only abstractions as public primitives.

Preferred primitives:

- `Uint8Array`
- `ReadableStream`
- `WritableStream`
- `Request`
- `Response`
- `Deno.stdout`
- `Deno.stderr`
- `Deno.open`
- `crypto.randomUUID()`
- Web-standard error and abort patterns

Avoid making these primary public contracts:

- Node streams
- CommonJS exports
- worker-thread transport assumptions
- `process.stdout` / `process.stderr`
- npm-only plugin protocols

### 4.2 Pino-shaped ergonomics

The package should feel familiar to Pino users:

```ts
logger.info("server started");
logger.info({ port: 8000 }, "listening");
logger.error(new Error("boom"), "request failed");
logger.child({ requestId: "req_123" }).debug("loaded user");
```

The compatibility goal is practical application compatibility, not exact
reimplementation of every Pino internal or Node transport feature.

### 4.3 Deterministic test logs

The strongest differentiator is the testing story.

Developers should be able to assert logs without patching `console`, capturing
stdout, waiting for timers, or depending on external processes.

```ts
const sink = memorySink();
const logger = createLogger({ level: "debug" }, unbufferedSink(sink));

logger.info({ actorId: "user_123" }, "actor loaded");

expectLog(sink).toContain({
  levelName: "info",
  actorId: "user_123",
  msg: "actor loaded",
});
```

`expectLog()` should probably live in `@rootware/testing`, not in
`@rootware/log`, to preserve the dependency order.

### 4.4 Explicit buffering

Buffering should not be an invisible behavior hidden deep inside
`LoggerOptions`.

The preferred model is sink composition:

```ts
const logger = createLogger(
  { level: "info", name: "worker" },
  bufferedSink(stdoutSink(), {
    maxRecords: 100,
    flushIntervalMs: 1_000,
  }),
);
```

For tests:

```ts
const logger = createLogger(
  { level: "debug" },
  unbufferedSink(memorySink()),
);
```

This keeps the logger core small and makes performance behavior visible.

### 4.5 Rootware-wide observability baseline

All Rootware packages should eventually accept a `Logger` or use a
`createNoopLogger()` fallback.

Examples:

```ts
createHttpClient({ logger });
createCache({ logger });
createMigrator({ logger });
createDatabase({ logger });
createJobQueue({ logger }); // worker = queue.worker({ logger })
```

The log package should define the common record shape, level conventions, error
serialization behavior, and sink abstraction for the entire workspace.

---

## 5. Non-goals

`@rootware/log` should not try to become a full observability platform.

Non-goals for the core package:

- Full Pino transport compatibility.
- `pino.transport()` clone in `0.x`.
- `pino-pretty` protocol compatibility as a core requirement.
- OpenTelemetry exporter in the core package.
- Cloud vendor-specific log shipping in the core package.
- Heavy formatting DSL.
- Runtime-global logger registry.
- Framework-specific middleware in the core entrypoint.
- Automatic request body logging.
- Automatic secret inspection by default.
- Circular dependency with `@rootware/testing` or `@rootware/http`.

Framework adapters should be secondary entrypoints or separate packages if they
grow too large.

---

## 6. Public API Design

### 6.1 Main Constructor

Current:

```ts
export function createLogger(
  options?: LoggerOptions,
  sink?: LogSink,
): Logger;
```

Compatibility decision for `0.x`:

Do not add a root default export yet. The root module should stay explicit and
stable while Pino-shaped behavior matures behind a compatibility subpath.

Preferred `0.x` target:

```ts
import pino from "jsr:@rootware/log/compat/pino";

const logger = pino({ level: "info" });
logger.info({ port: 8000 }, "server started");
```

This is a planned subpath, not the current package surface. The current
`packages/foundation/log/deno.json` exports only `"./mod.ts"`; do not add
`/compat/pino` to the exports map until the file, tests, and compatibility
fixtures exist.

A future root default export can be reconsidered only after compatibility
fixtures exist and the project can clearly explain what is and is not compatible
with Pino.

### 6.2 Logger Interface

Current shape:

```ts
export interface Logger {
  readonly level: LogLevelName;
  readonly bindings: LogBindings;

  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(...args: unknown[]): void;

  child(bindings: LogBindings, options?: ChildLoggerOptions): Logger;
  flush(): LogSinkResult;
  close(): LogSinkResult;
}
```

Future consideration:

```ts
logger.level = "debug";
```

Pino users expect mutable level control. Rootware can either support a mutable
`level` or keep the safer immutable model and provide:

```ts
logger.withLevel("debug");
```

Decision needed before `1.0`.

Recommended approach:

- Keep `level` readonly in `0.1.x`.
- Add `withLevel(level)` in `0.2` or `0.3` if needed.
- Add mutable `logger.level` only if compatibility pressure is strong.

### 6.3 Log Input Normalization

The logger should support the following common call forms:

```ts
logger.info("message");
logger.info({ userId: "u_123" }, "message");
logger.error(new Error("boom"), "message");
logger.error({ userId: "u_123" }, new Error("boom"), "message");
```

Current behavior supports plain objects, strings, and `Error` values.

Future behavior should define precedence clearly:

1. First plain object becomes structured fields.
2. First `Error` becomes serialized error field.
3. First string becomes `msg`.
4. Additional values are either ignored, serialized under `args`, or handled
   through compatibility mode.

Recommended default:

- Keep the current simple behavior for `0.1.x`.
- Add optional `args` capture later.
- Do not silently stringify arbitrary non-object values unless compatibility
  mode is explicitly enabled.

### 6.4 Log Record Shape

Current target shape:

```ts
export interface LogRecord {
  level: LogLevelNumber;
  levelName: LogLevelName;
  time: string;
  msg?: string;
  name?: string;
  error?: Record<string, unknown>;
  [key: string]: unknown;
}
```

Example output:

```json
{
  "level": 30,
  "levelName": "info",
  "time": "2026-06-26T12:00:00.000Z",
  "name": "api",
  "requestId": "req_123",
  "msg": "server started"
}
```

Compatibility notes:

- `level`, `time`, and `msg` align with the Pino mental model.
- `levelName` is a Rootware extension and improves readability in tests and
  downstream consumers.
- `error` is currently used instead of Pino's common `err` key.

Decision needed:

Should Rootware keep `error` as the canonical field, or add an option to emit
`err` for Pino compatibility?

Recommended path:

```ts
createLogger({ errorKey: "err" });
createLogger({ errorKey: "error" });
```

Default should remain `error` until compatibility mode is introduced.

### 6.5 Levels

Current mapping:

```ts
trace: 10;
debug: 20;
info: 30;
warn: 40;
error: 50;
fatal: 60;
silent: Infinity;
```

This mapping should remain stable.

Future options:

```ts
createLogger({
  customLevels: {
    audit: 35,
    security: 45,
  },
});
```

Recommendation:

- Do not add custom levels before `0.4`.
- Rootware package logs should use the standard six levels.
- Add event names and structured fields instead of inventing many levels.

---

## 7. Sink Architecture

### 7.1 Sink Contract

Current:

```ts
export interface LogSink {
  write(line: Uint8Array): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}
```

This is the right abstraction.

It is small, Deno-friendly, testable, and not tied to Node streams.

### 7.2 Current Sinks

Current sinks:

```ts
stdoutSink();
stderrSink();
memorySink();
bufferedSink(sink, options);
unbufferedSink(sink);
```

Current test-focused sink:

```ts
const sink = memorySink();
const logger = createLogger({}, unbufferedSink(sink));
logger.info("hello");
sink.lines();
sink.records();
sink.clear();
```

### 7.3 Recommended Future Sinks

Add these incrementally:

```ts
fileSink(path: string | URL, options?: FileSinkOptions)
writableStreamSink(stream: WritableStream<Uint8Array>)
textWriterSink(writer: { write(text: string): unknown })
fanoutSink(sinks: readonly LogSink[])
filterSink(sink: LogSink, predicate: (record: LogRecord) => boolean)
mapSink(sink: LogSink, mapper: (record: LogRecord) => LogRecord)
failoverSink(primary: LogSink, fallback: LogSink)
```

Keep advanced sinks out of `0.1.x`.

### 7.4 Buffered Sink Semantics

Current options:

```ts
export interface BufferedSinkOptions {
  readonly maxRecords?: number;
  readonly maxBytes?: number;
  readonly flushIntervalMs?: number;
  readonly flushOnError?: boolean;
}
```

Define the guarantees explicitly:

- `maxRecords` flushes when record count reaches the threshold.
- `maxBytes` flushes when encoded byte count reaches the threshold.
- `flushIntervalMs` flushes periodically.
- `flushOnError` flushes immediately for `error` and `fatal` records.
- `flush()` writes pending logs.
- `close()` flushes pending logs and then closes the inner sink.
- If the inner sink fails, pending logs should not be silently discarded.

Important roadmap item:

The failure behavior for async sink writes must be made deterministic. Avoid
promise rejections that throw outside the caller's control. Prefer surfacing
async failures through `flush()` or `close()`.

### 7.5 Unbuffered Sink Semantics

`unbufferedSink()` should mean:

- no batching;
- no timer;
- no hidden delay;
- inner sink receives every encoded line immediately;
- ideal for test assertions and local debugging.

For tests, `unbufferedSink(memorySink())` should remain the canonical pattern.

---

## 8. Error Serialization

Current behavior serializes `Error` and `RootwareError` values into JSON-safe
records.

Current goals:

- Preserve `name`.
- Preserve `message`.
- Preserve `stack` when available.
- Preserve Rootware-specific fields: `code`, `status`, `expose`, `severity`,
  `details`.
- Preserve `cause` recursively.
- Avoid crashing on circular causes.
- Avoid crashing on unknown thrown values.

Recommended future behavior:

```ts
createLogger({
  error: {
    key: "error",
    stack: "development-only",
    causeDepth: 5,
    includeDetails: true,
  },
});
```

Security decision:

- `stack` is useful in development and internal production logs.
- Public logs or customer-facing error payloads should not expose stack traces.
- Logging policy should be explicit and environment-driven, probably through
  `@rootware/env` at the application layer.

`@rootware/log` should provide the primitives, not own application policy.

Naming caveat — **resolved in `0.2.0`.** `@rootware/log` previously exported a
`serializeError()` that includes `stack` (correct for logs), which collided with
`@rootware/errors`' safe, no-stack `serializeError()`. The log variant is now
exported as `serializeErrorForLog()` (with stack, all fields, ignores `expose`);
reach for `@rootware/errors`' `serializeError` for user-facing payloads. See
`../errors/ROADMAP.md`, Chunk 9.

---

## 9. Redaction and Security

The current README correctly says that application code should avoid passing
sensitive fields as log objects.

That is not enough for long-term production use.

### 9.1 Redaction Goals

Add first-class redaction support:

```ts
createLogger({
  redact: [
    "password",
    "secret",
    "token",
    "accessToken",
    "refreshToken",
    "authorization",
    "cookie",
    "set-cookie",
  ],
});
```

Potential shape:

```ts
export type RedactPath = string;

export interface RedactOptions {
  readonly paths: readonly RedactPath[];
  readonly censor?: string;
  readonly remove?: boolean;
}
```

Recommended defaults:

- No default deep redaction in `0.1.x`.
- Add explicit redaction in `0.2`.
- Add optional preset in `0.3`:

```ts
redact: "common";
```

### 9.2 Never Log by Default

HTTP adapters must not log these by default:

- request body;
- response body;
- `Authorization` header;
- `Cookie` header;
- `Set-Cookie` header;
- full query strings unless configured;
- raw form data;
- uploaded file contents.

### 9.3 Safe Fields for HTTP Logs

HTTP middleware should default to safe metadata:

```ts
{
  event: "http.request.completed",
  method: "GET",
  path: "/posts/:id",
  status: 200,
  durationMs: 12,
  requestId: "req_123"
}
```

---

## 10. Pino Compatibility Contract

The project should use careful wording:

> Pino-shaped, Pino-inspired, and compatible with common Pino application
> logging patterns.

Do not claim full Pino compatibility until compatibility tests exist.

### 10.1 Compatibility Target

Target support:

```ts
import pino from "jsr:@rootware/log/compat/pino";

const logger = pino({ level: "info" });

logger.info("server started");
logger.info({ port: 8000 }, "listening");
logger.warn({ userId: "u_123" }, "quota nearly reached");
logger.error(new Error("boom"), "request failed");
logger.child({ requestId: "req_123" }).debug("loaded user");
```

Common options to consider:

```ts
{
  name: "api",
  level: "info",
  base: { service: "api" },
  timestamp: true,
  messageKey: "msg",
  errorKey: "err",
  serializers: { err: serializeError },
  redact: ["password", "token"],
}
```

Two clarifications, both reconciled with the rest of this document and with the
shipped code:

- The import above uses the `/compat/pino` subpath, matching §6.1 and §10.3. An
  earlier draft of this section imported `pino` from the package root
  (`jsr:@rootware/log`), which §6.1/§10.3 explicitly forbid during `0.x`. The
  root module stays explicit (`createLogger`, sinks); `pino` only exists under
  `/compat/pino`.
- `errorKey: "err"` here is the _Pino-compatibility_ value. The Rootware default
  is `error` — the shipped `v0.1` logger emits the serialized error under the
  `error` key and has no `errorKey` option yet (the option is `0.2` work,
  below). So: default `error`, compat mode flips to `err`. Do not present `err`
  as the current default anywhere.

### 10.2 Compatibility Non-targets

Do not target initially:

- `pino.transport()` exact behavior.
- `pino.destination()` exact behavior.
- worker-thread transport protocol.
- `sonic-boom` internals.
- `pino-pretty` exact integration.
- Node stream plugin compatibility.
- Pino symbol internals.
- browser bundler compatibility quirks.

### 10.3 Compatibility Entry Decision

Use the compatibility subpath during `0.x`.

```ts
import pino from "jsr:@rootware/log/compat/pino";
```

Do not expose a root default `pino` export until compatibility fixtures are
strong enough to justify it.

The root module should remain explicit:

```ts
import {
  bufferedSink,
  createLogger,
  memorySink,
  stdoutSink,
  unbufferedSink,
} from "jsr:@rootware/log";
```

This avoids overpromising Pino compatibility while keeping the migration path
clear.

---

## 11. Runtime Targets

Primary runtime:

- Deno 2.x

Secondary compatibility targets:

- Deno Deploy
- Bun, where practical
- Web-standard server runtimes, where practical

Do not optimize for Node first.

Node support may emerge naturally through Web APIs, but the package should not
sacrifice Deno-native behavior for Node compatibility.

---

## 12. Integration with Other Rootware Packages

### 12.1 `@rootware/errors`

Current dependency is correct.

`@rootware/log` should use `RootwareError` for logger-level failures:

- invalid level;
- sink write failure;
- serialization failure;
- closed sink write;
- unknown logger error.

### 12.2 `@rootware/env`

`@rootware/log` should not depend on `@rootware/env`, but the README should show
a pattern:

```ts
const logger = createLogger({
  level: config.LOG_LEVEL,
});
```

`@rootware/env` can provide `LOG_LEVEL` validation examples.

### 12.3 `@rootware/testing`

`@rootware/log` provides `memorySink()`.

`@rootware/testing` should provide assertions and helpers:

```ts
captureLogs();
assertLog();
assertNoLogs();
assertLogCount();
assertLogEvent();
```

Example future API:

```ts
const logs = captureLogs();
const logger = logs.logger;

logger.info({ event: "user.created", userId: "u_123" });

logs.assertContains({
  event: "user.created",
  userId: "u_123",
});
```

### 12.4 `@rootware/http`

`@rootware/http` should use `Logger` for:

- retry attempts;
- request failures;
- timeouts;
- circuit breaker events, if added;
- request IDs.

Do not put HTTP-specific behavior into `@rootware/log` core unless it is a
secondary export.

### 12.5 `@rootware/migrate`

Migration logs should use structured events:

```ts
logger.info({
  event: "migration.applied",
  migration: "202606260001_create_users",
  durationMs: 42,
}, "migration applied");
```

### 12.6 `@rootware/orm`

The ORM should accept a logger or noop logger.

Example:

```ts
const db = createDatabase({
  logger,
  logQueries: true,
});
```

Recommended ORM log events:

```txt
orm.query.executed
orm.query.failed
orm.transaction.started
orm.transaction.committed
orm.transaction.rolled_back
orm.connection.opened
orm.connection.failed
```

Avoid logging raw parameter values by default. Query logging must be
configurable because SQL parameters may contain secrets or personal data.

### 12.7 `@rootware/jobs`

Jobs should log:

```txt
job.enqueued
job.started
job.completed
job.failed
job.retried
job.dead_lettered
```

Each job log should include:

```txt
jobId
jobType
attempt
queue
durationMs
error, if failed
```

---

## 13. Documentation Requirements

The current README covers the `0.3.0` surface. Future releases should expand it
as new compatibility and integration surfaces ship.

### 13.1 README Structure

Recommended README:

```md
# @rootware/log

Structured JSON logging for Deno and Rootware packages.

## Install

## Quick Start

## Why Rootware Log?

## Pino-shaped API

## Sinks

## Testing with memorySink

## Buffered vs Unbuffered Logging

## Error Serialization

## Security and Redaction

## Runtime Support

## API

## Limitations

## Roadmap

## License
```

### 13.2 Examples to Include

Basic logging:

```ts
const logger = createLogger({ level: "info", name: "api" }, stdoutSink());
logger.info({ port: 8000 }, "server started");
```

Child logger:

```ts
const requestLogger = logger.child({ requestId: "req_123" });
requestLogger.info("request started");
```

Error logging:

```ts
try {
  await runTask();
} catch (error) {
  logger.error(error, "task failed");
}
```

Buffered logging:

```ts
const logger = createLogger(
  { level: "info", name: "worker" },
  bufferedSink(stdoutSink(), { maxRecords: 100, flushIntervalMs: 1_000 }),
);
```

Test logging:

```ts
const sink = memorySink();
const logger = createLogger({ level: "debug" }, unbufferedSink(sink));
```

Noop logging:

```ts
const logger = createNoopLogger();
```

---

## 14. Testing Strategy

Current tests cover the `0.3.0` root and Pino-compatibility surfaces.

Add test groups by category.

### 14.1 Unit Tests

Required coverage:

- level validation;
- level filtering;
- `silent` mode;
- timestamp injection;
- base bindings;
- logger name;
- child binding merge;
- child level override;
- object + message input;
- error + message input;
- object + error + message input;
- circular object serialization;
- bigint serialization;
- date serialization;
- non-finite number serialization;
- function/symbol omission;
- `formatLogRecord()` newline guarantee;
- `memorySink().lines()`;
- `memorySink().records<T>()`;
- `memorySink().clear()`;
- `bufferedSink().flush()`;
- `bufferedSink().close()`;
- `bufferedSink()` flush on `maxRecords`;
- `bufferedSink()` flush on `maxBytes`;
- `bufferedSink()` flush on error when enabled;
- failed sink write behavior;
- closed sink write behavior;
- noop logger behavior.

### 14.2 Compatibility Tests

Add a small compatibility fixture suite.

The goal is not to import Pino as a test oracle at runtime. The goal is to
define expected common output shapes.

Example fixtures:

```txt
logger.info("hello")
logger.info({ a: 1 }, "hello")
logger.error(new Error("boom"), "failed")
logger.child({ requestId: "1" }).info("hello")
```

Each fixture should assert:

- record count;
- level number;
- message key;
- bindings;
- error shape;
- newline-delimited JSON;
- no unserializable values.

### 14.3 Integration Tests

Only add integration tests when needed.

Potential integration tests:

- writing to temporary file sink;
- writing to `WritableStream`;
- Hono middleware adapter, later;
- Deno.serve request logging adapter, later.

Do not add real network calls to package tests.

### 14.4 Benchmark Tests

Benchmarks should eventually compare:

- `console.log(JSON.stringify(record))`;
- `@std/log`;
- `npm:pino` under Deno;
- `@rootware/log` unbuffered stdout;
- `@rootware/log` buffered stdout;
- `@rootware/log` memory sink.

Metrics:

- logs per second;
- allocation pressure;
- latency per log call;
- overhead when below active log level;
- Deno `--watch` reload memory behavior;
- package graph size;
- cold startup impact.

Benchmark output should be factual and conservative. Do not claim to beat Pino
unless measurements prove it.

---

## 15. Publishing and Release Process

Each Rootware package is independently published to JSR.

For `@rootware/log`, the release process should be:

1. Update `deno.json` version.
2. Update `README.md`.
3. Update public JSDoc in `mod.ts`.
4. Run formatting.
5. Run linting.
6. Run type checking.
7. Run tests.
8. Run coverage if relevant.
9. Run publish dry-run.
10. Publish manually through the GitHub Actions `Publish` workflow.

Commands:

```sh
deno task fmt:check
deno task lint
deno task check
deno task test
deno task publish:dry:log
```

Full local validation:

```sh
deno task ci
deno task publish:dry
```

Rootware publishing should stay manual. Pull requests and normal CI should only
run validation and `deno publish --dry-run`.

---

## 16. Version Roadmap

### `0.1.x` — Stabilize the Published Foundation

Goal: polish the already published `0.1.0` API without broadening scope.

Scope:

- Improve README formatting and examples.
- Add complete JSDoc to all public exports.
- Add tests for every public helper.
- Add tests for serialization edge cases.
- Add tests for sink failure behavior.
- Add examples for Rootware package usage.
- Clarify limitation: Pino-shaped, not full Pino transport compatibility.
- Clarify that `memorySink()` is for deterministic tests.
- Clarify buffered sink flush semantics.
- Clarify security limitations around secrets.

Acceptance criteria:

- `deno task ci` passes.
- `deno task publish:dry:log` passes.
- README has examples for basic, child, error, memory, buffered, and noop usage.
- Public JSDoc is present for all exported types and functions.

### `0.2.0` — Production Core Hardening

Goal: make the core logger safer and more explicit for real applications.

Status: done in `0.2.0`.

Scope:

- Add redaction support.
- Add configurable `messageKey`.
- Add configurable `errorKey`.
- Add configurable timestamp behavior.
- Add safer async sink failure semantics.
- Add `withLevel()` or a level update strategy.
- Add `logger.isLevelEnabled(level)`.
- Add `logger.bindings` behavior tests.
- Add configurable base fields.
- Add stricter public type tests.

Potential API:

```ts
const logger = createLogger({
  level: "info",
  name: "api",
  base: { service: "api" },
  messageKey: "msg",
  errorKey: "error",
  redact: ["password", "token", "authorization"],
});
```

Acceptance criteria:

- Redaction works for top-level and nested fields.
- Existing `0.1` examples still work.
- New options are documented.
- Async sink failure behavior is documented and tested.

### `0.3.0` — Pino-shaped Compatibility Layer — **done (`0.3.0`)**

Goal: make migration from common Pino application usage straightforward.

Shipped:

- `pino()` compatibility constructor under the `/compat/pino` subpath, with a
  Pino-style default export
  (`import pino from "jsr:@rootware/log/compat/pino"`). The root module stays
  explicit (`createLogger`, sinks).
- Common Pino call forms: `info("msg")`, `info({ field }, "msg")`,
  `error(new Error(), "msg")`, and `child(bindings, { level, serializers })`.
- `serializers` option — per-field serializers plus an error serializer keyed by
  `errorKey`/`err`/`error`.
- `base` bindings merged onto every record; `name` field threaded through.
- `timestamp` compatibility — `true`/omitted (default ISO), a custom function,
  or `false` (blanks the always-present `time` field).
- `messageKey` (default `"msg"`) and `errorKey` (Pino default `"err"`;
  Rootware's own default remains `"error"`).
- Compatibility fixtures in `compat/pino/mod_test.ts` and a `pino` →
  `@rootware/log` migration guide/table in the README.

Compatibility non-targets (documented): `transport`/`destination`, worker
threads, `pino-pretty`, settable `logger.level`, and Pino symbol internals.

Possible API:

```ts
import pino from "jsr:@rootware/log/compat/pino";

const logger = pino({ level: "info" });
logger.info({ port: 8000 }, "server started");
```

Acceptance criteria:

- Common Pino-style examples work.
- Compatibility limitations are documented.
- No Node stream or transport assumptions are introduced into the core.

### `0.4.0` — Sink Expansion — **done (`0.4.0`)**

Goal: make sinks practical beyond stdout and memory.

Shipped:

- `fileSink(path, { append })` — Deno-native (`Deno.openSync` + `writeSync`),
  permission-minimal (needs only `--allow-write` for the target path). Throws a
  `LogError` (`LOG_WRITE_FAILED`) when `Deno` is absent, so non-Deno runtimes
  fail clearly instead of crashing.
- `writableStreamSink(stream)` — adapts any standard
  `WritableStream<Uint8Array>` (web streams, `Deno.stdout.writable`, compression
  streams) by holding a single writer; `close()` releases it.
- `fanoutSink(...sinks)` — writes every line to all sinks and aggregates their
  flush/close results, so one logger can tee to stdout + file + memory.
- `filterSink(sink, predicate)` and `levelSink(sink, minLevel)` — drop records
  that fail a predicate / fall below a level by decoding each JSON line; lines
  that do not parse pass through untouched.
- `failoverSink(primary, fallback)` — routes to `fallback` when the primary's
  `write` throws or rejects, with deterministic (awaited) failure handling.
- Pure sinks (`writableStreamSink`, `fanoutSink`, `filterSink`, `levelSink`,
  `failoverSink`) are covered by in-memory unit tests in the default suite;
  `fileSink` has a temporary-file integration test gated behind `--allow-write`.

Acceptance criteria:

- File sink is Deno-native and permission-minimal. ✔
- Web stream sink works with standard `WritableStream<Uint8Array>`. ✔
- All sink behavior is covered by tests. ✔

### `0.5.0` — HTTP Logging Adapters — **done (`0.5.0`)**

Goal: provide production-safe request logging for Deno fetch-style servers.

Shipped — the `@rootware/log/http` subpath:

- **`withRequestLogging(handler, options)`** — wraps a `Deno.serve`-style
  handler and emits a structured record per request: `http.request.received`
  (debug) then `http.request.completed` (or `http.request.failed` on a thrown
  handler, re-thrown unchanged). Logging never alters the response except for
  the optional `x-request-id` echo.
- **Request ID** — honors an inbound `x-request-id` (configurable header) or
  generates one (`crypto.randomUUID`); echoed on the response by default.
- **Duration measurement** — `durationMs` via an injectable clock.
- **Safe header policy** — **bodies are never logged**, the query string is
  dropped (only `pathname` is logged, so query secrets never leak), and headers
  are logged only when explicitly allow-listed (`logHeaders`).
- **Status/error logging** — completion level escalates with status (`5xx` →
  error, `4xx` → warn, else the configured `level`).

Hono middleware remains the dedicated `@rootware/hono` package (decided; not a
`/hono` subpath), so it is out of scope here. `/compat/pino` and `/http` stay on
`@rootware/log` because they carry no external dependency.

Possible API:

```ts
import { withRequestLogging } from "jsr:@rootware/log/http";

Deno.serve(withRequestLogging(handler, { logger }));
```

Hono option (lives in the dedicated `@rootware/hono` package, **not** a
`@rootware/log/hono` subpath — see `../../../roadmaps/adapters.md`):

```ts
import { loggerMiddleware } from "jsr:@rootware/hono";

app.use(loggerMiddleware({ logger }));
```

The request-logging middleware for Hono is folded into `@rootware/hono` so there
is exactly one home for Hono integration. The `/compat/pino` and `/http`
subpaths remain on `@rootware/log` because they carry no external dependency;
Hono does, so it is a separate package.

Acceptance criteria:

- No sensitive request data is logged by default.
- Request logging is deterministic in tests.
- Middleware does not create a circular dependency with `@rootware/http`.

### `0.6.0` — Testing Package Integration — **done (`0.6.0`)**

Goal: make log assertions clean through `@rootware/testing`.

Done in `@rootware/log` (no behavioral change — the contract was already
stable): `memorySink()`, the `LogRecord` shape, and the `MemoryLogSink`/
`LogRecord`/`LogLevelName` types stay frozen and are exported for the test
helpers below.

Done in `@rootware/testing` (`0.6.0`): `captureLogs()` returns a `CapturedLogs`
handle — a logger plus inline assertions (`assertContains`, `assertEvent`,
`assertCount`, `assertEmpty`) and snapshot-friendly `normalized()` (strips the
volatile `time` field). It composes the same `memorySink()` + `createLogger`
this package exposes, keeping the dependency direction clean (`testing` →
`log`).

Possible API in `@rootware/testing`:

```ts
const logs = captureLogs();
const logger = logs.logger;

logger.info({ event: "user.created", userId: "u_123" });

logs.assertContains({ event: "user.created" });
logs.assertCount(1);
```

Acceptance criteria:

- Test helpers do not require stdout capture.
- Test helpers do not require timers.
- Test helpers work with child loggers.

### `0.7.0` — Observability Conventions

Goal: define event naming and conventions for Rootware packages.

Scope:

- Add recommended event naming conventions.
- Add standard field names.
- Add package-level logging guidelines.
- Add documentation for logs emitted by Rootware packages.

Standard fields:

```txt
event
requestId
traceId
spanId
actorId
service
component
operation
durationMs
attempt
status
error
```

Event naming convention:

```txt
package.area.action
```

Examples:

```txt
http.request.completed
cache.entry.hit
cache.entry.miss
storage.object.put
migration.applied
orm.query.executed
job.completed
```

Acceptance criteria:

- Higher-level package specs can reference this document.
- Event naming is stable enough for downstream parsing.

### `0.8.0` — Benchmarks and Performance Work

Goal: prove the package is fast enough and Deno-native enough.

Scope:

- Add benchmark harness.
- Compare buffered and unbuffered sinks.
- Compare disabled log overhead.
- Compare memory sink throughput.
- Compare npm Pino under Deno.
- Compare `@std/log` where appropriate.
- Measure Deno `--watch` memory behavior.

Acceptance criteria:

- Benchmarks are reproducible.
- Results include machine/runtime details.
- README claims are based on actual benchmark data.
- No unsubstantiated performance claims.

### `0.9.0` — API Freeze Candidate

Goal: prepare for `1.0`.

Scope:

- Audit all exported names.
- Remove accidental exports.
- Freeze record shape.
- Freeze sink contract.
- Freeze logger interface.
- Finalize compatibility story, including whether the `/compat/pino` constructor
  remains subpath-only or graduates to a root default export.
- Finalize redaction behavior.
- Finalize error field naming.
- Finalize subpath exports.
- Finalize JSDoc.

Acceptance criteria:

- No known breaking changes planned.
- Compatibility limitations are documented.
- Migration guide exists from `0.x` to `1.0`.

### `1.0.0` — Stable Core

Goal: stable structured logger for Deno/JSR production projects.

Minimum requirements:

- Stable `createLogger()` API.
- Stable `Logger` interface.
- Stable `LogSink` interface.
- Stable `LogRecord` shape.
- Stable `memorySink()` test behavior.
- Stable `bufferedSink()` flush behavior.
- Stable redaction API.
- Stable error serialization behavior.
- Stable README and API docs.
- Clear Pino compatibility documentation.
- CI and publish dry-run green.
- Benchmarks documented.

`1.0.0` should not require full Pino transport compatibility.

---

## 17. Suggested Issue Backlog

### Documentation

- [ ] Expand `README.md` into proper sections.
- [ ] Add Pino-shaped migration notes.
- [ ] Add buffered vs unbuffered explanation.
- [ ] Add security/redaction warning.
- [ ] Add testing guide using `memorySink()`.
- [ ] Add Rootware package logging conventions.

### API Hardening

- [ ] Decide whether to keep `error` or support `err` as a compatibility field.
- [ ] Add configurable `messageKey`.
- [ ] Add configurable `errorKey`.
- [ ] Add redaction support.
- [ ] Add `isLevelEnabled()`.
- [ ] Decide mutable vs immutable logger level.
- [ ] Define async sink failure semantics.

### Sinks

- [ ] Add `fileSink()`.
- [ ] Add `writableStreamSink()`.
- [ ] Add `fanoutSink()`.
- [ ] Add sink failure tests.
- [ ] Add close/flush lifecycle tests.

### Testing

- [ ] Add serialization edge-case tests.
- [ ] Add compatibility fixtures.
- [ ] Add property-ish tests for JSON-safe records.
- [ ] Add tests for circular objects and circular causes.
- [ ] Add tests for redaction once implemented.

### Integrations

- [ ] Add fetch request logging adapter.
- [x] Decided: Hono adapter lives in `@rootware/hono` (separate package), not
      `@rootware/log/hono`.
- [ ] Add examples for `@rootware/http`.
- [ ] Add examples for `@rootware/orm`.
- [ ] Add examples for `@rootware/migrate`.

### Performance

- [ ] Add benchmark harness.
- [ ] Benchmark disabled logs.
- [ ] Benchmark memory sink.
- [ ] Benchmark stdout sink.
- [ ] Benchmark buffered stdout sink.
- [ ] Benchmark npm Pino under Deno.
- [ ] Benchmark Deno `--watch` reload memory behavior.

---

## 18. Recommended Near-Term Next Steps

The next useful development sequence is:

1. Harden and document the shipped `@rootware/log/compat/pino` compatibility
   layer without claiming full Pino transport compatibility.
2. Keep Hono request logging in the future `@rootware/hono` adapter, not a
   `@rootware/log/hono` subpath.
3. Add benchmarks for stdout and buffered sinks.
4. Create `docs/log.md` or use this file as the canonical roadmap.
5. Keep redaction and Pino compatibility docs current as the APIs harden.
6. Add file/web-stream sinks in `0.4.0`.
7. Add HTTP adapter only after the core API stabilizes.

The package is already valuable at `0.1.0` because it gives Rootware a working
structured logger, deterministic test sink, and explicit buffering model. The
next phase is not more features immediately. The next phase is stabilization,
documentation, and precise compatibility boundaries.

---

## 19. One-line Strategy

Build `@rootware/log` as the Deno-native structured logger that gives Pino users
familiar ergonomics while giving Rootware packages deterministic, explicit,
testable logging primitives.
