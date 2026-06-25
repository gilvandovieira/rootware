import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import {
  defineEnv,
  env,
  EnvError,
  fromRecord,
  generateEnvExample,
  isSecretKey,
  parseBoolean,
  parseInteger,
  parseNumber,
  parseUrl,
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

Deno.test("@rootware/env - builder metadata is preserved", () => {
  const definition = env.string().describe("Name").example("api").secret();

  assertEquals(definition.description, "Name");
  assertEquals(definition.exampleValue, "api");
  assertEquals(definition.isSecret, true);
  assertExists(definition.required());
});
