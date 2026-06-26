/**
 * Public entrypoint for @rootware/errors.
 *
 * This package defines the base error contract shared by Rootware packages.
 */

const DEFAULT_ERROR_CODE: RootwareErrorCode = "ROOTWARE_UNKNOWN_ERROR";
const DEFAULT_ERROR_MESSAGE = "An unexpected error occurred";
const DEFAULT_ERROR_STATUS = 500;
const DEFAULT_ERROR_SEVERITY: ErrorSeverity = "error";

/**
 * Depth at which cause-chain walking and serialization stop recursing.
 *
 * The serializer is also cycle-guarded; this bound additionally protects
 * against very long (acyclic) cause chains becoming pathological payloads.
 */
const DEFAULT_MAX_CAUSE_DEPTH = 16;

/** Default mask substituted for redacted values. */
const DEFAULT_REDACTION_MASK = "[redacted]";

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
  | (string & Record<never, never>);

/** Options accepted when constructing or converting a Rootware error. */
export interface RootwareErrorOptions {
  readonly name?: string;
  readonly code?: RootwareErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: ErrorSeverity;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** JSON-safe representation emitted by {@link RootwareError.toJSON}. */
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

/** Base error type shared by Rootware packages. */
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

  /** Returns a JSON-safe error payload that respects the `expose` flag. */
  toJSON(): RootwareErrorJson {
    return serializeRootwareError(this, new Set<unknown>(), 0, {
      maxDepth: DEFAULT_MAX_CAUSE_DEPTH,
    });
  }

  /** Returns a copy of this error with new structured details. */
  withDetails(details: Record<string, unknown>): RootwareError {
    return this.copyWith({ details });
  }

  /** Returns a copy of this error with a new cause. */
  withCause(cause: unknown): RootwareError {
    return this.copyWith({ cause });
  }

  /** Returns a copy of this error with a different message. */
  withMessage(message: string): RootwareError {
    return this.copyWith({}, message);
  }

  /** Checks whether this error has a specific Rootware error code. */
  is(code: RootwareErrorCode): boolean {
    return this.code === code;
  }

  /** Converts an unknown value into a RootwareError. */
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

/** Returns true only for RootwareError instances. */
export function isRootwareError(value: unknown): value is RootwareError {
  return value instanceof RootwareError;
}

/** Converts native errors, strings, and unknown values into RootwareError. */
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

/** Extracts a safe message from an unknown error-like value. */
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

/** Extracts the cause from a native Error when available. */
export function getErrorCause(value: unknown): unknown {
  if (value instanceof Error) {
    return value.cause;
  }

  return undefined;
}

/** Options accepted by {@link serializeError}. */
export interface SerializeErrorOptions {
  /**
   * Extra redactor applied to each exposed error's `details`, after any
   * {@link registerErrorRedactor globally registered redactors}.
   */
  readonly redact?: ErrorRedactor;
  /**
   * Maximum cause-chain depth to serialize. Beyond it, the remaining cause is
   * replaced with a generic truncation marker. Defaults to `16`.
   */
  readonly maxDepth?: number;
}

/** Serializes any thrown value into a JSON-safe Rootware error payload. */
export function serializeError(
  value: unknown,
  options: SerializeErrorOptions = {},
): RootwareErrorJson {
  return serializeRootwareError(toRootwareError(value), new Set<unknown>(), 0, {
    redact: options.redact,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_CAUSE_DEPTH,
  });
}

/** Options accepted by {@link getErrorChain}. */
export interface ErrorChainOptions {
  /** Maximum number of links to return. Defaults to `16`. */
  readonly maxDepth?: number;
}

/**
 * Walks a value's `cause` chain, converting each link to a {@link RootwareError}.
 *
 * The first element is `value` itself (converted via {@link toRootwareError});
 * each subsequent element is the previous link's `cause`. The walk is
 * cycle-safe and depth-limited, so a self-referential or very deep chain still
 * terminates. Returns an empty array only for `null`/`undefined` input.
 */
export function getErrorChain(
  value: unknown,
  options: ErrorChainOptions = {},
): RootwareError[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_CAUSE_DEPTH;
  const chain: RootwareError[] = [];
  const seen = new Set<unknown>();

  let current: unknown = value;
  while (
    current !== undefined && current !== null && chain.length < maxDepth &&
    !seen.has(current)
  ) {
    seen.add(current);
    const error = toRootwareError(current);
    chain.push(error);
    current = error.cause;
  }

  return chain;
}

/** Defines an application-specific error code while preserving string literals. */
export function defineErrorCode(code: string): RootwareErrorCode {
  return code as RootwareErrorCode;
}

/** Creates a small factory for specialized Rootware errors. */
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

/** Context passed to an {@link ErrorRedactor} for each serialized error. */
export interface ErrorRedactionContext {
  readonly code: RootwareErrorCode;
  readonly expose: boolean;
}

/**
 * Transforms an error's structured `details` before they are serialized.
 *
 * Redactors run on every serialization path ({@link RootwareError.toJSON} and
 * {@link serializeError}) and act as a centralized safety net for secrets that
 * may have been attached to `details`. A redactor must return a value without
 * mutating its input; it only affects serialized output, never the live
 * `error.details` property. If a redactor throws, the affected `details` are
 * dropped from the payload rather than risking leaking unredacted values.
 */
export type ErrorRedactor = (
  details: Readonly<Record<string, unknown>>,
  context: ErrorRedactionContext,
) => Record<string, unknown>;

const redactors = new Set<ErrorRedactor>();

/**
 * Registers a global {@link ErrorRedactor}. Returns a function that
 * unregisters it again — use it to scope redaction to a test or request.
 */
export function registerErrorRedactor(redactor: ErrorRedactor): () => void {
  redactors.add(redactor);
  return () => {
    redactors.delete(redactor);
  };
}

/** Removes every globally registered redactor. */
export function clearErrorRedactors(): void {
  redactors.clear();
}

/**
 * Builds a redactor that replaces the given top-level `details` keys with a
 * mask. Keys are matched case-insensitively; nested objects are not traversed.
 */
export function redactErrorKeys(
  keys: Iterable<string>,
  mask: string = DEFAULT_REDACTION_MASK,
): ErrorRedactor {
  const masked = new Set<string>();
  for (const key of keys) {
    masked.add(key.toLowerCase());
  }

  return (details) => {
    let copy: Record<string, unknown> | undefined;
    for (const key of Object.keys(details)) {
      if (masked.has(key.toLowerCase())) {
        copy ??= { ...details };
        copy[key] = mask;
      }
    }
    return copy ?? details;
  };
}

function applyRedactors(
  details: Record<string, unknown>,
  context: ErrorRedactionContext,
  extra?: ErrorRedactor,
): Record<string, unknown> | undefined {
  try {
    let current: Record<string, unknown> = details;
    for (const redactor of redactors) {
      current = redactor(current, context);
    }
    if (extra) {
      current = extra(current, context);
    }
    return current;
  } catch {
    // A buggy redactor must never cause unredacted details to leak.
    return undefined;
  }
}

function normalizeMessage(message: string): string {
  return message.trim().length > 0 ? message : DEFAULT_ERROR_MESSAGE;
}

interface SerializeContext {
  readonly redact?: ErrorRedactor;
  readonly maxDepth: number;
}

function truncatedErrorJson(): RootwareErrorJson {
  return {
    name: "RootwareError",
    code: "ROOTWARE_INTERNAL_ERROR",
    message: DEFAULT_ERROR_MESSAGE,
    status: DEFAULT_ERROR_STATUS,
    expose: false,
    severity: DEFAULT_ERROR_SEVERITY,
  };
}

function serializeRootwareError(
  error: RootwareError,
  seen: Set<unknown>,
  depth: number,
  context: SerializeContext,
): RootwareErrorJson {
  if (seen.has(error) || depth > context.maxDepth) {
    return truncatedErrorJson();
  }

  seen.add(error);

  const cause = error.expose
    ? serializeErrorCause(error.cause, seen, depth + 1, context)
    : undefined;

  const details = error.expose && error.details !== undefined
    ? applyRedactors(
      error.details,
      { code: error.code, expose: error.expose },
      context.redact,
    )
    : undefined;

  return {
    name: error.name,
    code: error.code,
    message: error.expose ? error.message : DEFAULT_ERROR_MESSAGE,
    status: error.status,
    expose: error.expose,
    severity: error.severity,
    ...(details !== undefined ? { details } : {}),
    ...(cause !== undefined ? { cause } : {}),
  };
}

function serializeErrorCause(
  cause: unknown,
  seen: Set<unknown>,
  depth: number,
  context: SerializeContext,
): RootwareErrorJson | undefined {
  if (cause === undefined) {
    return undefined;
  }

  if (depth > context.maxDepth) {
    return truncatedErrorJson();
  }

  if (isRootwareError(cause)) {
    return serializeRootwareError(cause, seen, depth, context);
  }

  if (cause instanceof Error || typeof cause === "string") {
    return serializeRootwareError(toRootwareError(cause), seen, depth, context);
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
