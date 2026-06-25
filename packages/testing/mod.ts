/**
 * Public entrypoint for @rootware/testing.
 *
 * TODO: Implement test harness helpers, fixtures, assertions, and fake adapters.
 */

export interface TestContext {
  readonly name: string;
  readonly metadata?: Record<string, unknown>;
}

export interface TestFixture<T> {
  readonly name: string;
  setup(context: TestContext): T | Promise<T>;
  teardown?(value: T, context: TestContext): void | Promise<void>;
}

export interface TestHarnessOptions {
  readonly name?: string;
  readonly fixtures?: readonly TestFixture<unknown>[];
}

export interface TestHarness {
  readonly options: TestHarnessOptions;
  run<T>(
    name: string,
    fn: (context: TestContext) => T | Promise<T>,
  ): Promise<T>;
}

export interface AssertionOptions {
  readonly message?: string;
}

export function createTestHarness(
  _options?: TestHarnessOptions,
): TestHarness {
  throw new Error("Not implemented");
}

export function assertRootware(
  _condition: unknown,
  _options?: AssertionOptions,
): asserts _condition {
  throw new Error("Not implemented");
}

export function withFixture<T>(
  _fixture: TestFixture<T>,
  _fn: (value: T) => void | Promise<void>,
): Promise<void> {
  throw new Error("Not implemented");
}
