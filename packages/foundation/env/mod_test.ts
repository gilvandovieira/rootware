import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import {
  defineEnv,
  env,
  EnvError,
  type EnvFileReader,
  fromRecord,
  generateEnvExample,
  isSecretKey,
  loadEnvFiles,
  parseBoolean,
  parseEnvFile,
  parseInteger,
  parseNumber,
  parseUrl,
  readDenoEnv,
  redactEnv,
  validateEnv,
} from "./mod.ts";

Deno.test("@rootware/env - defineEnv validates explicit source", () => {
  const schema = {
    DATABASE_URL: env.url().describe("Database connection URL"),
    LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
    PORT: env.integer().default(8000),
    SESSION_SECRET: env.secret(),
    ENABLE_SIGNUPS: env.boolean().default(true),
    OPTIONAL_NAME: env.string().optional(),
  };

  const values = defineEnv(schema, {
    source: {
      DATABASE_URL: "postgres://localhost/app",
      SESSION_SECRET: "dev-secret",
      ENABLE_SIGNUPS: "false",
    },
  });

  assertEquals(values.DATABASE_URL, "postgres://localhost/app");
  assertEquals(values.LOG_LEVEL, "info");
  assertEquals(values.PORT, 8000);
  assertEquals(values.ENABLE_SIGNUPS, false);
  assertEquals(values.OPTIONAL_NAME, undefined);
  assert(Object.isFrozen(values));
});

Deno.test("@rootware/env - validateEnv and fromRecord use explicit source", () => {
  const schema = {
    NAME: env.string().required(),
    RATE: env.number().default(1.5),
  };

  const source = fromRecord({ NAME: "rootware" });
  const values = validateEnv(schema, source);

  assertEquals(values.NAME, "rootware");
  assertEquals(values.RATE, 1.5);
});

Deno.test("@rootware/env - parsers reject invalid values", () => {
  assertEquals(parseBoolean("YES"), true);
  assertEquals(parseBoolean("off"), false);
  assertEquals(parseNumber("1.5"), 1.5);
  assertEquals(parseInteger("42"), 42);
  assertEquals(
    parseUrl("https://example.com").toString(),
    "https://example.com/",
  );

  assertThrows(() => parseBoolean("maybe"), EnvError);
  assertThrows(() => parseInteger("1.5"), EnvError);
  assertThrows(() => parseNumber("Infinity"), EnvError);
  assertThrows(() => parseUrl("not a url"), EnvError);
});

Deno.test("@rootware/env - missing and invalid variables throw EnvError", () => {
  assertThrows(() => {
    defineEnv({ REQUIRED: env.string() }, { source: {} });
  }, EnvError);

  assertThrows(() => {
    defineEnv({ PORT: env.integer() }, { source: { PORT: "abc" } });
  }, EnvError);
});

Deno.test("@rootware/env - redaction and examples", () => {
  const schema = {
    DATABASE_URL: env.url().describe("Database connection URL"),
    API_TOKEN: env.secret().example("dev-token"),
    LOG_LEVEL: env.enum(["debug", "info"]).default("debug"),
  };
  const values = validateEnv(schema, {
    DATABASE_URL: "postgres://localhost/app",
    API_TOKEN: "secret",
  });

  assertEquals(isSecretKey("database_url"), true);
  assertEquals(redactEnv(values, schema), {
    DATABASE_URL: "[REDACTED]",
    API_TOKEN: "[REDACTED]",
    LOG_LEVEL: "debug",
  });

  const example = generateEnvExample(schema);
  assert(example.includes("# Database connection URL"));
  assert(example.includes("DATABASE_URL="));
  assert(example.includes("LOG_LEVEL=debug"));
  assert(!example.includes("dev-token"));
});

Deno.test("@rootware/env - enum parses, rejects unknown values, and infers the union", () => {
  const schema = {
    LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
  };

  const values = validateEnv(schema, { LOG_LEVEL: "warn" });
  // Compile-time: the value is the literal union, not a bare string.
  const level: "debug" | "info" | "warn" | "error" = values.LOG_LEVEL;
  assertEquals(level, "warn");

  assertEquals(validateEnv(schema, {}).LOG_LEVEL, "info");
  assertThrows(
    () => validateEnv(schema, { LOG_LEVEL: "verbose" }),
    EnvError,
  );
});

Deno.test("@rootware/env - prefix maps unprefixed keys to prefixed source keys", () => {
  const schema = {
    PORT: env.integer().default(8000),
    HOST: env.string().required(),
  };

  const values = validateEnv(
    schema,
    { APP_PORT: "3000", APP_HOST: "0.0.0.0" },
    {
      prefix: "APP_",
    },
  );

  assertEquals(values.PORT, 3000);
  assertEquals(values.HOST, "0.0.0.0");

  // A missing prefixed variable reports the prefixed name.
  const error = assertThrows(
    () => validateEnv(schema, {}, { prefix: "APP_" }),
    EnvError,
  ) as EnvError;
  assert(error.message.includes("APP_HOST"));
});

Deno.test("@rootware/env - readDenoEnv fails safely when Deno.env is unavailable", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Deno");
  try {
    // Simulate a runtime (or permission state) where Deno.env is missing.
    Object.defineProperty(globalThis, "Deno", {
      value: {},
      configurable: true,
      writable: true,
    });
    const error = assertThrows(() => readDenoEnv(), EnvError) as EnvError;
    assertEquals(error.code, "ENV_ACCESS_DENIED");
    assertEquals(error.details?.source, "Deno.env");
  } finally {
    if (original !== undefined) {
      Object.defineProperty(globalThis, "Deno", original);
    }
  }
});

Deno.test("@rootware/env - builder metadata is preserved", () => {
  const definition = env.string().describe("Name").example("api").secret();

  assertEquals(definition.description, "Name");
  assertEquals(definition.exampleValue, "api");
  assertEquals(definition.isSecret, true);
  assertExists(definition.required());
});

Deno.test("@rootware/env - invalid variable messages name the variable and expectation", () => {
  const error = assertThrows(
    () => validateEnv({ PORT: env.integer() }, { PORT: "abc" }),
    EnvError,
  ) as EnvError;

  assertEquals(error.code, "ENV_INVALID_VARIABLE");
  assert(error.message.includes("PORT"));
  assert(error.message.includes("integer"));
  assertEquals(error.details?.variable, "PORT");
  assertEquals(error.details?.expected, "integer");
  // Enum expectations spell out the allowed values.
  const enumError = assertThrows(
    () =>
      validateEnv({ TIER: env.enum(["free", "pro"]) }, { TIER: "enterprise" }),
    EnvError,
  ) as EnvError;
  assert(enumError.message.includes("one of: free, pro"));
});

Deno.test('@rootware/env - mode "test" requires an explicit source', () => {
  const error = assertThrows(
    () => defineEnv({ NAME: env.string() }, { mode: "test" }),
    EnvError,
  ) as EnvError;
  assertEquals(error.code, "ENV_MODE_VIOLATION");
  assertEquals(error.details?.mode, "test");

  // With an explicit source, test mode validates normally.
  const values = defineEnv(
    { NAME: env.string() },
    { mode: "test", source: { NAME: "fixture" } },
  );
  assertEquals(values.NAME, "fixture");
});

Deno.test("@rootware/env - strict modes ignore unsafe secret defaults", () => {
  const schema = {
    SESSION_SECRET: env.secret().default("dev-secret"),
    PORT: env.integer().default(8000),
  };

  for (const mode of ["production", "test"] as const) {
    const error = assertThrows(
      () => validateEnv(schema, {}, { mode }),
      EnvError,
    ) as EnvError;
    assertEquals(error.code, "ENV_MISSING_VARIABLE");
    assertEquals(error.details?.reason, "unsafe-default");
    assertEquals(error.details?.variable, "SESSION_SECRET");
    assert(error.message.includes(mode));
  }

  // The non-secret default still applies once the secret is supplied.
  const values = validateEnv(
    schema,
    { SESSION_SECRET: "real-secret" },
    { mode: "production" },
  );
  assertEquals(values.SESSION_SECRET, "real-secret");
  assertEquals(values.PORT, 8000);

  // Development mode (and unset) keep the permissive default behavior.
  assertEquals(
    validateEnv(schema, {}, { mode: "development" }).SESSION_SECRET,
    "dev-secret",
  );
  assertEquals(validateEnv(schema, {}).SESSION_SECRET, "dev-secret");
});

Deno.test("@rootware/env - secret-keyed names are strict even without env.secret()", () => {
  // A key recognized by isSecretKey is treated as a secret in strict modes.
  const schema = { API_KEY: env.string().default("dev-key") };
  assertThrows(
    () => validateEnv(schema, {}, { mode: "production" }),
    EnvError,
  );
  assertEquals(validateEnv(schema, {}).API_KEY, "dev-key");
});

Deno.test("@rootware/env - prefix edge cases", () => {
  const schema = {
    PORT: env.integer().default(8000),
    NOTE: env.string().optional(),
  };

  // An empty prefix is a no-op: keys map to themselves.
  assertEquals(
    validateEnv(schema, { PORT: "3000" }, { prefix: "" }).PORT,
    3000,
  );

  // Optional variables stay undefined when the prefixed key is absent.
  assertEquals(
    validateEnv(schema, {}, { prefix: "APP_" }).NOTE,
    undefined,
  );

  // Defaults still apply under a prefix when the prefixed key is absent.
  assertEquals(validateEnv(schema, {}, { prefix: "APP_" }).PORT, 8000);

  // Only the prefixed key is read; an unprefixed collision is ignored.
  assertEquals(
    validateEnv(schema, { PORT: "1111", APP_PORT: "2222" }, { prefix: "APP_" })
      .PORT,
    2222,
  );
});

Deno.test("@rootware/env - parseEnvFile handles comments, quotes, export, invalid keys", () => {
  const parsed = parseEnvFile([
    "# a comment",
    "",
    "export PORT=8000",
    'NAME="Rootware App"',
    'MULTILINE="line1\\nline2"',
    "LITERAL='no \\n expansion'",
    "EMPTY=",
    "BARE=hello world",
    "1INVALID=skip",
    "no_equals_here",
  ].join("\n"));

  assertEquals(parsed.PORT, "8000");
  assertEquals(parsed.NAME, "Rootware App");
  assertEquals(parsed.MULTILINE, "line1\nline2");
  assertEquals(parsed.LITERAL, "no \\n expansion");
  assertEquals(parsed.EMPTY, "");
  assertEquals(parsed.BARE, "hello world");
  assertEquals("1INVALID" in parsed, false);
});

Deno.test("@rootware/env - loadEnvFiles merges conventional files (later wins)", () => {
  const files = new Map<string, string>([
    [".env", "A=1\nB=base\nSHARED=env"],
    [".env.local", "B=local"],
    [".env.development", "C=dev"],
    [".env.test", "C=test"],
  ]);
  const reader: EnvFileReader = (path) => files.get(path);

  // development: .env -> .env.development -> .env.local -> .env.development.local
  assertEquals(loadEnvFiles({ reader, mode: "development" }), {
    A: "1",
    B: "local",
    SHARED: "env",
    C: "dev",
  });

  // test mode skips *.local files so tests are deterministic.
  assertEquals(loadEnvFiles({ reader, mode: "test" }), {
    A: "1",
    B: "base",
    SHARED: "env",
    C: "test",
  });

  // explicit file list overrides the convention.
  assertEquals(loadEnvFiles({ reader, files: [".env.local"] }), { B: "local" });
});

Deno.test("@rootware/env - loadEnvFiles feeds defineEnv as a source", () => {
  const reader: EnvFileReader = (path) =>
    path === ".env" ? "PORT=3000\nLOG_LEVEL=warn" : undefined;
  const values = defineEnv({
    PORT: env.integer().default(8000),
    LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
  }, { source: loadEnvFiles({ reader }), mode: "development" });

  assertEquals(values.PORT, 3000);
  assertEquals(values.LOG_LEVEL, "warn");
});
