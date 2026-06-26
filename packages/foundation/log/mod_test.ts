import { assert, assertEquals, assertExists } from "@std/assert";
import {
  bufferedSink,
  createLogger,
  createNoopLogger,
  formatLogRecord,
  getLogLevelNumber,
  isLogLevelName,
  levels,
  type LogError,
  type LogSink,
  memorySink,
  serializeErrorForLog,
  shouldLog,
  unbufferedSink,
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
