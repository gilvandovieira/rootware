/**
 * Public entrypoint for @rootware/cache.
 *
 * TODO: Implement cache adapters, TTL behavior, namespaces, and serialization.
 */

export type CacheKey = string;

export interface CacheEntry<T = unknown> {
  readonly key: CacheKey;
  readonly value: T;
  readonly expiresAt?: Date;
}

export interface CacheSetOptions {
  readonly ttlMs?: number;
}

export interface CacheGetOptions {
  readonly namespace?: string;
}

export interface CacheStore {
  get<T = unknown>(key: CacheKey, options?: CacheGetOptions): Promise<T | null>;
  set<T = unknown>(
    key: CacheKey,
    value: T,
    options?: CacheSetOptions,
  ): Promise<void>;
  delete(key: CacheKey): Promise<boolean>;
  clear(): Promise<void>;
}

export interface CacheClientOptions {
  readonly namespace?: string;
  readonly defaultTtlMs?: number;
}

export class RootwareCache implements CacheStore {
  constructor(readonly options: CacheClientOptions = {}) {}

  get<T = unknown>(
    _key: CacheKey,
    _options?: CacheGetOptions,
  ): Promise<T | null> {
    throw new Error("Not implemented");
  }

  set<T = unknown>(
    _key: CacheKey,
    _value: T,
    _options?: CacheSetOptions,
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  delete(_key: CacheKey): Promise<boolean> {
    throw new Error("Not implemented");
  }

  clear(): Promise<void> {
    throw new Error("Not implemented");
  }
}

export function createCache(_options?: CacheClientOptions): CacheStore {
  throw new Error("Not implemented");
}
