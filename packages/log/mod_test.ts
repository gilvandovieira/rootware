import { assert, assertEquals, assertExists } from "@std/assert";
import {
  bufferedSink,
  createLogger,
  createNoopLogger,
  formatLogRecord,
  getLogLevelNumber,
  isLogLevelName,
  levels,
  memorySink,
  serializeError,
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

  const serialized = serializeError(new Error("boom"));
  const line = formatLogRecord({
    level: 30,
    levelName: "info",
    time: "2026-01-01T00:00:00.000Z",
    msg: "ok",
  });

  assertEquals(serialized.message, "boom");
  assert(line.endsWith("\n"));
});
