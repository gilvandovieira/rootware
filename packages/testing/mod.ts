import {
  isRootwareError,
  RootwareError,
  type RootwareErrorCode,
} from "@rootware/errors";
import {
  defineEnv,
  type EnvSchema,
  type EnvSource,
  type InferEnv,
} from "@rootware/env";
import {
  createLogger,
  type LogRecord,
  type MemoryLogSink,
  memorySink,
  unbufferedSink,
} from "@rootware/log";

export type TestErrorCode =
  | "TEST_ASSERTION_FAILED"
  | "TEST_EXPECTED_THROW"
  | "TEST_EXPECTED_REJECTION"
  | "TEST_FIXTURE_FAILED"
  | "TEST_UNKNOWN_ERROR"
  | (string & Record<never, never>);

/** Structured assertion failure details used by TestError. */
export interface AssertionFailure {
  message: string;
  actual?: unknown;
  expected?: unknown;
  operator?: string;
}

export interface AssertThrowsOptions {
  readonly message?: string;
  readonly errorClass?: abstract new (...args: never[]) => Error;
  readonly includes?: string;
  readonly code?: string;
}

export type AssertRejectsOptions = AssertThrowsOptions;

export interface AssertRootwareErrorOptions {
  readonly code?: RootwareErrorCode;
  readonly message?: string | RegExp;
  readonly cause?: boolean;
}

/** Small setup/teardown fixture abstraction for Deno tests. */
export interface TestFixture<T> {
  readonly name: string;
  setup(): T | Promise<T>;
  teardown?(value: T): void | Promise<void>;
}

export interface TestContextOptions {
  readonly name?: string;
  readonly env?: Record<string, string | undefined>;
  readonly clock?: FakeClock;
}

/** Reusable test context with fake clock, memory logs, and cleanup hooks. */
export interface TestContext {
  readonly name: string;
  readonly clock: FakeClock;
  readonly logs: MemoryLogSink;
  cleanup(fn: () => void | Promise<void>): void;
  runCleanup(): Promise<void>;
}

export interface FakeClockOptions {
  readonly now?: Date | string | number;
}

/** Fake clock that does not mutate global Date. */
export interface FakeClock {
  now(): Date;
  nowMs(): number;
  iso(): string;
  advance(ms: number): Date;
  set(value: Date | string | number): Date;
  reset(): Date;
}

/** Assertion helper for records captured by a memory log sink. */
export interface LogAssertion {
  hasMessage(message: string): void;
  hasLevel(level: string): void;
  hasField(key: string, value?: unknown): void;
  hasRecord(predicate: (record: LogRecord) => boolean, message?: string): void;
  count(): number;
  records(): LogRecord[];
}

export interface EnvTestOptions {
  readonly mode?: "development" | "test" | "production";
  readonly prefix?: string;
  readonly allowEmpty?: boolean;
}

export interface TestErrorOptions {
  readonly code?: TestErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Error thrown by Rootware testing helpers and assertions. */
export class TestError extends RootwareError {
  constructor(message: string, options: TestErrorOptions = {}) {
    super(message, {
      code: options.code ?? "TEST_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? true,
      severity: options.severity ?? "error",
      details: options.details,
      cause: options.cause,
    });
  }
}

/** Asserts that a value is truthy. */
export function assert(value: unknown, message?: string): asserts value {
  if (!value) {
    throwAssertionFailure({
      message: message ?? "Expected value to be truthy",
      actual: value,
      expected: true,
      operator: "assert",
    });
  }
}

/** Asserts structural equality for primitives, arrays, and JSON-like objects. */
export function assertEquals(
  actual: unknown,
  expected: unknown,
  message?: string,
): void {
  if (!isEqual(actual, expected)) {
    throwAssertionFailure({
      message: message ??
        `Expected values to be equal. Expected ${
          formatValue(expected)
        }, actual ${formatValue(actual)}`,
      actual,
      expected,
      operator: "assertEquals",
    });
  }
}

/** Asserts that two values are not structurally equal. */
export function assertNotEquals(
  actual: unknown,
  expected: unknown,
  message?: string,
): void {
  if (isEqual(actual, expected)) {
    throwAssertionFailure({
      message: message ??
        `Expected values to be different. Actual ${formatValue(actual)}`,
      actual,
      expected,
      operator: "assertNotEquals",
    });
  }
}

/** Asserts that a value is neither null nor undefined. */
export function assertExists<T>(
  value: T,
  message?: string,
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throwAssertionFailure({
      message: message ?? "Expected value to exist",
      actual: value,
      expected: "non-nullish value",
      operator: "assertExists",
    });
  }
}

/** Asserts that a thrown value is a RootwareError and optionally matches details. */
export function assertRootwareError(
  error: unknown,
  options: AssertRootwareErrorOptions = {},
): asserts error is RootwareError {
  if (!isRootwareError(error)) {
    throwAssertionFailure({
      message: "Expected a RootwareError",
      actual: getErrorName(error),
      expected: "RootwareError",
      operator: "assertRootwareError",
    });
  }

  if (options.code !== undefined) {
    assertErrorCode(error, options.code);
  }

  if (options.message !== undefined) {
    const matches = typeof options.message === "string"
      ? error.message.includes(options.message)
      : options.message.test(error.message);

    if (!matches) {
      throwAssertionFailure({
        message: "Expected RootwareError message to match",
        actual: error.message,
        expected: String(options.message),
        operator: "assertRootwareError",
      });
    }
  }

  if (options.cause === true && error.cause === undefined) {
    throwAssertionFailure({
      message: "Expected RootwareError cause to exist",
      actual: undefined,
      expected: "defined cause",
      operator: "assertRootwareError",
    });
  }
}

/** Asserts that a thrown value is a RootwareError with the expected code. */
export function assertErrorCode(
  error: unknown,
  code: RootwareErrorCode,
): asserts error is RootwareError {
  if (!isRootwareError(error)) {
    throwAssertionFailure({
      message: `Expected RootwareError code ${formatValue(code)}`,
      actual: getErrorName(error),
      expected: code,
      operator: "assertErrorCode",
    });
  }

  if (error.code !== code) {
    throwAssertionFailure({
      message: `Expected RootwareError code ${formatValue(code)}`,
      actual: error.code,
      expected: code,
      operator: "assertErrorCode",
    });
  }
}

/** Asserts that a sync or async callback throws/rejects with a RootwareError. */
export async function assertThrowsRootwareError(
  fn: () => unknown | Promise<unknown>,
  options: AssertRootwareErrorOptions = {},
): Promise<RootwareError> {
  try {
    await fn();
  } catch (error) {
    assertRootwareError(error, options);
    return error;
  }

  throw new TestError("Expected function to throw or reject", {
    code: "TEST_EXPECTED_THROW",
    details: { expected: "RootwareError throw or rejection" },
  });
}

/** Asserts that an async function rejects and optionally matches the error. */
export async function assertRejects(
  fn: () => Promise<unknown>,
  options: AssertRejectsOptions = {},
): Promise<unknown> {
  const error = await captureAsyncError(fn);

  if (error === undefined) {
    throw new TestError(options.message ?? "Expected function to reject", {
      code: "TEST_EXPECTED_REJECTION",
      details: { expected: "rejection" },
    });
  }

  validateThrownError(error, options, "assertRejects");
  return error;
}

/** Asserts that a synchronous function throws and optionally matches the error. */
export function assertThrows(
  fn: () => unknown,
  options: AssertThrowsOptions = {},
): unknown {
  const error = captureError(fn);

  if (error === undefined) {
    throw new TestError(options.message ?? "Expected function to throw", {
      code: "TEST_EXPECTED_THROW",
      details: { expected: "throw" },
    });
  }

  validateThrownError(error, options, "assertThrows");
  return error;
}

/** Fails a test immediately. */
export function fail(message = "Test failed"): never {
  throwAssertionFailure({
    message,
    operator: "fail",
  });
}

/** Creates a deterministic Rootware test context. */
export function createTestContext(
  options: TestContextOptions = {},
): TestContext {
  const cleanups: Array<() => void | Promise<void>> = [];
  const clock = options.clock ?? createFakeClock();
  const logs = memorySink();

  return {
    name: options.name ?? "test",
    clock,
    logs,

    cleanup(fn: () => void | Promise<void>): void {
      cleanups.push(fn);
    },

    async runCleanup(): Promise<void> {
      let firstError: unknown;

      for (let index = cleanups.length - 1; index >= 0; index -= 1) {
        try {
          await cleanups[index]();
        } catch (cause) {
          firstError ??= cause;
        }
      }

      cleanups.length = 0;

      if (firstError !== undefined) {
        throw new TestError("Test cleanup failed", {
          code: "TEST_FIXTURE_FAILED",
          details: { phase: "cleanup" },
          cause: firstError,
        });
      }
    },
  };
}

/** Creates a fake clock with explicit advancement and reset. */
export function createFakeClock(
  options: FakeClockOptions = {},
): FakeClock {
  const initial = toValidDate(options.now ?? new Date());
  let current = new Date(initial.getTime());

  return {
    now(): Date {
      return new Date(current.getTime());
    },

    nowMs(): number {
      return current.getTime();
    },

    iso(): string {
      return current.toISOString();
    },

    advance(ms: number): Date {
      if (!Number.isFinite(ms)) {
        throw new TestError("Fake clock advance requires a finite number", {
          code: "TEST_UNKNOWN_ERROR",
          details: { expected: "finite milliseconds" },
        });
      }

      current = new Date(current.getTime() + ms);
      return new Date(current.getTime());
    },

    set(value: Date | string | number): Date {
      current = toValidDate(value);
      return new Date(current.getTime());
    },

    reset(): Date {
      current = new Date(initial.getTime());
      return new Date(current.getTime());
    },
  };
}

/** Validates env schemas using an explicit test source and default test mode. */
export function testEnv<TSchema extends EnvSchema>(
  schema: TSchema,
  source: EnvSource = {},
  options: EnvTestOptions = {},
): InferEnv<TSchema> {
  return defineEnv(schema, {
    source,
    mode: options.mode ?? "test",
    prefix: options.prefix,
    allowEmpty: options.allowEmpty,
  });
}

/** Creates a debug logger backed by an in-memory sink. */
export function testLogger(): {
  sink: MemoryLogSink;
  logger: ReturnType<typeof createLogger>;
} {
  const sink = memorySink();
  const logger = createLogger(
    { level: "debug" },
    unbufferedSink(sink),
  );

  return { sink, logger };
}

/** Creates log assertions for a memory sink. */
export function assertLog(sink: MemoryLogSink): LogAssertion {
  const readRecords = (): LogRecord[] => sink.records<LogRecord>();
  const hasRecord = (
    predicate: (record: LogRecord) => boolean,
    message = "Expected matching log record",
  ): void => {
    const records = readRecords();

    for (const record of records) {
      if (predicate(record)) {
        return;
      }
    }

    throwAssertionFailure({
      message,
      actual: records,
      expected: "matching log record",
      operator: "assertLog",
    });
  };

  return {
    hasMessage(message: string): void {
      hasRecord(
        (record) => record.msg === message,
        `Expected a log record with message ${formatValue(message)}`,
      );
    },

    hasLevel(level: string): void {
      hasRecord(
        (record) => record.levelName === level,
        `Expected a log record with level ${formatValue(level)}`,
      );
    },

    hasField(key: string, value?: unknown): void {
      const expectsValue = arguments.length >= 2;

      hasRecord(
        (record) => {
          if (!Object.prototype.hasOwnProperty.call(record, key)) {
            return false;
          }

          return !expectsValue || isEqual(record[key], value);
        },
        expectsValue
          ? `Expected a log record with field ${key}=${formatValue(value)}`
          : `Expected a log record with field ${key}`,
      );
    },

    hasRecord(
      predicate: (record: LogRecord) => boolean,
      message = "Expected matching log record",
    ): void {
      hasRecord(predicate, message);
    },

    count(): number {
      return readRecords().length;
    },

    records(): LogRecord[] {
      return readRecords();
    },
  };
}

/** Creates a named fixture with optional teardown. */
export function createFixture<T>(
  name: string,
  setup: () => T | Promise<T>,
  teardown?: (value: T) => void | Promise<void>,
): TestFixture<T> {
  if (name.trim().length === 0) {
    throw new TestError("Fixture name is required", {
      code: "TEST_FIXTURE_FAILED",
      details: { expected: "non-empty fixture name" },
    });
  }

  return {
    name,
    setup,
    ...(teardown !== undefined ? { teardown } : {}),
  };
}

/** Runs a fixture around a test callback and always attempts teardown. */
export async function useFixture<T>(
  fixture: TestFixture<T>,
  fn: (value: T) => void | Promise<void>,
): Promise<void> {
  let value: T;

  try {
    value = await fixture.setup();
  } catch (cause) {
    throw new TestError(`Fixture setup failed: ${fixture.name}`, {
      code: "TEST_FIXTURE_FAILED",
      details: { fixture: fixture.name, phase: "setup" },
      cause,
    });
  }

  let testError: unknown;

  try {
    await fn(value);
  } catch (cause) {
    testError = cause;
  }

  try {
    await fixture.teardown?.(value);
  } catch (cause) {
    if (testError !== undefined) {
      throw testError;
    }

    throw new TestError(`Fixture teardown failed: ${fixture.name}`, {
      code: "TEST_FIXTURE_FAILED",
      details: { fixture: fixture.name, phase: "teardown" },
      cause,
    });
  }

  if (testError !== undefined) {
    throw testError;
  }
}

/** Captures a synchronous thrown value without failing the test. */
export function captureError(fn: () => unknown): unknown | undefined {
  try {
    fn();
    return undefined;
  } catch (cause) {
    return cause;
  }
}

/** Captures an async rejection without failing the test. */
export async function captureAsyncError(
  fn: () => Promise<unknown>,
): Promise<unknown | undefined> {
  try {
    await fn();
    return undefined;
  } catch (cause) {
    return cause;
  }
}

/** Waits for a number of milliseconds using setTimeout. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

/** Intentionally empty helper for callbacks and placeholders. */
export function noop(): void {
  // Intentionally empty.
}

function throwAssertionFailure(failure: AssertionFailure): never {
  throw new TestError(failure.message, {
    code: "TEST_ASSERTION_FAILED",
    details: {
      message: failure.message,
      actual: sanitizeForJson(failure.actual, new WeakSet<object>()),
      expected: sanitizeForJson(failure.expected, new WeakSet<object>()),
      operator: failure.operator,
    },
  });
}

function validateThrownError(
  error: unknown,
  options: AssertThrowsOptions,
  operator: string,
): void {
  if (
    options.errorClass !== undefined && !(error instanceof options.errorClass)
  ) {
    throwAssertionFailure({
      message: options.message ??
        `Expected thrown error to be instance of ${options.errorClass.name}`,
      actual: getErrorName(error),
      expected: options.errorClass.name,
      operator,
    });
  }

  if (
    options.includes !== undefined &&
    !getErrorMessage(error).includes(options.includes)
  ) {
    throwAssertionFailure({
      message: options.message ??
        `Expected thrown error message to include ${
          formatValue(options.includes)
        }`,
      actual: getErrorMessage(error),
      expected: options.includes,
      operator,
    });
  }

  if (options.code !== undefined && getErrorCode(error) !== options.code) {
    throwAssertionFailure({
      message: options.message ??
        `Expected thrown error code to be ${formatValue(options.code)}`,
      actual: getErrorCode(error),
      expected: options.code,
      operator,
    });
  }
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  return typeof error;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return formatValue(error);
}

function getErrorCode(error: unknown): unknown {
  if (error !== null && typeof error === "object" && "code" in error) {
    return (error as { readonly code?: unknown }).code;
  }

  return undefined;
}

function isEqual(actual: unknown, expected: unknown): boolean {
  return deepEqual(actual, expected, new WeakMap<object, WeakSet<object>>());
}

function deepEqual(
  actual: unknown,
  expected: unknown,
  seen: WeakMap<object, WeakSet<object>>,
): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }

  if (actual instanceof Date || expected instanceof Date) {
    return actual instanceof Date &&
      expected instanceof Date &&
      actual.getTime() === expected.getTime();
  }

  if (
    actual === null ||
    expected === null ||
    typeof actual !== "object" ||
    typeof expected !== "object"
  ) {
    return false;
  }

  const actualObject = actual as Record<string, unknown>;
  const expectedObject = expected as Record<string, unknown>;

  if (hasSeenPair(actualObject, expectedObject, seen)) {
    return true;
  }

  if (Array.isArray(actualObject) || Array.isArray(expectedObject)) {
    if (!Array.isArray(actualObject) || !Array.isArray(expectedObject)) {
      return false;
    }

    if (actualObject.length !== expectedObject.length) {
      return false;
    }

    for (let index = 0; index < actualObject.length; index += 1) {
      if (!deepEqual(actualObject[index], expectedObject[index], seen)) {
        return false;
      }
    }

    return true;
  }

  const actualKeys = Object.keys(actualObject).sort();
  const expectedKeys = Object.keys(expectedObject).sort();

  if (!deepEqual(actualKeys, expectedKeys, seen)) {
    return false;
  }

  for (const key of actualKeys) {
    if (!deepEqual(actualObject[key], expectedObject[key], seen)) {
      return false;
    }
  }

  return true;
}

function hasSeenPair(
  actual: object,
  expected: object,
  seen: WeakMap<object, WeakSet<object>>,
): boolean {
  const matches = seen.get(actual);

  if (matches?.has(expected)) {
    return true;
  }

  if (matches === undefined) {
    seen.set(actual, new WeakSet<object>([expected]));
  } else {
    matches.add(expected);
  }

  return false;
}

function toValidDate(value: Date | string | number): Date {
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TestError("Invalid fake clock date", {
      code: "TEST_UNKNOWN_ERROR",
      details: { expected: "valid date" },
    });
  }

  return date;
}

function formatValue(value: unknown): string {
  const formatted = JSON.stringify(
    sanitizeForJson(value, new WeakSet<object>()),
  );

  return formatted === undefined ? String(value) : formatted;
}

function sanitizeForJson(
  value: unknown,
  seen: WeakSet<object>,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value === undefined) {
    return "[undefined]";
  }

  if (typeof value === "symbol") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForJson(entry, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    const output: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      output[key] = sanitizeForJson(entry, seen);
    }

    seen.delete(value);
    return output;
  }

  return String(value);
}

// Example: teste com assertEquals.
// assertEquals({ ok: true, count: 2 }, { ok: true, count: 2 });
//
// Example: teste com testEnv.
// const values = testEnv({
//   PORT: env.integer().default(8000),
//   LOG_LEVEL: env.enum(["debug", "info"]).default("debug"),
// });
//
// Example: teste com testLogger e assertLog.
// const { logger, sink } = testLogger();
// logger.info({ userId: "u_123" }, "user created");
// assertLog(sink).hasMessage("user created");
// assertLog(sink).hasField("userId", "u_123");
//
// Example: teste com FakeClock.
// const clock = createFakeClock({ now: "2026-01-01T00:00:00.000Z" });
// clock.advance(1000);
// assertEquals(clock.iso(), "2026-01-01T00:00:01.000Z");
//
// Example: teste com fixture.
// const fixture = createFixture("resource", () => ({ id: "r_123" }));
// await useFixture(fixture, async (resource) => {
//   assertEquals(resource.id, "r_123");
// });
