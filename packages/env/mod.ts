import { RootwareError } from "@rootware/errors";

const REDACTED_VALUE = "[REDACTED]";

export type EnvMode = "development" | "test" | "production";

export type EnvErrorCode =
  | "ENV_MISSING_VARIABLE"
  | "ENV_INVALID_VARIABLE"
  | "ENV_ACCESS_DENIED"
  | "ENV_UNKNOWN_ERROR"
  | (string & {});

export type EnvSource = Record<string, string | undefined>;

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

export type EnvSchema = Record<string, EnvVarDefinition<unknown>>;

export type InferEnv<TSchema extends EnvSchema> = {
  readonly [K in keyof TSchema]: TSchema[K] extends EnvVarDefinition<infer T>
    ? T
    : never;
};

export interface DefineEnvOptions {
  readonly source?: EnvSource;
  readonly mode?: EnvMode;
  readonly prefix?: string;
  readonly allowEmpty?: boolean;
}

export interface GenerateEnvExampleOptions {
  readonly includeDescriptions?: boolean;
  readonly includeDefaults?: boolean;
}

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

export function defineEnv<TSchema extends EnvSchema>(
  schema: TSchema,
  options: DefineEnvOptions = {},
): InferEnv<TSchema> {
  if (options.source !== undefined) {
    return validateEnv(schema, options.source, options);
  }

  return validateEnv(schema, readDenoEnv(), options);
}

export function validateEnv<TSchema extends EnvSchema>(
  schema: TSchema,
  source: EnvSource,
  options: DefineEnvOptions = {},
): InferEnv<TSchema> {
  const values: Record<string, unknown> = {};
  const allowEmpty = options.allowEmpty ?? false;

  for (const key of Object.keys(schema)) {
    const definition = schema[key];
    const sourceKey = getSourceKey(key, options.prefix);
    const rawValue = source[sourceKey];

    if (rawValue === undefined) {
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

export function fromRecord(record: EnvSource): EnvSource {
  const source: EnvSource = {};

  for (const [key, value] of Object.entries(record)) {
    source[key] = value;
  }

  return source;
}

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
  throw new EnvError(`Invalid environment variable: ${variable}`, {
    code: "ENV_INVALID_VARIABLE",
    status: 500,
    expose: false,
    severity: "fatal",
    details: { variable, expected },
    cause,
  });
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
