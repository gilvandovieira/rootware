/**
 * Pino-shaped compatibility layer for `@rootware/log`.
 *
 * This subpath provides a `pino()` constructor that accepts common Pino
 * application options and call forms, so migrating typical Pino usage to
 * `@rootware/log` is mostly mechanical. It is **Pino-shaped**, not a drop-in
 * replacement: transports, `pino.destination`, worker threads, and Pino symbol
 * internals are deliberately out of scope (see the README migration guide).
 *
 * @example
 * ```ts
 * import pino from "jsr:@rootware/log/compat/pino";
 *
 * const logger = pino({ level: "info", base: { service: "api" } });
 * logger.info({ port: 8000 }, "listening");
 * logger.error(new Error("boom"), "request failed");
 * logger.child({ requestId: "req_123" }).debug("loaded user");
 * ```
 *
 * @module
 */

import {
  createLogger,
  type LogBindings,
  type Logger,
  type LogLevel,
  type LogLevelName,
  type LogSink,
  type LogSinkResult,
  type RedactOptions,
  serializeErrorForLog,
} from "../../mod.ts";

/**
 * Map of field name to serializer, matching Pino's `serializers` option. A
 * serializer keyed by the error key (default `"err"`) — or by `err`/`error` —
 * is also applied to error arguments.
 */
export interface PinoSerializers {
  readonly [key: string]: (value: unknown) => unknown;
}

/** Subset of Pino logger options supported by the compatibility layer. */
export interface PinoOptions {
  readonly name?: string;
  readonly level?: LogLevelName;
  readonly base?: LogBindings | null;
  /**
   * `true`/omitted uses the default ISO timestamp; a function supplies a custom
   * one; `false` emits an empty `time` (Rootware records always carry `time`,
   * so the field is blanked rather than removed).
   */
  readonly timestamp?: boolean | (() => string);
  /** Key used for the log message. Defaults to Pino's `"msg"`. */
  readonly messageKey?: string;
  /** Key used for the serialized error. Defaults to Pino's `"err"`. */
  readonly errorKey?: string;
  readonly serializers?: PinoSerializers;
  readonly redact?: readonly string[] | RedactOptions;
  readonly enabled?: boolean;
}

/** Options accepted by {@link PinoLogger.child}. */
export interface PinoChildOptions {
  readonly level?: LogLevelName;
  readonly serializers?: PinoSerializers;
}

/** Pino-shaped logger returned by {@link pino}. */
export interface PinoLogger {
  readonly level: LogLevelName;
  readonly bindings: LogBindings;

  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(...args: unknown[]): void;

  isLevelEnabled(level: LogLevel): boolean;
  child(bindings: LogBindings, options?: PinoChildOptions): PinoLogger;
  flush(): LogSinkResult;
  close(): LogSinkResult;
}

const DEFAULT_MESSAGE_KEY = "msg";
const DEFAULT_ERROR_KEY = "err";

type LevelMethod = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

class RootwarePinoLogger implements PinoLogger {
  readonly #core: Logger;
  readonly #serializers: PinoSerializers;
  readonly #errorKey: string;

  constructor(core: Logger, serializers: PinoSerializers, errorKey: string) {
    this.#core = core;
    this.#serializers = serializers;
    this.#errorKey = errorKey;
  }

  get level(): LogLevelName {
    return this.#core.level;
  }

  get bindings(): LogBindings {
    return this.#core.bindings;
  }

  trace(...args: unknown[]): void {
    this.#log("trace", args);
  }

  debug(...args: unknown[]): void {
    this.#log("debug", args);
  }

  info(...args: unknown[]): void {
    this.#log("info", args);
  }

  warn(...args: unknown[]): void {
    this.#log("warn", args);
  }

  error(...args: unknown[]): void {
    this.#log("error", args);
  }

  fatal(...args: unknown[]): void {
    this.#log("fatal", args);
  }

  isLevelEnabled(level: LogLevel): boolean {
    return this.#core.isLevelEnabled(level);
  }

  child(bindings: LogBindings, options: PinoChildOptions = {}): PinoLogger {
    const childCore = this.#core.child(bindings, { level: options.level });
    const serializers = options.serializers === undefined
      ? this.#serializers
      : { ...this.#serializers, ...options.serializers };
    return new RootwarePinoLogger(childCore, serializers, this.#errorKey);
  }

  flush(): LogSinkResult {
    return this.#core.flush();
  }

  close(): LogSinkResult {
    return this.#core.close();
  }

  #log(level: LevelMethod, args: unknown[]): void {
    if (!this.#core.isLevelEnabled(level)) {
      return;
    }

    const { merge, message, errorValue } = parsePinoArgs(args);
    const object: Record<string, unknown> = merge ? { ...merge } : {};

    // Apply field serializers to any matching keys in the merge object.
    for (const key of Object.keys(object)) {
      const serializer = this.#serializers[key];
      if (serializer !== undefined) {
        object[key] = serializer(object[key]);
      }
    }

    if (errorValue !== undefined) {
      object[this.#errorKey] = this.#serializeError(errorValue);
    }

    const coreArgs: unknown[] = [];
    if (Object.keys(object).length > 0) {
      coreArgs.push(object);
    }
    if (message !== undefined) {
      coreArgs.push(message);
    }

    this.#core[level](...coreArgs);
  }

  #serializeError(value: unknown): unknown {
    const serializer = this.#serializers[this.#errorKey] ??
      this.#serializers.err ?? this.#serializers.error;
    if (serializer !== undefined) {
      return serializer(value);
    }
    return serializeErrorForLog(value);
  }
}

/**
 * Creates a Pino-shaped logger over `@rootware/log`'s `createLogger`.
 *
 * Supports the common Pino call forms — `info("msg")`,
 * `info({ field }, "msg")`, and `error(new Error(), "msg")` — plus the `name`,
 * `level`, `base`, `timestamp`, `messageKey`, `errorKey`, `serializers`, and
 * `redact` options. `logger.level` is read-only (assigning to it is a
 * compatibility non-target); change the level with `child(bindings, { level })`.
 */
export function pino(
  options: PinoOptions = {},
  sink?: LogSink,
): PinoLogger {
  const errorKey = options.errorKey ?? DEFAULT_ERROR_KEY;
  const core = createLogger(
    {
      name: options.name,
      level: options.level,
      base: options.base,
      enabled: options.enabled,
      messageKey: options.messageKey ?? DEFAULT_MESSAGE_KEY,
      errorKey,
      redact: options.redact,
      timestamp: resolveTimestamp(options.timestamp),
    },
    sink,
  );

  return new RootwarePinoLogger(core, options.serializers ?? {}, errorKey);
}

export default pino;

function resolveTimestamp(
  timestamp: PinoOptions["timestamp"],
): (() => string) | undefined {
  if (typeof timestamp === "function") {
    return timestamp;
  }
  if (timestamp === false) {
    return () => "";
  }
  return undefined;
}

function parsePinoArgs(args: unknown[]): {
  merge?: Record<string, unknown>;
  message?: string;
  errorValue?: unknown;
} {
  let merge: Record<string, unknown> | undefined;
  let message: string | undefined;
  let errorValue: unknown;

  for (const arg of args) {
    if (arg === undefined) {
      continue;
    }

    if (errorValue === undefined && arg instanceof Error) {
      errorValue = arg;
      continue;
    }

    if (merge === undefined && isPlainObject(arg)) {
      merge = arg;
      continue;
    }

    if (message === undefined && typeof arg === "string") {
      message = arg;
    }
  }

  return {
    ...(merge !== undefined ? { merge } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(errorValue !== undefined ? { errorValue } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (value instanceof Error || value instanceof Date) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
