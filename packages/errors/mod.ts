/**
 * Public entrypoint for @rootware/errors.
 *
 * This package defines the base error contract shared by Rootware packages.
 */

const DEFAULT_ERROR_CODE: RootwareErrorCode = "ROOTWARE_UNKNOWN_ERROR";
const DEFAULT_ERROR_MESSAGE = "An unexpected error occurred";
const DEFAULT_ERROR_STATUS = 500;
const DEFAULT_ERROR_SEVERITY: ErrorSeverity = "error";

export type ErrorSeverity = "debug" | "info" | "warn" | "error" | "fatal";

export type RootwareErrorCode =
  | "ROOTWARE_UNKNOWN_ERROR"
  | "ROOTWARE_INVALID_ARGUMENT"
  | "ROOTWARE_NOT_IMPLEMENTED"
  | "ROOTWARE_INTERNAL_ERROR"
  | "ROOTWARE_CONFIGURATION_ERROR"
  | "ROOTWARE_VALIDATION_ERROR"
  | "ROOTWARE_NOT_FOUND"
  | "ROOTWARE_CONFLICT"
  | "ROOTWARE_UNAUTHORIZED"
  | "ROOTWARE_FORBIDDEN"
  | "ROOTWARE_TIMEOUT"
  | "ROOTWARE_ABORTED"
  | "ROOTWARE_EXTERNAL_SERVICE_ERROR"
  | (string & {});

export interface RootwareErrorOptions {
  readonly name?: string;
  readonly code?: RootwareErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: ErrorSeverity;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

export interface RootwareErrorJson {
  readonly name: string;
  readonly code: RootwareErrorCode;
  readonly message: string;
  readonly status: number;
  readonly expose: boolean;
  readonly severity: ErrorSeverity;
  readonly details?: Record<string, unknown>;
  readonly cause?: RootwareErrorJson;
}

export type RootwareErrorFactory = (
  message?: string,
  options?: RootwareErrorOptions,
) => RootwareError;

export class RootwareError extends Error {
  override name: string;
  override cause: unknown;
  readonly code: RootwareErrorCode;
  readonly status: number;
  readonly expose: boolean;
  readonly severity: ErrorSeverity;
  readonly details?: Record<string, unknown>;

  constructor(
    message = DEFAULT_ERROR_MESSAGE,
    options: RootwareErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = options.name ?? new.target.name;
    this.code = options.code ?? DEFAULT_ERROR_CODE;
    this.status = options.status ?? DEFAULT_ERROR_STATUS;
    this.expose = options.expose ?? false;
    this.severity = options.severity ?? DEFAULT_ERROR_SEVERITY;
    this.details = options.details;
    this.cause = options.cause;
  }

  toJSON(): RootwareErrorJson {
    return serializeRootwareError(this, new Set<unknown>());
  }

  withDetails(details: Record<string, unknown>): RootwareError {
    return this.copyWith({ details });
  }

  withCause(cause: unknown): RootwareError {
    return this.copyWith({ cause });
  }

  withMessage(message: string): RootwareError {
    return this.copyWith({}, message);
  }

  is(code: RootwareErrorCode): boolean {
    return this.code === code;
  }

  static from(
    value: unknown,
    fallbackOptions: RootwareErrorOptions = {},
  ): RootwareError {
    return toRootwareError(value, fallbackOptions);
  }

  private copyWith(
    options: RootwareErrorOptions,
    message = this.message,
  ): RootwareError {
    const error = new RootwareError(message, {
      name: this.name,
      code: this.code,
      status: this.status,
      expose: this.expose,
      severity: this.severity,
      details: this.details,
      cause: this.cause,
      ...options,
    });

    if (this.stack !== undefined) {
      error.stack = this.stack;
    }

    return error;
  }
}

export function isRootwareError(value: unknown): value is RootwareError {
  return value instanceof RootwareError;
}

export function toRootwareError(
  value: unknown,
  fallbackOptions: RootwareErrorOptions = {},
): RootwareError {
  if (isRootwareError(value)) {
    return value;
  }

  if (value instanceof Error) {
    const error = new RootwareError(getErrorMessage(value), {
      ...fallbackOptions,
      name: fallbackOptions.name ?? value.name,
      cause: getErrorCause(value) ?? fallbackOptions.cause,
    });

    if (value.stack !== undefined) {
      error.stack = value.stack;
    }

    return error;
  }

  if (typeof value === "string") {
    return new RootwareError(normalizeMessage(value), fallbackOptions);
  }

  return new RootwareError(DEFAULT_ERROR_MESSAGE, {
    ...fallbackOptions,
    cause: fallbackOptions.cause ?? value,
  });
}

export function getErrorMessage(value: unknown): string {
  if (isRootwareError(value)) {
    return value.message;
  }

  if (value instanceof Error) {
    return normalizeMessage(value.message);
  }

  if (typeof value === "string") {
    return normalizeMessage(value);
  }

  return DEFAULT_ERROR_MESSAGE;
}

export function getErrorCause(value: unknown): unknown {
  if (value instanceof Error) {
    return value.cause;
  }

  return undefined;
}

export function serializeError(value: unknown): RootwareErrorJson {
  return serializeRootwareError(toRootwareError(value), new Set<unknown>());
}

export function defineErrorCode(code: string): RootwareErrorCode {
  return code as RootwareErrorCode;
}

export function createErrorFactory(
  defaults: RootwareErrorOptions,
): RootwareErrorFactory {
  return (
    message = DEFAULT_ERROR_MESSAGE,
    options: RootwareErrorOptions = {},
  ): RootwareError => {
    return new RootwareError(message, {
      ...defaults,
      ...options,
    });
  };
}

function normalizeMessage(message: string): string {
  return message.trim().length > 0 ? message : DEFAULT_ERROR_MESSAGE;
}

function serializeRootwareError(
  error: RootwareError,
  seen: Set<unknown>,
): RootwareErrorJson {
  if (seen.has(error)) {
    return {
      name: "RootwareError",
      code: "ROOTWARE_INTERNAL_ERROR",
      message: DEFAULT_ERROR_MESSAGE,
      status: DEFAULT_ERROR_STATUS,
      expose: false,
      severity: DEFAULT_ERROR_SEVERITY,
    };
  }

  seen.add(error);

  const cause = error.expose
    ? serializeErrorCause(error.cause, seen)
    : undefined;

  return {
    name: error.name,
    code: error.code,
    message: error.expose ? error.message : DEFAULT_ERROR_MESSAGE,
    status: error.status,
    expose: error.expose,
    severity: error.severity,
    ...(error.expose && error.details !== undefined
      ? { details: error.details }
      : {}),
    ...(cause !== undefined ? { cause } : {}),
  };
}

function serializeErrorCause(
  cause: unknown,
  seen: Set<unknown>,
): RootwareErrorJson | undefined {
  if (cause === undefined) {
    return undefined;
  }

  if (isRootwareError(cause)) {
    return serializeRootwareError(cause, seen);
  }

  if (cause instanceof Error || typeof cause === "string") {
    return serializeRootwareError(toRootwareError(cause), seen);
  }

  return undefined;
}

// Example:
// const configurationError = createErrorFactory({
//   code: "ROOTWARE_CONFIGURATION_ERROR",
//   status: 500,
//   expose: false,
//   severity: "fatal",
// });
//
// throw configurationError("Missing DATABASE_URL", {
//   details: { variable: "DATABASE_URL" },
// });
//
// const error = RootwareError.from("Invalid request", {
//   code: "ROOTWARE_INVALID_ARGUMENT",
//   status: 400,
//   expose: true,
//   severity: "warn",
// });
//
// const safeJson = serializeError(error);
