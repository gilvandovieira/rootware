/**
 * Public entrypoint for @rootware/log.
 *
 * TODO: Implement structured logging sinks, formatters, and context propagation.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields?: LogFields;
  readonly error?: unknown;
  readonly timestamp?: Date;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly fields?: LogFields;
}

export interface LogSink {
  write(record: LogRecord): void | Promise<void>;
}

export class RootwareLogger implements Logger {
  constructor(readonly options: LoggerOptions = {}) {}

  debug(_message: string, _fields?: LogFields): void {
    throw new Error("Not implemented");
  }

  info(_message: string, _fields?: LogFields): void {
    throw new Error("Not implemented");
  }

  warn(_message: string, _fields?: LogFields): void {
    throw new Error("Not implemented");
  }

  error(_message: string, _fields?: LogFields): void {
    throw new Error("Not implemented");
  }

  child(_fields: LogFields): Logger {
    throw new Error("Not implemented");
  }
}

export function createLogger(_options?: LoggerOptions): Logger {
  throw new Error("Not implemented");
}
