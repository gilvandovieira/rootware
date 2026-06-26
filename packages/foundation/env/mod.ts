/**
 * Typed environment configuration for Rootware packages and Deno backends.
 *
 * Provides explicit environment sources, typed variable builders, validation
 * modes, redaction helpers, and `.env` file parsing without ambient reads by
 * default.
 *
 * @module
 */

import { RootwareError } from "@rootware/errors";

const REDACTED_VALUE = "[REDACTED]";

/** Runtime validation mode that controls default and global-env behavior. */
export type EnvMode = "development" | "test" | "production";

/** Error codes emitted by environment validation and access helpers. */
export type EnvErrorCode =
  | "ENV_MISSING_VARIABLE"
  | "ENV_INVALID_VARIABLE"
  | "ENV_ACCESS_DENIED"
  | "ENV_MODE_VIOLATION"
  | "ENV_UNKNOWN_ERROR"
  | (string & Record<never, never>);

/** Explicit key/value source used instead of reading `Deno.env` directly. */
export type EnvSource = Record<string, string | undefined>;

/** Builder-produced definition for one environment variable. */
export interface EnvVarDefinition<T> {
  readonly type:
    | "string"
    | "secret"
    | "number"
    | "integer"
    | "boolean"
    | "url"
    | "enum";
  readonly expected: string;
  readonly isRequired: boolean;
  readonly isSecret: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: T;
  readonly description?: string;
  readonly exampleValue?: T;
  readonly choices?: readonly string[];
  parse(
    value: string,
    options?: { readonly allowEmpty?: boolean },
  ): T;
  required(): EnvVarDefinition<Exclude<T, undefined>>;
  optional(): EnvVarDefinition<T | undefined>;
  default(
    value: Exclude<T, undefined>,
  ): EnvVarDefinition<Exclude<T, undefined>>;
  describe(description: string): EnvVarDefinition<T>;
  example(value: Exclude<T, undefined>): EnvVarDefinition<T>;
  secret(): EnvVarDefinition<T>;
}

/** Object shape mapping environment variable names to validation definitions. */
export type EnvSchema = Record<string, EnvVarDefinition<unknown>>;

/** Infers resolved environment value types from an {@link EnvSchema}. */
export type InferEnv<TSchema extends EnvSchema> = {
  readonly [K in keyof TSchema]: TSchema[K] extends EnvVarDefinition<infer T>
    ? T
    : never;
};

/** Options for resolving and validating an environment schema. */
export interface DefineEnvOptions {
  readonly source?: EnvSource;
  /**
   * Tightens validation for an environment.
   *
   * - `development` (and unset): permissive — defaults apply to every variable,
   *   including secrets.
   * - `test`: refuses to fall back to `Deno.env` (an explicit `source` is
   *   required) and ignores defaults for secrets, so a test can never pass on an
   *   ambient or hard-coded production secret.
   * - `production`: ignores defaults for secrets (a missing secret is a fatal
   *   configuration error), so a development default is never shipped to
   *   production. Non-secret defaults still apply.
   */
  readonly mode?: EnvMode;
  readonly prefix?: string;
  readonly allowEmpty?: boolean;
}

/** Controls how `.env.example` output is generated. */
export interface GenerateEnvExampleOptions {
  readonly includeDescriptions?: boolean;
  readonly includeDefaults?: boolean;
}

/** Options for EnvError construction. */
export interface EnvErrorOptions {
  readonly code?: EnvErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

interface EnvParserOptions {
  readonly allowEmpty: boolean;
}

type EnvParser<T> = (value: string, options: EnvParserOptions) => T;

interface EnvDefinitionState<T> {
  readonly type: EnvVarDefinition<T>["type"];
  readonly expected: string;
  readonly isRequired: boolean;
  readonly isSecret: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: T;
  readonly description?: string;
  readonly exampleValue?: T;
  readonly choices?: readonly string[];
  readonly parse: EnvParser<T>;
}

/** Error thrown for environment access, missing variables, and validation failures. */
export class EnvError extends RootwareError {
  constructor(message: string, options: EnvErrorOptions = {}) {
    super(message, {
      code: options.code ?? "ENV_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? false,
      severity: options.severity ?? "fatal",
      details: options.details,
      cause: options.cause,
    });
  }
}

class EnvDefinition<T> implements EnvVarDefinition<T> {
  readonly #state: EnvDefinitionState<T>;

  constructor(state: EnvDefinitionState<T>) {
    this.#state = state;
  }

  get type(): EnvVarDefinition<T>["type"] {
    return this.#state.type;
  }

  get expected(): string {
    return this.#state.expected;
  }

  get isRequired(): boolean {
    return this.#state.isRequired;
  }

  get isSecret(): boolean {
    return this.#state.isSecret;
  }

  get hasDefault(): boolean {
    return this.#state.hasDefault;
  }

  get defaultValue(): T | undefined {
    return this.#state.defaultValue;
  }

  get description(): string | undefined {
    return this.#state.description;
  }

  get exampleValue(): T | undefined {
    return this.#state.exampleValue;
  }

  get choices(): readonly string[] | undefined {
    return this.#state.choices;
  }

  parse(
    value: string,
    options: { readonly allowEmpty?: boolean } = {},
  ): T {
    return this.#state.parse(value, {
      allowEmpty: options.allowEmpty ?? false,
    });
  }

  required(): EnvVarDefinition<Exclude<T, undefined>> {
    return new EnvDefinition<Exclude<T, undefined>>({
      ...this.#state,
      isRequired: true,
      parse: this.#state.parse as EnvParser<Exclude<T, undefined>>,
      defaultValue: this.#state.defaultValue as Exclude<T, undefined>,
      exampleValue: this.#state.exampleValue as Exclude<T, undefined>,
    });
  }

  optional(): EnvVarDefinition<T | undefined> {
    return new EnvDefinition<T | undefined>({
      ...this.#state,
      isRequired: false,
      parse: this.#state.parse as EnvParser<T | undefined>,
    });
  }

  default(
    value: Exclude<T, undefined>,
  ): EnvVarDefinition<Exclude<T, undefined>> {
    return new EnvDefinition<Exclude<T, undefined>>({
      ...this.#state,
      isRequired: false,
      hasDefault: true,
      defaultValue: value,
      parse: this.#state.parse as EnvParser<Exclude<T, undefined>>,
      exampleValue: this.#state.exampleValue as Exclude<T, undefined>,
    });
  }

  describe(description: string): EnvVarDefinition<T> {
    return new EnvDefinition<T>({
      ...this.#state,
      description,
    });
  }

  example(value: Exclude<T, undefined>): EnvVarDefinition<T> {
    return new EnvDefinition<T>({
      ...this.#state,
      exampleValue: value as T,
    });
  }

  secret(): EnvVarDefinition<T> {
    return new EnvDefinition<T>({
      ...this.#state,
      isSecret: true,
    });
  }
}

/** Validates a schema using an explicit source or `Deno.env` when no source is provided. */
export function defineEnv<TSchema extends EnvSchema>(
  schema: TSchema,
  options: DefineEnvOptions = {},
): InferEnv<TSchema> {
  if (options.source !== undefined) {
    return validateEnv(schema, options.source, options);
  }

  if (options.mode === "test") {
    throw new EnvError(
      'Environment mode "test" requires an explicit source; refusing to read ' +
        "Deno.env so tests cannot pick up ambient production secrets",
      {
        code: "ENV_MODE_VIOLATION",
        details: { mode: "test", source: "Deno.env" },
      },
    );
  }

  return validateEnv(schema, readDenoEnv(), options);
}

/** Validates an environment schema against an explicit source without reading globals. */
export function validateEnv<TSchema extends EnvSchema>(
  schema: TSchema,
  source: EnvSource,
  options: DefineEnvOptions = {},
): InferEnv<TSchema> {
  const values: Record<string, unknown> = {};
  const allowEmpty = options.allowEmpty ?? false;
  const strictSecrets = options.mode === "production" ||
    options.mode === "test";

  for (const key of Object.keys(schema)) {
    const definition = schema[key];
    const sourceKey = getSourceKey(key, options.prefix);
    const rawValue = source[sourceKey];

    if (rawValue === undefined) {
      // In strict modes a secret never falls back to a (potentially unsafe)
      // default — it must be supplied explicitly or the config is invalid.
      const isSecretLike = definition.isSecret || isSecretKey(sourceKey);
      if (strictSecrets && isSecretLike && definition.hasDefault) {
        throwUnsafeSecretDefault(sourceKey, options.mode as EnvMode);
      }

      if (definition.hasDefault) {
        values[key] = definition.defaultValue;
        continue;
      }

      if (!definition.isRequired) {
        values[key] = undefined;
        continue;
      }

      throwMissingVariable(sourceKey);
    }

    try {
      values[key] = definition.parse(rawValue, { allowEmpty });
    } catch (cause) {
      throwInvalidVariable(sourceKey, definition.expected, cause);
    }
  }

  return Object.freeze(values) as InferEnv<TSchema>;
}

/** Reads `Deno.env` into an EnvSource and converts permission failures to EnvError. */
export function readDenoEnv(): EnvSource {
  const deno = (globalThis as {
    readonly Deno?: {
      readonly env?: {
        toObject(): Record<string, string>;
      };
    };
  }).Deno;

  if (deno?.env?.toObject === undefined) {
    throw new EnvError("Deno.env is not available", {
      code: "ENV_ACCESS_DENIED",
      details: { source: "Deno.env" },
    });
  }

  try {
    return fromRecord(deno.env.toObject());
  } catch (cause) {
    throw new EnvError("Unable to read Deno.env", {
      code: "ENV_ACCESS_DENIED",
      details: { source: "Deno.env" },
      cause,
    });
  }
}

/** Creates a shallow copy of an object suitable for explicit env validation. */
export function fromRecord(record: EnvSource): EnvSource {
  const source: EnvSource = {};

  for (const [key, value] of Object.entries(record)) {
    source[key] = value;
  }

  return source;
}

/** Generates `.env.example` text from an environment schema. */
export function generateEnvExample<TSchema extends EnvSchema>(
  schema: TSchema,
  options: GenerateEnvExampleOptions = {},
): string {
  const includeDescriptions = options.includeDescriptions ?? true;
  const includeDefaults = options.includeDefaults ?? true;
  const entries: string[] = [];

  for (const key of Object.keys(schema)) {
    const definition = schema[key];
    const isSensitive = definition.isSecret || isSecretKey(key);
    const lines: string[] = [];

    if (includeDescriptions && definition.description !== undefined) {
      lines.push(`# ${definition.description}`);
    } else if (isSensitive) {
      lines.push("# Secret");
    }

    if (includeDefaults && definition.hasDefault && !isSensitive) {
      lines.push(`# Default: ${formatEnvValue(definition.defaultValue)}`);
      lines.push(`${key}=${formatEnvValue(definition.defaultValue)}`);
    } else if (definition.exampleValue !== undefined && !isSensitive) {
      lines.push(`${key}=${formatEnvValue(definition.exampleValue)}`);
    } else {
      lines.push(`${key}=`);
    }

    entries.push(lines.join("\n"));
  }

  return `${entries.join("\n\n")}\n`;
}

/** Returns a copy of validated values with sensitive entries replaced. */
export function redactEnv<TSchema extends EnvSchema>(
  values: InferEnv<TSchema>,
  schema: TSchema,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  const record = values as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    const definition = schema[key];

    redacted[key] = definition?.isSecret === true || isSecretKey(key)
      ? REDACTED_VALUE
      : record[key];
  }

  return redacted;
}

/** Detects common secret-like environment variable names. */
export function isSecretKey(key: string): boolean {
  const normalizedKey = key.toUpperCase();

  return [
    "SECRET",
    "TOKEN",
    "PASSWORD",
    "PRIVATE_KEY",
    "API_KEY",
    "DATABASE_URL",
  ].some((part) => normalizedKey.includes(part));
}

/** Parses a boolean environment value using common true/false spellings. */
export function parseBoolean(value: string): boolean {
  switch (value.trim().toLowerCase()) {
    case "true":
    case "1":
    case "yes":
    case "on":
      return true;
    case "false":
    case "0":
    case "no":
    case "off":
      return false;
    default:
      throwParserError("boolean");
  }
}

/** Parses a finite number from an environment string. */
export function parseNumber(value: string): number {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throwParserError("number");
  }

  const parsed = Number(normalizedValue);

  if (!Number.isFinite(parsed)) {
    throwParserError("number");
  }

  return parsed;
}

/** Parses a finite integer from an environment string. */
export function parseInteger(value: string): number {
  const normalizedValue = value.trim();

  if (!/^[+-]?\d+$/.test(normalizedValue)) {
    throwParserError("integer");
  }

  const parsed = Number(normalizedValue);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throwParserError("integer");
  }

  return parsed;
}

/** Parses and normalizes a URL string. */
export function parseUrl(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throwParserError("url");
  }

  try {
    return new URL(normalizedValue).toString();
  } catch {
    throwParserError("url");
  }
}

/** Builder namespace for defining typed environment variables. */
export const env: {
  string(): EnvVarDefinition<string>;
  secret(): EnvVarDefinition<string>;
  number(): EnvVarDefinition<number>;
  integer(): EnvVarDefinition<number>;
  boolean(): EnvVarDefinition<boolean>;
  url(): EnvVarDefinition<string>;
  enum<const TValues extends readonly [string, ...string[]]>(
    values: TValues,
  ): EnvVarDefinition<TValues[number]>;
} = {
  string(): EnvVarDefinition<string> {
    return createDefinition<string>({
      type: "string",
      expected: "string",
      parse: parseString,
    });
  },

  secret(): EnvVarDefinition<string> {
    return createDefinition<string>({
      type: "secret",
      expected: "secret",
      isSecret: true,
      parse: parseString,
    });
  },

  number(): EnvVarDefinition<number> {
    return createDefinition<number>({
      type: "number",
      expected: "number",
      parse: (value) => parseNumber(value),
    });
  },

  integer(): EnvVarDefinition<number> {
    return createDefinition<number>({
      type: "integer",
      expected: "integer",
      parse: (value) => parseInteger(value),
    });
  },

  boolean(): EnvVarDefinition<boolean> {
    return createDefinition<boolean>({
      type: "boolean",
      expected: "boolean",
      parse: (value) => parseBoolean(value),
    });
  },

  url(): EnvVarDefinition<string> {
    return createDefinition<string>({
      type: "url",
      expected: "url",
      parse: (value) => parseUrl(value),
    });
  },

  enum<const TValues extends readonly [string, ...string[]]>(
    values: TValues,
  ): EnvVarDefinition<TValues[number]> {
    if (values.length === 0) {
      throw new EnvError(
        "Enum environment variable definition requires at least one value",
        {
          code: "ENV_UNKNOWN_ERROR",
          details: { expected: "non-empty enum values" },
        },
      );
    }

    return createDefinition<TValues[number]>({
      type: "enum",
      expected: `one of: ${values.join(", ")}`,
      choices: values,
      parse: (value) => {
        const normalizedValue = value.trim();

        if (values.includes(normalizedValue)) {
          return normalizedValue as TValues[number];
        }

        throwParserError(`one of: ${values.join(", ")}`);
      },
    });
  },
};

/**
 * Provider presets (`0.5`): ready-made {@link EnvSchema} fragments for common
 * providers, built from the `env.*` builders. They add **no** provider
 * dependency — they only declare the conventional variable names, types,
 * secret-marking, and `.describe()`/`.example()` metadata. Spread one into
 * `defineEnv` and override individual keys as needed:
 *
 * ```ts
 * const config = defineEnv({
 *   ...presets.neon(),
 *   ...presets.s3(),
 *   PORT: env.integer().default(8000),
 * });
 * ```
 */
export const presets: {
  neon(): { DATABASE_URL: EnvVarDefinition<string> };
  turso(): {
    TURSO_DATABASE_URL: EnvVarDefinition<string>;
    TURSO_AUTH_TOKEN: EnvVarDefinition<string>;
  };
  resend(): { RESEND_API_KEY: EnvVarDefinition<string> };
  clerk(): {
    CLERK_PUBLISHABLE_KEY: EnvVarDefinition<string>;
    CLERK_SECRET_KEY: EnvVarDefinition<string>;
  };
  s3(): {
    S3_REGION: EnvVarDefinition<string>;
    S3_ACCESS_KEY_ID: EnvVarDefinition<string>;
    S3_SECRET_ACCESS_KEY: EnvVarDefinition<string>;
    S3_BUCKET: EnvVarDefinition<string>;
    S3_ENDPOINT: EnvVarDefinition<string | undefined>;
  };
} = {
  neon() {
    return {
      DATABASE_URL: env.url().secret().describe(
        "Neon Postgres connection string",
      ).example("postgres://user:password@ep-xyz.region.neon.tech/dbname"),
    };
  },

  turso() {
    return {
      TURSO_DATABASE_URL: env.string().describe(
        "Turso/libSQL database URL",
      ).example("libsql://db-name-org.turso.io"),
      TURSO_AUTH_TOKEN: env.secret().describe("Turso database auth token"),
    };
  },

  resend() {
    return {
      RESEND_API_KEY: env.secret().describe("Resend API key").example(
        "re_xxxxxxxx",
      ),
    };
  },

  clerk() {
    return {
      CLERK_PUBLISHABLE_KEY: env.string().describe(
        "Clerk publishable key (safe to expose to the client)",
      ).example("pk_test_xxxxxxxx"),
      CLERK_SECRET_KEY: env.secret().describe("Clerk backend secret key")
        .example("sk_test_xxxxxxxx"),
    };
  },

  s3() {
    return {
      S3_REGION: env.string().describe("S3/R2 region").example("us-east-1"),
      S3_ACCESS_KEY_ID: env.secret().describe("S3/R2 access key id"),
      S3_SECRET_ACCESS_KEY: env.secret().describe("S3/R2 secret access key"),
      S3_BUCKET: env.string().describe("S3/R2 bucket name"),
      // Optional: omit for AWS (regional default); set for R2/MinIO/RustFS.
      S3_ENDPOINT: env.url().optional().describe(
        "S3-compatible endpoint (omit for AWS)",
      ),
    };
  },
};

function createDefinition<T>(
  state: {
    readonly type: EnvVarDefinition<T>["type"];
    readonly expected: string;
    readonly isSecret?: boolean;
    readonly choices?: readonly string[];
    readonly parse: EnvParser<T>;
  },
): EnvVarDefinition<T> {
  return new EnvDefinition<T>({
    type: state.type,
    expected: state.expected,
    isRequired: true,
    isSecret: state.isSecret ?? false,
    hasDefault: false,
    choices: state.choices,
    parse: state.parse,
  });
}

function parseString(value: string, options: EnvParserOptions): string {
  if (!options.allowEmpty && value.trim().length === 0) {
    throwParserError("non-empty string");
  }

  return value;
}

function throwMissingVariable(variable: string): never {
  throw new EnvError(`Missing required environment variable: ${variable}`, {
    code: "ENV_MISSING_VARIABLE",
    status: 500,
    expose: false,
    severity: "fatal",
    details: { variable },
  });
}

function throwInvalidVariable(
  variable: string,
  expected: string,
  cause: unknown,
): never {
  throw new EnvError(
    `Invalid environment variable ${variable}: expected ${expected}`,
    {
      code: "ENV_INVALID_VARIABLE",
      status: 500,
      expose: false,
      severity: "fatal",
      details: { variable, expected },
      cause,
    },
  );
}

function throwUnsafeSecretDefault(variable: string, mode: EnvMode): never {
  throw new EnvError(
    `Missing required secret environment variable: ${variable} ` +
      `(mode "${mode}" does not apply default values to secrets — ` +
      `set it explicitly)`,
    {
      code: "ENV_MISSING_VARIABLE",
      status: 500,
      expose: false,
      severity: "fatal",
      details: { variable, mode, reason: "unsafe-default" },
    },
  );
}

function throwParserError(expected: string, cause?: unknown): never {
  throw new EnvError("Invalid environment variable value", {
    code: "ENV_INVALID_VARIABLE",
    status: 500,
    expose: false,
    severity: "fatal",
    details: { expected },
    cause,
  });
}

function getSourceKey(key: string, prefix: string | undefined): string {
  return prefix === undefined ? key : `${prefix}${key}`;
}

function formatEnvValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

// --- .env file loading (v0.4) ---------------------------------------------

/**
 * Reads a file's text, returning `undefined` when it does not exist. Injected
 * into {@link loadEnvFiles} so loading is testable without touching disk; the
 * default ({@link denoEnvFileReader}) uses `Deno.readTextFileSync`.
 */
export type EnvFileReader = (path: string) => string | undefined;

/** Options for {@link loadEnvFiles}. */
export interface LoadEnvFilesOptions {
  /** Selects the `.env.<mode>` files; also skips `*.local` files in `test`. */
  readonly mode?: EnvMode;
  /** Directory the `.env*` files live in. Defaults to `"."`. */
  readonly dir?: string;
  /** Explicit ordered file list (later wins), overriding the convention. */
  readonly files?: readonly string[];
  /** File reader. Defaults to {@link denoEnvFileReader}. */
  readonly reader?: EnvFileReader;
}

/**
 * Parses `.env`-style text into a record.
 *
 * Supports `KEY=VALUE`, blank lines, `#` comments, an optional `export ` prefix,
 * and single- or double-quoted values (double quotes expand `\n`/`\t`/`\r`/`\\`/
 * `\"`; single quotes are literal). Unquoted values are trimmed and kept as-is.
 */
export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length)
      : line;
    const equals = withoutExport.indexOf("=");
    if (equals <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    result[key] = parseEnvValue(withoutExport.slice(equals + 1).trim());
  }

  return result;
}

/** Default {@link EnvFileReader} backed by `Deno.readTextFileSync`. */
export function denoEnvFileReader(): EnvFileReader {
  const deno = (globalThis as {
    readonly Deno?: {
      readTextFileSync(path: string): string;
      readonly errors: { readonly NotFound: new (...args: never[]) => Error };
    };
  }).Deno;

  if (deno === undefined) {
    throw new EnvError("Deno file APIs are not available", {
      code: "ENV_ACCESS_DENIED",
      details: { source: "Deno.readTextFileSync" },
    });
  }

  return (path) => {
    try {
      return deno.readTextFileSync(path);
    } catch (cause) {
      if (cause instanceof deno.errors.NotFound) {
        return undefined;
      }
      throw new EnvError("Unable to read env file", {
        code: "ENV_ACCESS_DENIED",
        details: { path },
        cause,
      });
    }
  };
}

/**
 * Loads and merges conventional `.env` files into an {@link EnvSource} suitable
 * for `defineEnv({ source })`. Files are merged in order (later wins):
 * `.env` → `.env.<mode>` → `.env.local` → `.env.<mode>.local`. `*.local` files
 * are skipped in `test` mode so tests never pick up a developer's local
 * overrides. Pass `files` to load an explicit ordered list instead.
 *
 * Do not load `.env` files in production — production should inject real
 * environment variables. Use this for local development and tests.
 */
export function loadEnvFiles(options: LoadEnvFilesOptions = {}): EnvSource {
  const reader = options.reader ?? denoEnvFileReader();
  const dir = options.dir ?? ".";
  const files = options.files ?? conventionalEnvFiles(options.mode);
  const merged: EnvSource = {};

  for (const file of files) {
    const text = reader(joinEnvPath(dir, file));
    if (text === undefined) {
      continue;
    }
    Object.assign(merged, parseEnvFile(text));
  }

  return merged;
}

function conventionalEnvFiles(mode: EnvMode | undefined): string[] {
  const files = [".env"];
  if (mode !== undefined) {
    files.push(`.env.${mode}`);
  }
  // Local override files are skipped in test so tests stay deterministic.
  if (mode !== "test") {
    files.push(".env.local");
    if (mode !== undefined) {
      files.push(`.env.${mode}.local`);
    }
  }
  return files;
}

function parseEnvValue(value: string): string {
  if (value.length === 0) {
    return "";
  }

  const quote = value[0];
  if (
    (quote === '"' || quote === "'") && value.endsWith(quote) &&
    value.length >= 2
  ) {
    const inner = value.slice(1, -1);
    return quote === '"' ? expandDoubleQuoted(inner) : inner;
  }

  return value;
}

function expandDoubleQuoted(value: string): string {
  return value.replace(/\\([ntr"\\])/g, (_match, escaped: string) => {
    switch (escaped) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      default:
        return escaped;
    }
  });
}

function joinEnvPath(dir: string, file: string): string {
  if (dir === "." || dir === "") {
    return file;
  }
  return dir.endsWith("/") ? `${dir}${file}` : `${dir}/${file}`;
}

// Example:
// const schema = {
//   DATABASE_URL: env.url().describe("Database connection URL"),
//   LOG_LEVEL: env.enum(["debug", "info", "warn", "error"]).default("info"),
//   PORT: env.integer().default(8000),
//   SESSION_SECRET: env.secret(),
//   ENABLE_SIGNUPS: env.boolean().default(true),
// };
//
// const values = defineEnv(schema, {
//   source: {
//     DATABASE_URL: "postgres://localhost/app",
//     SESSION_SECRET: "dev-secret",
//   },
// });
//
// const explicitSource = fromRecord({
//   DATABASE_URL: "postgres://localhost/app",
// });
//
// const validated = validateEnv(schema, explicitSource);
// const safeValues = redactEnv(values, schema);
// const example = generateEnvExample(schema);
