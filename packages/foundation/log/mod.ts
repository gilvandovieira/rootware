/**
 * Structured JSON logging primitives for Rootware packages and Deno backends.
 *
 * Provides log levels, child loggers, sinks, redaction, error serialization,
 * filtering, buffering, fanout, and failover helpers.
 *
 * @module
 */

import { RootwareError } from "@rootware/errors";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** String log level names accepted by Rootware loggers. */
export type LogLevelName =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "silent";

/** Numeric severity values emitted in structured log records. */
export type LogLevelNumber =
  | 10
  | 20
  | 30
  | 40
  | 50
  | 60
  | (number & Record<never, never>);

/** Any supported log level, by name or numeric severity. */
export type LogLevel = LogLevelName | LogLevelNumber;

/** Error codes emitted by log level parsing, serialization, and sink writes. */
export type LogErrorCode =
  | "LOG_INVALID_LEVEL"
  | "LOG_WRITE_FAILED"
  | "LOG_SERIALIZATION_FAILED"
  | "LOG_UNKNOWN_ERROR"
  | (string & Record<never, never>);

/** JSON-safe value accepted in log bindings and structured records. */
export type LogValue =
  | string
  | number
  | boolean
  | null
  | readonly LogValue[]
  | LogObject;

/** JSON-safe object accepted in log bindings and structured records. */
export interface LogObject {
  readonly [key: string]: LogValue | undefined;
}

/** Static fields attached to every record written by a logger. */
export type LogBindings = LogObject;

/** JSON-safe record emitted by Rootware loggers. */
export interface LogRecord {
  level: LogLevelNumber;
  levelName: LogLevelName;
  time: string;
  msg?: string;
  name?: string;
  error?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Return type accepted from synchronous or asynchronous log sinks. */
export type LogSinkResult = void | Promise<void>;

/** Destination for encoded JSON Lines log entries. */
export interface LogSink {
  write(line: Uint8Array): LogSinkResult;
  flush?(): LogSinkResult;
  close?(): LogSinkResult;
}

/** Structured logger interface used by Rootware packages. */
export interface Logger {
  readonly level: LogLevelName;
  readonly bindings: LogBindings;

  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(...args: unknown[]): void;

  /** Returns true when a record at `level` would be written by this logger. */
  isLevelEnabled(level: LogLevel): boolean;

  child(bindings: LogBindings, options?: ChildLoggerOptions): Logger;
  flush(): LogSinkResult;
  close(): LogSinkResult;
}

/** Handler invoked when a sink write fails. Receives the JSON line that failed. */
export type LogWriteErrorHandler = (error: LogError, line: string) => void;

/**
 * Redaction configuration. Each path is a dot-separated key sequence where `*`
 * matches any single key (e.g. `"password"`, `"*.authorization"`,
 * `"req.headers.cookie"`). Matched leaves are replaced with `censor`.
 */
export interface RedactOptions {
  readonly paths: readonly string[];
  readonly censor?: string;
}

/** Options for creating a logger. */
export interface LoggerOptions {
  readonly level?: LogLevelName;
  readonly name?: string;
  readonly bindings?: LogBindings;
  readonly timestamp?: () => string;
  readonly base?: LogBindings | null;
  readonly enabled?: boolean;
  /** Key used for the log message. Defaults to `"msg"`. */
  readonly messageKey?: string;
  /** Key used for the serialized error. Defaults to `"error"`. */
  readonly errorKey?: string;
  /** Field paths to redact, or full {@link RedactOptions}. */
  readonly redact?: readonly string[] | RedactOptions;
  /** Invoked on sink write failure instead of throwing. */
  readonly onWriteError?: LogWriteErrorHandler;
}

/** Options applied when deriving a child logger from an existing logger. */
export interface ChildLoggerOptions {
  readonly level?: LogLevelName;
  readonly name?: string;
}

/** In-memory sink useful for deterministic tests. */
export interface MemoryLogSink extends LogSink {
  lines(): string[];
  records<T = LogRecord>(): T[];
  clear(): void;
}

/** Options for batching writes before sending them to an inner sink. */
export interface BufferedSinkOptions {
  readonly maxRecords?: number;
  readonly maxBytes?: number;
  readonly flushIntervalMs?: number;
  readonly flushOnError?: boolean;
}

/** Options accepted when constructing a {@link LogError}. */
export interface LogErrorOptions {
  readonly code?: LogErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Numeric mapping for supported log levels. */
export const levels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity as LogLevelNumber,
} as const;

/** Error thrown for invalid levels, serialization failures, and sink failures. */
export class LogError extends RootwareError {
  constructor(message: string, options: LogErrorOptions = {}) {
    super(message, {
      code: options.code ?? "LOG_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? false,
      severity: options.severity ?? "error",
      details: options.details,
      cause: options.cause,
    });
  }
}

/** Creates a structured JSON Lines logger. */
export function createLogger(
  options: LoggerOptions = {},
  sink: LogSink = stdoutSink(),
): Logger {
  return new RootwareLogger(options, sink);
}

/** Creates a logger implementation that discards all records. */
export function createNoopLogger(): Logger {
  return new RootwareLogger(
    {
      level: "silent",
      enabled: false,
      base: null,
    },
    noopSink(),
  );
}

/** Creates a sink that writes encoded lines to `Deno.stdout`. */
export function stdoutSink(): LogSink {
  return denoStreamSink("stdout");
}

/** Creates a sink that writes encoded lines to `Deno.stderr`. */
export function stderrSink(): LogSink {
  return denoStreamSink("stderr");
}

/** Creates an in-memory sink for tests and assertions. */
export function memorySink(): MemoryLogSink {
  const buffer: string[] = [];

  return {
    write(line: Uint8Array): void {
      appendLines(buffer, textDecoder.decode(line));
    },

    flush(): void {
      // Memory logs are immediately available.
    },

    close(): void {
      // Closing a memory sink is intentionally a no-op for test inspection.
    },

    lines(): string[] {
      return [...buffer];
    },

    records<T = LogRecord>(): T[] {
      return buffer.map((line) => JSON.parse(line) as T);
    },

    clear(): void {
      buffer.length = 0;
    },
  };
}

/** Wraps a sink to make immediate writes explicit. */
export function unbufferedSink(sink: LogSink): LogSink {
  return {
    write(line: Uint8Array): LogSinkResult {
      return sink.write(line);
    },

    flush(): LogSinkResult {
      return sink.flush?.();
    },

    close(): LogSinkResult {
      return sink.close?.();
    },
  };
}

/** Wraps a sink with an in-memory batch buffer. */
export function bufferedSink(
  sink: LogSink,
  options: BufferedSinkOptions = {},
): LogSink {
  let chunks: Uint8Array[] = [];
  let byteLength = 0;
  let closed = false;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const maxRecords = options.maxRecords ?? Infinity;
  const maxBytes = options.maxBytes ?? Infinity;
  const flushOnError = options.flushOnError ?? true;

  const flush = (): LogSinkResult => {
    if (chunks.length === 0) {
      return undefined;
    }

    const pendingChunks = chunks;
    const pendingByteLength = byteLength;
    const batch = concatChunks(pendingChunks, pendingByteLength);
    chunks = [];
    byteLength = 0;

    try {
      const result = sink.write(batch);

      if (isPromiseLike(result)) {
        return result.catch((cause) => {
          chunks = [...pendingChunks, ...chunks];
          byteLength += pendingByteLength;
          throw cause;
        });
      }

      return result;
    } catch (cause) {
      chunks = [...pendingChunks, ...chunks];
      byteLength += pendingByteLength;
      throw cause;
    }
  };

  if (
    options.flushIntervalMs !== undefined &&
    options.flushIntervalMs > 0
  ) {
    intervalId = setInterval(() => {
      try {
        const result = flush();
        if (isPromiseLike(result)) {
          result.catch((cause) => {
            throwWriteError(cause);
          });
        }
      } catch (cause) {
        throwWriteError(cause);
      }
    }, options.flushIntervalMs);
  }

  return {
    write(line: Uint8Array): LogSinkResult {
      if (closed) {
        throw new LogError("Cannot write to a closed log sink", {
          code: "LOG_WRITE_FAILED",
        });
      }

      const chunk = line.slice();
      chunks.push(chunk);
      byteLength += chunk.byteLength;

      if (
        chunks.length >= maxRecords ||
        byteLength >= maxBytes ||
        (flushOnError && isErrorLine(chunk))
      ) {
        return flush();
      }

      return undefined;
    },

    flush(): LogSinkResult {
      return flush();
    },

    close(): LogSinkResult {
      closed = true;

      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }

      const flushResult = flush();

      if (isPromiseLike(flushResult)) {
        return flushResult.then(() => sink.close?.());
      }

      return sink.close?.();
    },
  };
}

/** Wraps a standard `WritableStream<Uint8Array>` as a {@link LogSink}. */
export function writableStreamSink(
  stream: WritableStream<Uint8Array>,
): LogSink {
  const writer = stream.getWriter();

  return {
    write(line: Uint8Array): LogSinkResult {
      return writer.write(line.slice()).then(() => undefined);
    },

    async close(): Promise<void> {
      await writer.close();
    },
  };
}

/** Options for {@link fileSink}. */
export interface FileSinkOptions {
  /** Append to the file (default) or truncate it on open. */
  readonly append?: boolean;
}

/**
 * Writes encoded log lines to a file using Deno file APIs. Needs
 * `--allow-write` (and `--allow-read` when the file exists). Deno-native and
 * permission-minimal; the file is opened once and closed on `close()`.
 */
export function fileSink(path: string, options: FileSinkOptions = {}): LogSink {
  const append = options.append ?? true;
  const deno = (globalThis as {
    readonly Deno?: {
      openSync(
        path: string,
        opts: {
          write: boolean;
          create: boolean;
          append: boolean;
          truncate: boolean;
        },
      ): { writeSync(data: Uint8Array): number; close(): void };
    };
  }).Deno;

  if (deno?.openSync === undefined) {
    throw new LogError("Deno file APIs are not available", {
      code: "LOG_WRITE_FAILED",
      details: { sink: "file" },
    });
  }

  const file = deno.openSync(path, {
    write: true,
    create: true,
    append,
    truncate: !append,
  });

  return {
    write(line: Uint8Array): LogSinkResult {
      try {
        file.writeSync(line);
        return undefined;
      } catch (cause) {
        throwWriteError(cause);
      }
    },

    close(): void {
      file.close();
    },
  };
}

/** Writes every line to all of the given sinks. */
export function fanoutSink(...sinks: readonly LogSink[]): LogSink {
  return {
    write(line: Uint8Array): LogSinkResult {
      const pending: Promise<void>[] = [];
      for (const sink of sinks) {
        const result = sink.write(line);
        if (isPromiseLike(result)) {
          pending.push(result);
        }
      }
      return pending.length === 0
        ? undefined
        : Promise.all(pending).then(() => undefined);
    },

    flush(): LogSinkResult {
      return settleAll(sinks.map((sink) => sink.flush?.()));
    },

    close(): LogSinkResult {
      return settleAll(sinks.map((sink) => sink.close?.()));
    },
  };
}

/** Predicate over a decoded {@link LogRecord} for {@link filterSink}. */
export type LogRecordFilter = (record: LogRecord) => boolean;

/**
 * Forwards a line to `sink` only when `predicate` accepts the decoded record.
 * A line that cannot be parsed back into JSON is passed through unchanged.
 */
export function filterSink(
  sink: LogSink,
  predicate: LogRecordFilter,
): LogSink {
  return {
    write(line: Uint8Array): LogSinkResult {
      const record = decodeLogLine(line);
      if (record !== undefined && !predicate(record)) {
        return undefined;
      }
      return sink.write(line);
    },

    flush(): LogSinkResult {
      return sink.flush?.();
    },

    close(): LogSinkResult {
      return sink.close?.();
    },
  };
}

/** Forwards a line to `sink` only when its level is at least `minLevel`. */
export function levelSink(sink: LogSink, minLevel: LogLevel): LogSink {
  const min = getLogLevelNumber(minLevel);
  return filterSink(
    sink,
    (record) => typeof record.level !== "number" || record.level >= min,
  );
}

/**
 * Writes to `primary`, falling back to `fallback` if the primary write fails
 * (synchronously or asynchronously). Flush/close fan out to both.
 */
export function failoverSink(primary: LogSink, fallback: LogSink): LogSink {
  return {
    write(line: Uint8Array): LogSinkResult {
      try {
        const result = primary.write(line);
        if (isPromiseLike(result)) {
          return result.catch(() => fallback.write(line));
        }
        return result;
      } catch {
        return fallback.write(line);
      }
    },

    flush(): LogSinkResult {
      return settleAll([primary.flush?.(), fallback.flush?.()]);
    },

    close(): LogSinkResult {
      return settleAll([primary.close?.(), fallback.close?.()]);
    },
  };
}

function decodeLogLine(line: Uint8Array): LogRecord | undefined {
  try {
    return JSON.parse(textDecoder.decode(line)) as LogRecord;
  } catch {
    return undefined;
  }
}

function settleAll(results: readonly LogSinkResult[]): LogSinkResult {
  const pending = results.filter(isPromiseLike);
  return pending.length === 0
    ? undefined
    : Promise.all(pending).then(() => undefined);
}

/** Returns true when a value is a supported log level name. */
export function isLogLevelName(value: unknown): value is LogLevelName {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(levels, value);
}

/** Resolves a level name or number into its numeric representation. */
export function getLogLevelNumber(level: LogLevel): LogLevelNumber {
  if (isLogLevelName(level)) {
    return levels[level];
  }

  if (
    typeof level === "number" &&
    (level === levels.trace ||
      level === levels.debug ||
      level === levels.info ||
      level === levels.warn ||
      level === levels.error ||
      level === levels.fatal ||
      level === Infinity)
  ) {
    return level as LogLevelNumber;
  }

  throw new LogError("Invalid log level", {
    code: "LOG_INVALID_LEVEL",
    details: { level: typeof level },
  });
}

/** Checks whether a message should be written at the current level. */
export function shouldLog(
  currentLevel: LogLevel,
  messageLevel: LogLevel,
): boolean {
  const currentLevelNumber = getLogLevelNumber(currentLevel);
  const messageLevelNumber = getLogLevelNumber(messageLevel);

  return currentLevelNumber !== Infinity &&
    messageLevelNumber !== Infinity &&
    messageLevelNumber >= currentLevelNumber;
}

/**
 * Serializes unknown error values into JSON-safe log fields, **including the
 * stack** and all Rootware error fields (regardless of `expose`).
 *
 * This is the internal/diagnostic serializer. For user-facing payloads use the
 * `expose`-respecting, no-stack `serializeError` from `@rootware/errors`. The
 * two are deliberately named differently so an app can import both.
 */
export function serializeErrorForLog(
  error: unknown,
): Record<string, unknown> {
  try {
    return serializeErrorValue(error, new WeakSet<object>());
  } catch {
    return {
      name: "Error",
      message: "Unable to serialize error",
    };
  }
}

/** Normalizes Pino-like log arguments into object, message, and error fields. */
export function normalizeLogInput(args: unknown[]): {
  object?: LogObject;
  message?: string;
  error?: Record<string, unknown>;
} {
  let object: LogObject | undefined;
  let message: string | undefined;
  let error: Record<string, unknown> | undefined;

  for (const arg of args) {
    if (arg === undefined) {
      continue;
    }

    if (error === undefined && arg instanceof Error) {
      error = serializeErrorForLog(arg);
      continue;
    }

    if (object === undefined && isPlainObject(arg)) {
      object = toLogObject(arg);
      continue;
    }

    if (message === undefined && typeof arg === "string") {
      message = arg;
    }
  }

  return {
    ...(object !== undefined ? { object } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(error !== undefined ? { error } : {}),
  };
}

/** Formats a log record as one JSON line. */
export function formatLogRecord(record: LogRecord): string {
  return formatRecordLine(record, undefined);
}

const DEFAULT_REDACT_CENSOR = "[Redacted]";

interface CompiledRedaction {
  readonly paths: readonly (readonly string[])[];
  readonly censor: string;
}

function compileRedaction(
  input: readonly string[] | RedactOptions | undefined,
): CompiledRedaction | undefined {
  if (input === undefined) {
    return undefined;
  }

  const isArray = Array.isArray(input);
  const rawPaths: readonly string[] = isArray
    ? input as readonly string[]
    : (input as RedactOptions).paths;
  const censor = isArray
    ? DEFAULT_REDACT_CENSOR
    : (input as RedactOptions).censor ?? DEFAULT_REDACT_CENSOR;

  const paths = rawPaths
    .map((path) => path.split(".").filter((segment) => segment.length > 0))
    .filter((segments) => segments.length > 0);

  return paths.length > 0 ? { paths, censor } : undefined;
}

function applyRedaction(
  target: Record<string, unknown>,
  redaction: CompiledRedaction,
): void {
  for (const segments of redaction.paths) {
    redactPath(target, segments, 0, redaction.censor);
  }
}

function redactPath(
  node: unknown,
  segments: readonly string[],
  index: number,
  censor: string,
): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  const segment = segments[index];
  const isLast = index === segments.length - 1;
  const keys = segment === "*" ? Object.keys(record) : [segment];

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }

    if (isLast) {
      record[key] = censor;
    } else {
      redactPath(record[key], segments, index + 1, censor);
    }
  }
}

function formatRecordLine(
  record: LogRecord,
  redaction: CompiledRedaction | undefined,
): string {
  try {
    const sanitized = sanitizeObject(record, new WeakSet<object>());

    if (redaction !== undefined) {
      applyRedaction(sanitized as Record<string, unknown>, redaction);
    }

    return `${JSON.stringify(sanitized)}\n`;
  } catch (cause) {
    throw new LogError("Failed to serialize log record", {
      code: "LOG_SERIALIZATION_FAILED",
      cause,
    });
  }
}

/** Returns the default ISO timestamp used by loggers. */
export function defaultTimestamp(): string {
  return new Date().toISOString();
}

class RootwareLogger implements Logger {
  readonly level: LogLevelName;
  readonly bindings: LogBindings;

  readonly #sink: LogSink;
  readonly #name?: string;
  readonly #base: LogBindings | null;
  readonly #timestamp: () => string;
  readonly #enabled: boolean;
  readonly #messageKey: string;
  readonly #errorKey: string;
  readonly #redactInput?: readonly string[] | RedactOptions;
  readonly #redaction?: CompiledRedaction;
  readonly #onWriteError?: LogWriteErrorHandler;

  constructor(options: LoggerOptions, sink: LogSink) {
    const level = options.level ?? "info";

    if (!isLogLevelName(level)) {
      throw new LogError("Invalid log level", {
        code: "LOG_INVALID_LEVEL",
        details: { level: typeof level },
      });
    }

    this.level = level;
    this.bindings = freezeLogObject(options.bindings ?? {});
    this.#sink = sink;
    this.#name = options.name;
    this.#base = options.base === null
      ? null
      : freezeLogObject(options.base ?? {});
    this.#timestamp = options.timestamp ?? defaultTimestamp;
    this.#enabled = options.enabled ?? true;
    this.#messageKey = options.messageKey ?? "msg";
    this.#errorKey = options.errorKey ?? "error";
    this.#redactInput = options.redact;
    this.#redaction = compileRedaction(options.redact);
    this.#onWriteError = options.onWriteError;
  }

  isLevelEnabled(level: LogLevel): boolean {
    return this.#enabled && shouldLog(this.level, level);
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

  child(bindings: LogBindings, options: ChildLoggerOptions = {}): Logger {
    const level = options.level ?? this.level;

    if (!isLogLevelName(level)) {
      throw new LogError("Invalid child logger level", {
        code: "LOG_INVALID_LEVEL",
        details: { level: typeof level },
      });
    }

    return new RootwareLogger(
      {
        level,
        name: options.name ?? this.#name,
        bindings: {
          ...this.bindings,
          ...toLogObject(bindings),
        },
        timestamp: this.#timestamp,
        base: this.#base,
        enabled: this.#enabled,
        messageKey: this.#messageKey,
        errorKey: this.#errorKey,
        redact: this.#redactInput,
        onWriteError: this.#onWriteError,
      },
      this.#sink,
    );
  }

  flush(): LogSinkResult {
    return callSink("flush", () => this.#sink.flush?.());
  }

  close(): LogSinkResult {
    return callSink("close", () => this.#sink.close?.());
  }

  #log(levelName: Exclude<LogLevelName, "silent">, args: unknown[]): void {
    if (!this.#enabled || !shouldLog(this.level, levelName)) {
      return;
    }

    const input = normalizeLogInput(args);
    const record: LogRecord = {
      ...(this.#base ?? {}),
      ...this.bindings,
      ...(input.object ?? {}),
      ...(this.#name !== undefined ? { name: this.#name } : {}),
      level: levels[levelName],
      levelName,
      time: this.#timestamp(),
      ...(input.message !== undefined
        ? { [this.#messageKey]: input.message }
        : {}),
      ...(input.error !== undefined ? { [this.#errorKey]: input.error } : {}),
    };

    const line = textEncoder.encode(formatRecordLine(record, this.#redaction));

    try {
      const result = this.#sink.write(line);

      if (isPromiseLike(result)) {
        result.catch((cause) => {
          this.#handleWriteError(cause, line, false);
        });
      }
    } catch (cause) {
      this.#handleWriteError(cause, line, true);
    }
  }

  #handleWriteError(cause: unknown, line: Uint8Array, sync: boolean): void {
    const error = cause instanceof LogError ? cause : new LogError(
      "Failed to write log record",
      { code: "LOG_WRITE_FAILED", cause },
    );

    if (this.#onWriteError !== undefined) {
      this.#onWriteError(error, textDecoder.decode(line));
      return;
    }

    // Synchronous failures still propagate to the caller; an async failure has
    // no caller to throw to, so without a handler it is swallowed rather than
    // surfacing as an unhandled promise rejection.
    if (sync) {
      throw error;
    }
  }
}

function denoStreamSink(kind: "stdout" | "stderr"): LogSink {
  return {
    write(line: Uint8Array): LogSinkResult {
      const writer = getDenoWriter(kind);

      try {
        if (writer.writeSync !== undefined) {
          writer.writeSync(line);
          return undefined;
        }

        if (writer.write !== undefined) {
          return writer.write(line).then(() => undefined);
        }
      } catch (cause) {
        throwWriteError(cause);
      }

      throw new LogError(`Deno.${kind} does not support writing`, {
        code: "LOG_WRITE_FAILED",
        details: { sink: kind },
      });
    },
  };
}

function noopSink(): LogSink {
  return {
    write(): void {
      // Intentionally empty.
    },

    flush(): void {
      // Intentionally empty.
    },

    close(): void {
      // Intentionally empty.
    },
  };
}

function getDenoWriter(kind: "stdout" | "stderr"): {
  readonly writeSync?: (line: Uint8Array) => number;
  readonly write?: (line: Uint8Array) => Promise<number>;
} {
  const deno = (globalThis as {
    readonly Deno?: {
      readonly stdout?: {
        writeSync?(line: Uint8Array): number;
        write?(line: Uint8Array): Promise<number>;
      };
      readonly stderr?: {
        writeSync?(line: Uint8Array): number;
        write?(line: Uint8Array): Promise<number>;
      };
    };
  }).Deno;

  const writer = deno?.[kind];

  if (writer === undefined) {
    throw new LogError(`Deno.${kind} is not available`, {
      code: "LOG_WRITE_FAILED",
      details: { sink: kind },
    });
  }

  return writer;
}

function callSink(
  operation: "flush" | "close",
  fn: (() => LogSinkResult) | undefined,
): LogSinkResult {
  if (fn === undefined) {
    return undefined;
  }

  try {
    const result = fn();

    if (isPromiseLike(result)) {
      return result.catch((cause) => {
        throw new LogError(`Failed to ${operation} log sink`, {
          code: "LOG_WRITE_FAILED",
          details: { operation },
          cause,
        });
      });
    }

    return result;
  } catch (cause) {
    throw new LogError(`Failed to ${operation} log sink`, {
      code: "LOG_WRITE_FAILED",
      details: { operation },
      cause,
    });
  }
}

function throwWriteError(cause: unknown): never {
  throw new LogError("Failed to write log record", {
    code: "LOG_WRITE_FAILED",
    cause,
  });
}

function serializeErrorValue(
  value: unknown,
  seen: WeakSet<object>,
): Record<string, unknown> {
  if (value instanceof Error) {
    if (seen.has(value)) {
      return {
        name: "Error",
        message: "Circular error cause",
      };
    }

    seen.add(value);

    const record: Record<string, unknown> = {
      name: value.name || "Error",
      message: value.message,
    };

    if (value.stack !== undefined) {
      record.stack = value.stack;
    }

    if (value instanceof RootwareError) {
      record.code = value.code;
      record.status = value.status;
      record.expose = value.expose;
      record.severity = value.severity;

      if (value.details !== undefined) {
        record.details = toLogObject(value.details);
      }
    }

    if (value.cause !== undefined) {
      record.cause = serializeErrorValue(value.cause, seen);
    }

    return record;
  }

  if (typeof value === "string") {
    return {
      name: "Error",
      message: value,
    };
  }

  return {
    name: "Error",
    message: "Unknown error",
  };
}

function toLogObject(value: object): LogObject {
  try {
    return sanitizeObject(value, new WeakSet<object>());
  } catch {
    return {};
  }
}

function sanitizeObject(
  value: object,
  seen: WeakSet<object>,
): LogObject {
  if (seen.has(value)) {
    return { circular: "[Circular]" };
  }

  seen.add(value);

  const output: Record<string, LogValue | undefined> = {};

  for (const [key, entry] of Object.entries(value)) {
    const sanitized = sanitizeLogValue(entry, seen);

    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  seen.delete(value);

  return output;
}

function sanitizeLogValue(
  value: unknown,
  seen: WeakSet<object>,
): LogValue | undefined {
  if (
    value === undefined || typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return undefined;
  }

  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return sanitizeObject(serializeErrorForLog(value), seen);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLogValue(entry, seen) ?? null);
  }

  if (typeof value === "object") {
    return sanitizeObject(value, seen);
  }

  return undefined;
}

function freezeLogObject(value: LogBindings): LogBindings {
  return Object.freeze(toLogObject(value));
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

function appendLines(buffer: string[], text: string): void {
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      buffer.push(text.slice(start, index + 1));
      start = index + 1;
    }
  }

  if (start < text.length) {
    buffer.push(text.slice(start));
  }
}

function concatChunks(
  chunks: readonly Uint8Array[],
  byteLength: number,
): Uint8Array {
  const output = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function isErrorLine(line: Uint8Array): boolean {
  try {
    const record = JSON.parse(textDecoder.decode(line)) as {
      readonly level?: unknown;
    };

    return typeof record.level === "number" && record.level >= levels.error;
  } catch {
    return false;
  }
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { readonly then?: unknown }).then === "function";
}

// Example: logger simples com stdout.
// const logger = createLogger({ level: "info", name: "api" }, stdoutSink());
// logger.info("server started");
// logger.info({ port: 8000 }, "listening");
// logger.error(new Error("boom"), "request failed");
//
// Example: logger com memorySink em teste.
// const sink = memorySink();
// const testLogger = createLogger({ level: "debug" }, unbufferedSink(sink));
// testLogger.info({ userId: "u_123" }, "user created");
// const records = sink.records();
//
// Example: logger com child logger.
// const child = logger.child({ requestId: "req_123" });
// child.info({ userId: "u_123" }, "user loaded");
//
// Example: logger com bufferedSink.
// const bufferedLogger = createLogger(
//   { level: "info", name: "worker" },
//   bufferedSink(stdoutSink(), { maxRecords: 100, flushIntervalMs: 1000 }),
// );
// bufferedLogger.info("queued");
// await bufferedLogger.close();
