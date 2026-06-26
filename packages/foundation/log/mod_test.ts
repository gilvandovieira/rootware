import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import {
  bufferedSink,
  createLogger,
  createNoopLogger,
  eventName,
  failoverSink,
  fanoutSink,
  filterSink,
  formatLogRecord,
  getLogLevelNumber,
  isEventName,
  isLogLevelName,
  levels,
  levelSink,
  type LogError,
  logFields,
  type LogSink,
  memorySink,
  serializeErrorForLog,
  shouldLog,
  unbufferedSink,
  writableStreamSink,
} from "./mod.ts";

Deno.test("@rootware/log - createLogger writes structured records", () => {
  const sink = memorySink();
  const logger = createLogger({
    level: "debug",
    name: "api",
    timestamp: () => "2026-01-01T00:00:00.000Z",
  }, unbufferedSink(sink));

  logger.info("server started");
  logger.info({ userId: "u_123" }, "user loaded");
  logger.error(new Error("boom"), "request failed");

  const records = sink.records();

  assertEquals(records.length, 3);
  assertEquals(records[0].msg, "server started");
  assertEquals(records[1].userId, "u_123");
  assertEquals(records[2].msg, "request failed");
  assertExists(records[2].error);
});

Deno.test("@rootware/log - child logger merges bindings", () => {
  const sink = memorySink();
  const logger = createLogger({
    level: "debug",
    bindings: { service: "api" },
    timestamp: () => "2026-01-01T00:00:00.000Z",
  }, unbufferedSink(sink));

  logger.child({ requestId: "req_123" }).debug("child log");

  assertEquals(sink.records()[0].service, "api");
  assertEquals(sink.records()[0].requestId, "req_123");
});

Deno.test("@rootware/log - levels and silent mode", () => {
  const sink = memorySink();
  const logger = createLogger({ level: "silent" }, unbufferedSink(sink));

  logger.fatal("hidden");

  assertEquals(levels.info, 30);
  assertEquals(isLogLevelName("warn"), true);
  assertEquals(isLogLevelName("verbose"), false);
  assertEquals(getLogLevelNumber("fatal"), 60);
  assertEquals(shouldLog("info", "error"), true);
  assertEquals(shouldLog("error", "info"), false);
  assertEquals(sink.records().length, 0);
});

Deno.test("@rootware/log - memory sink exposes lines, records, and clear", () => {
  const sink = memorySink();
  const logger = createLogger({
    level: "info",
    timestamp: () => "2026-01-01T00:00:00.000Z",
  }, unbufferedSink(sink));

  logger.info({ ok: true }, "stored");

  assert(sink.lines()[0].endsWith("\n"));
  assertEquals(sink.records()[0].ok, true);

  sink.clear();

  assertEquals(sink.lines(), []);
});

Deno.test("@rootware/log - buffered sink flushes manually", async () => {
  const inner = memorySink();
  const logger = createLogger({
    level: "info",
    timestamp: () => "2026-01-01T00:00:00.000Z",
  }, bufferedSink(inner, { maxRecords: 10 }));

  logger.info("buffered");
  assertEquals(inner.records().length, 0);

  await logger.flush();
  assertEquals(inner.records()[0].msg, "buffered");
});

Deno.test("@rootware/log - noop logger and helpers", () => {
  const logger = createNoopLogger();
  logger.info("ignored");

  const serialized = serializeErrorForLog(new Error("boom"));
  const line = formatLogRecord({
    level: 30,
    levelName: "info",
    time: "2026-01-01T00:00:00.000Z",
    msg: "ok",
  });

  assertEquals(serialized.message, "boom");
  assert(line.endsWith("\n"));
});

Deno.test("@rootware/log - redaction censors top-level and nested fields", () => {
  const sink = memorySink();
  const logger = createLogger({
    level: "info",
    timestamp: () => "2026-01-01T00:00:00.000Z",
    redact: ["password", "req.headers.authorization", "*.token"],
  }, unbufferedSink(sink));

  logger.info({
    password: "hunter2",
    req: { headers: { authorization: "Bearer secret" } },
    user: { token: "t_abc", id: "u_1" },
  }, "auth");

  const record = sink.records()[0];
  assertEquals(record.password, "[Redacted]");
  assertEquals(
    (record.req as { headers: { authorization: string } }).headers
      .authorization,
    "[Redacted]",
  );
  assertEquals(
    (record.user as { token: string; id: string }).token,
    "[Redacted]",
  );
  assertEquals((record.user as { id: string }).id, "u_1");
});

Deno.test("@rootware/log - configurable messageKey and errorKey", () => {
  const sink = memorySink();
  const logger = createLogger({
    level: "info",
    messageKey: "message",
    errorKey: "err",
    timestamp: () => "2026-01-01T00:00:00.000Z",
  }, unbufferedSink(sink));

  logger.error(new Error("boom"), "request failed");

  const record = sink.records()[0];
  assertEquals(record.message, "request failed");
  assertExists(record.err);
  assertEquals(record.msg, undefined);
  assertEquals(record.error, undefined);
});

Deno.test("@rootware/log - isLevelEnabled reflects level and enabled flag", () => {
  const logger = createLogger({ level: "warn" }, unbufferedSink(memorySink()));
  assertEquals(logger.isLevelEnabled("error"), true);
  assertEquals(logger.isLevelEnabled("info"), false);
  assertEquals(createNoopLogger().isLevelEnabled("fatal"), false);

  // child inherits redaction/keys but can raise its own level
  const quiet = logger.child({}, { level: "error" });
  assertEquals(quiet.isLevelEnabled("warn"), false);
});

Deno.test("@rootware/log - onWriteError handles sync and async sink failures", async () => {
  const captured: LogError[] = [];

  const failingSyncSink: LogSink = {
    write() {
      throw new Error("disk full");
    },
  };
  const syncLogger = createLogger({
    level: "info",
    onWriteError: (error) => captured.push(error),
  }, failingSyncSink);
  syncLogger.info("never reaches disk");

  const failingAsyncSink: LogSink = {
    write() {
      return Promise.reject(new Error("network down"));
    },
  };
  const asyncLogger = createLogger({
    level: "info",
    onWriteError: (error) => captured.push(error),
  }, failingAsyncSink);
  asyncLogger.info("dropped");
  // let the rejected promise settle
  await Promise.resolve();

  assertEquals(captured.length, 2);
  assertEquals(captured[0].code, "LOG_WRITE_FAILED");
  assertEquals(captured[1].code, "LOG_WRITE_FAILED");
});

Deno.test("@rootware/log - fanoutSink writes to every sink", () => {
  const a = memorySink();
  const b = memorySink();
  const logger = createLogger(
    { level: "info" },
    unbufferedSink(fanoutSink(a, b)),
  );
  logger.info({ id: 1 }, "to both");
  assertEquals(a.records()[0].msg, "to both");
  assertEquals(b.records()[0].msg, "to both");
});

Deno.test("@rootware/log - filterSink and levelSink drop non-matching records", () => {
  const filtered = memorySink();
  const fLogger = createLogger(
    { level: "trace" },
    filterSink(filtered, (record) => record.tenant === "keep"),
  );
  fLogger.info({ tenant: "keep" }, "kept");
  fLogger.info({ tenant: "drop" }, "dropped");
  assertEquals(filtered.records().map((r) => r.msg), ["kept"]);

  const levelled = memorySink();
  const lLogger = createLogger({ level: "trace" }, levelSink(levelled, "warn"));
  lLogger.debug("hidden");
  lLogger.warn("shown");
  lLogger.error("shown too");
  assertEquals(levelled.records().map((r) => r.levelName), ["warn", "error"]);
});

Deno.test("@rootware/log - failoverSink falls back when the primary throws", () => {
  const fallback = memorySink();
  const broken: LogSink = {
    write() {
      throw new Error("primary down");
    },
  };
  const logger = createLogger(
    { level: "info" },
    failoverSink(broken, fallback),
  );
  logger.info("rescued");
  assertEquals(fallback.records()[0].msg, "rescued");
});

Deno.test("@rootware/log - writableStreamSink writes to a web stream", async () => {
  const chunks: Uint8Array[] = [];
  const stream = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(chunk);
    },
  });
  const logger = createLogger({ level: "info" }, writableStreamSink(stream));
  logger.info({ port: 8000 }, "listening");
  await logger.close();

  const text = new TextDecoder().decode(
    new Uint8Array(chunks.flatMap((chunk) => [...chunk])),
  );
  const record = JSON.parse(text.trim());
  assertEquals(record.msg, "listening");
  assertEquals(record.port, 8000);
});

Deno.test("@rootware/log - observability conventions: logFields and eventName", () => {
  // Standard field names are stable keys.
  assertEquals(logFields.requestId, "requestId");
  assertEquals(logFields.durationMs, "durationMs");
  assertEquals(logFields.event, "event");

  // eventName builds package.area.action and validates segments.
  assertEquals(
    eventName("http", "request", "completed"),
    "http.request.completed",
  );
  assertEquals(eventName("cache", "entry", "hit"), "cache.entry.hit");
  assertEquals(
    eventName("job", "dead_letter", "added"),
    "job.dead_letter.added",
  );

  const error = assertThrows(
    () => eventName("HTTP", "request", "completed"),
    Error,
  ) as { code?: string };
  assertEquals(error.code, "LOG_INVALID_EVENT");
  assertThrows(() => eventName("http", "", "x"), Error);

  // isEventName recognizes the convention.
  assert(isEventName("http.request.completed"));
  assert(!isEventName("http.request"));
  assert(!isEventName("Http.Request.Completed"));
  assert(!isEventName(42));

  // The fields compose into a real record.
  const sink = memorySink();
  const logger = createLogger({ level: "info" }, unbufferedSink(sink));
  logger.info({
    [logFields.event]: eventName("http", "request", "completed"),
    [logFields.requestId]: "req_1",
    [logFields.status]: 200,
    [logFields.durationMs]: 12,
  }, "request completed");
  assertEquals(sink.records()[0].event, "http.request.completed");
});
