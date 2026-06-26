import { assert, assertEquals } from "@std/assert";
import { type LogRecord, memorySink, unbufferedSink } from "../../mod.ts";
import pino, { type PinoLogger } from "./mod.ts";

function setup(
  options: Parameters<typeof pino>[0] = {},
): { logger: PinoLogger; records: () => LogRecord[] } {
  const sink = memorySink();
  const logger = pino(
    { level: "trace", timestamp: () => "T", ...options },
    unbufferedSink(sink),
  );
  return { logger, records: () => sink.records() };
}

Deno.test("compat/pino - common call forms", () => {
  const { logger, records } = setup();

  logger.info("server started");
  logger.info({ port: 8000 }, "listening");
  logger.warn({ userId: "u_123" }, "quota nearly reached");

  const lines = records();
  assertEquals(lines[0].msg, "server started");
  assertEquals(lines[0].levelName, "info");
  assertEquals(lines[1].msg, "listening");
  assertEquals(lines[1].port, 8000);
  assertEquals(lines[2].userId, "u_123");
  assertEquals(lines[2].levelName, "warn");
});

Deno.test("compat/pino - error argument lands under the err key by default", () => {
  const { logger, records } = setup();

  logger.error(new Error("boom"), "request failed");

  const record = records()[0];
  assertEquals(record.msg, "request failed");
  const err = record.err as { name: string; message: string; stack?: string };
  assertEquals(err.name, "Error");
  assertEquals(err.message, "boom");
  assert(typeof err.stack === "string");
  // The default Rootware error key is "error"; pino compat flips it to "err".
  assertEquals(record.error, undefined);
});

Deno.test("compat/pino - messageKey and errorKey are configurable", () => {
  const { logger, records } = setup({ messageKey: "message", errorKey: "e" });

  logger.error(new Error("nope"), "failed");

  const record = records()[0];
  assertEquals(record.message, "failed");
  assertEquals((record.e as { message: string }).message, "nope");
  assertEquals(record.msg, undefined);
});

Deno.test("compat/pino - base bindings and name appear on every record", () => {
  const { logger, records } = setup({
    name: "api",
    base: { service: "api", region: "us" },
  });

  logger.info("up");

  const record = records()[0];
  assertEquals(record.name, "api");
  assertEquals(record.service, "api");
  assertEquals(record.region, "us");
});

Deno.test("compat/pino - serializers transform matching fields and errors", () => {
  const { logger, records } = setup({
    serializers: {
      user: (value) => ({ id: (value as { id: string }).id }),
      err: (value) => ({ kind: (value as Error).name }),
    },
  });

  logger.info({ user: { id: "u1", password: "secret" } }, "loaded");
  logger.error(new TypeError("bad"), "failed");

  const [loaded, failed] = records();
  // The password field is dropped by the custom user serializer.
  assertEquals(loaded.user, { id: "u1" });
  assertEquals(failed.err, { kind: "TypeError" });
});

Deno.test("compat/pino - redact censors configured paths", () => {
  const { logger, records } = setup({
    redact: ["password", "req.headers.cookie"],
  });

  logger.info(
    { password: "hunter2", req: { headers: { cookie: "sid=1" } } },
    "auth",
  );

  const record = records()[0];
  assertEquals(record.password, "[Redacted]");
  assertEquals(
    (record.req as { headers: { cookie: string } }).headers.cookie,
    "[Redacted]",
  );
});

Deno.test("compat/pino - level gating and child loggers", () => {
  const { logger, records } = setup({ level: "info" });

  logger.debug("hidden");
  assertEquals(records().length, 0);
  assert(!logger.isLevelEnabled("debug"));
  assert(logger.isLevelEnabled("warn"));

  const child = logger.child({ requestId: "req_123" }, { level: "debug" });
  child.debug("loaded user");

  const record = records()[0];
  assertEquals(record.requestId, "req_123");
  assertEquals(record.msg, "loaded user");
  assertEquals(record.levelName, "debug");
});

Deno.test("compat/pino - child inherits and extends serializers", () => {
  const { logger, records } = setup({
    serializers: { a: () => "A" },
  });

  const child = logger.child({}, { serializers: { b: () => "B" } });
  child.info({ a: 1, b: 2 }, "merged");

  const record = records()[0];
  assertEquals(record.a, "A");
  assertEquals(record.b, "B");
});

Deno.test("compat/pino - timestamp: false blanks the time field", () => {
  const sink = memorySink();
  const logger = pino({ timestamp: false }, unbufferedSink(sink));
  logger.info("x");
  assertEquals(sink.records()[0].time, "");
});
