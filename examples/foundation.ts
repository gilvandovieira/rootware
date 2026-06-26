import {
  clearErrorRedactors,
  createErrorFactory,
  defineErrorCode,
  getErrorChain,
  isRootwareError,
  redactErrorKeys,
  registerErrorRedactor,
  serializeError,
  toRootwareError,
} from "@rootware/errors";
import {
  defineEnv,
  env,
  fromRecord,
  generateEnvExample,
  parseBoolean,
  parseInteger,
  parseNumber,
  parseUrl,
  redactEnv,
  validateEnv,
} from "@rootware/env";
import {
  bufferedSink,
  createLogger,
  formatLogRecord,
  getLogLevelNumber,
  memorySink,
  shouldLog,
} from "@rootware/log";
import pino from "@rootware/log/compat/pino";
import {
  assert,
  assertEquals,
  assertLog,
  assertRootwareError,
  assertThrows,
  assertThrowsRootwareError,
  createFakeClock,
  createFixture,
  createTestContext,
  testEnv,
  testLogger,
  useFixture,
  withEnvSource,
} from "@rootware/testing";

const EXAMPLE_TIME = "2024-01-01T00:00:00.000Z";

export async function runFoundationExample(): Promise<void> {
  clearErrorRedactors();

  const appInvalidWidget = defineErrorCode("APP_INVALID_WIDGET");
  const widgetError = createErrorFactory({
    code: appInvalidWidget,
    status: 422,
    expose: true,
    severity: "warn",
  });
  const error = widgetError("Invalid widget", {
    details: { widgetId: "w_123", token: "secret-token" },
    cause: new Error("widget id was not found"),
  });

  const unregister = registerErrorRedactor(
    redactErrorKeys(["token"], "[hidden]"),
  );
  try {
    const safeError = serializeError(error);
    assertEquals(safeError.code, appInvalidWidget);
    assertEquals(safeError.details?.token, "[hidden]");
    assertEquals(getErrorChain(error).length, 2);
    assert(isRootwareError(toRootwareError(error)));
    await assertThrowsRootwareError(() => Promise.reject(error), {
      code: appInvalidWidget,
      message: /Invalid widget/,
      cause: true,
    });
  } finally {
    unregister();
    clearErrorRedactors();
  }

  const thrown = assertThrows(() => {
    throw error;
  }, { code: appInvalidWidget });
  assertRootwareError(thrown, { code: appInvalidWidget });

  const schema = {
    DATABASE_URL: env.url().describe("PostgreSQL connection URL"),
    LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
    PORT: env.integer().default(8000),
    SESSION_SECRET: env.secret().describe("Cookie signing secret"),
    ENABLE_SIGNUPS: env.boolean().default(false),
  };
  const source = fromRecord({
    DATABASE_URL: "postgres://rootware:rootware@localhost:5432/rootware",
    SESSION_SECRET: "development-secret",
    PORT: "8080",
    ENABLE_SIGNUPS: "yes",
  });

  const config = validateEnv(schema, source, { mode: "development" });
  assertEquals(config.PORT, 8080);
  assertEquals(config.LOG_LEVEL, "info");
  assertEquals(config.ENABLE_SIGNUPS, true);
  assertEquals(redactEnv(config, schema).SESSION_SECRET, "[REDACTED]");
  assert(generateEnvExample(schema).includes("PORT=8000"));
  assertEquals(testEnv(schema, source).DATABASE_URL, config.DATABASE_URL);
  assertEquals(parseBoolean("on"), true);
  assertEquals(parseInteger("42"), 42);
  assertEquals(parseNumber("3.5"), 3.5);
  assertEquals(
    parseUrl("https://rootware.dev/docs"),
    "https://rootware.dev/docs",
  );

  withEnvSource(source, (scopedSource) => {
    const scopedConfig = defineEnv(schema, { source: scopedSource });
    assertEquals(scopedConfig.PORT, 8080);
  });

  const sink = memorySink();
  const batchedSink = bufferedSink(sink, { maxRecords: 2 });
  const logger = createLogger({
    level: "debug",
    name: "foundation-example",
    base: { service: "examples" },
    redact: ["password"],
    timestamp: () => EXAMPLE_TIME,
  }, batchedSink);

  logger.debug({ requestId: "req_1", password: "secret" }, "received request");
  logger.info({ feature: "foundation" }, "example ready");
  await logger.flush();

  const records = sink.records();
  assertEquals(records.length, 2);
  assertEquals(records[0].password, "[Redacted]");
  assertEquals(getLogLevelNumber("info"), 30);
  assertEquals(shouldLog("info", "debug"), false);
  assert(
    formatLogRecord({
      level: 30,
      levelName: "info",
      time: EXAMPLE_TIME,
      msg: "formatted",
    }).endsWith("\n"),
  );

  const pinoSink = memorySink();
  const pinoLogger = pino({
    level: "debug",
    base: { service: "pino-compat" },
    timestamp: () => EXAMPLE_TIME,
    serializers: {
      user(value: unknown): Record<string, unknown> {
        return typeof value === "object" && value !== null && "id" in value
          ? { id: (value as { readonly id: unknown }).id }
          : {};
      },
    },
  }, pinoSink);
  pinoLogger.child({ requestId: "req_2" }).info(
    { user: { id: "u_1", email: "ada@example.com" } },
    "loaded user",
  );
  assertEquals(pinoSink.records()[0].user, { id: "u_1" });

  const context = createTestContext({
    name: "foundation-example",
    clock: createFakeClock({ now: EXAMPLE_TIME }),
  });
  assertEquals(context.clock.iso(), EXAMPLE_TIME);
  context.clock.advance(1_000);
  assertEquals(context.clock.iso(), "2024-01-01T00:00:01.000Z");

  const fixture = createFixture(
    "temporary-resource",
    () => ({ closed: false }),
    (value) => {
      value.closed = true;
    },
  );
  const resource = await context.use(fixture);
  assertEquals(resource.closed, false);
  await context.runCleanup();
  assertEquals(resource.closed, true);

  let fixtureTornDown = false;
  await useFixture(
    createFixture("inline-resource", () => "ready", () => {
      fixtureTornDown = true;
    }),
    (value) => {
      assertEquals(value, "ready");
    },
  );
  assertEquals(fixtureTornDown, true);

  const { sink: testSink, logger: testLog } = testLogger();
  testLog.info({ example: "foundation" }, "test logger captured");
  assertLog(testSink).hasMessage("test logger captured");
}

if (import.meta.main) {
  await runFoundationExample();
  console.log("foundation example passed");
}
