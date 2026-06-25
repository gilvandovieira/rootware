/**
 * Public entrypoint for @rootware/env.
 *
 * TODO: Implement typed environment loading, parsing, validation, and defaults.
 */

export type EnvSource = Record<string, string | undefined>;

export type EnvParser<T> = (
  value: string | undefined,
  key: string,
) => T;

export interface EnvVariable<T> {
  readonly key: string;
  readonly required?: boolean;
  readonly default?: T;
  readonly parse?: EnvParser<T>;
  readonly description?: string;
}

export type EnvSchema<T extends Record<string, unknown>> = {
  readonly [K in keyof T]: EnvVariable<T[K]>;
};

export interface EnvLoadOptions {
  readonly source?: EnvSource;
  readonly prefix?: string;
}

export interface EnvSnapshot<T extends Record<string, unknown>> {
  readonly values: T;
  get<K extends keyof T>(key: K): T[K];
}

export class RootwareEnv<T extends Record<string, unknown>>
  implements EnvSnapshot<T> {
  constructor(readonly values: T) {}

  get<K extends keyof T>(_key: K): T[K] {
    throw new Error("Not implemented");
  }
}

export function loadEnv<T extends Record<string, unknown>>(
  _schema: EnvSchema<T>,
  _options?: EnvLoadOptions,
): EnvSnapshot<T> {
  throw new Error("Not implemented");
}

export function defineEnv<T extends Record<string, unknown>>(
  _schema: EnvSchema<T>,
): EnvSchema<T> {
  throw new Error("Not implemented");
}
