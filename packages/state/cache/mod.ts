import { RootwareError } from "@rootware/errors";
import type { Logger } from "@rootware/log";

export type CacheErrorCode =
  | "CACHE_INVALID_KEY"
  | "CACHE_GET_FAILED"
  | "CACHE_SET_FAILED"
  | "CACHE_DELETE_FAILED"
  | "CACHE_CLEAR_FAILED"
  | "CACHE_GET_OR_SET_FAILED"
  | "CACHE_SERIALIZATION_FAILED"
  | "CACHE_UNKNOWN_ERROR"
  | (string & Record<never, never>);

export type CacheKey = string;

export type CacheValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[]
  | unknown;

/** Stored cache entry with value metadata and optional TTL. */
export interface CacheEntry<T = unknown> {
  value: T;
  createdAt: number;
  expiresAt?: number;
  ttlMs?: number;
}

export interface CacheSetOptions {
  readonly ttlMs?: number;
}

export interface CacheGetOptions {
  readonly allowExpired?: boolean;
}

export interface CacheDeleteOptions {
  readonly silent?: boolean;
}

export interface GetOrSetOptions extends CacheSetOptions {
  readonly forceRefresh?: boolean;
  /**
   * For stores that implement {@link CacheStore.acquireLock}, bounds how long to
   * wait for a cross-process lock before computing without it. Single-process
   * stores (e.g. the in-memory store) ignore this and dedup in-process instead.
   */
  readonly lockTimeoutMs?: number;
}

/**
 * Wire-format serializer contract for cache adapters.
 *
 * The in-memory store keeps raw values, so it never needs a serializer.
 * Out-of-process adapters (Redis, KV, etc.) use one to convert values to and
 * from their transport representation (`TWire`, usually a string).
 */
export interface CacheSerializer<TWire = string> {
  serialize(value: unknown): TWire;
  deserialize<T = unknown>(wire: TWire): T;
}

/**
 * Handle for a held distributed lock, returned by
 * {@link CacheStore.acquireLock}. Releasing it is idempotent and must not throw.
 */
export interface CacheLock {
  release(): Promise<void>;
}

/** Options for acquiring a distributed lock. */
export interface CacheLockOptions {
  /** Maximum time to wait to acquire the lock before giving up. */
  readonly lockTimeoutMs?: number;
}

/** Async-first adapter interface for cache backends. */
export interface CacheStore {
  get<T = unknown>(
    key: CacheKey,
    options?: CacheGetOptions,
  ): Promise<CacheEntry<T> | undefined>;

  set<T = unknown>(
    key: CacheKey,
    entry: CacheEntry<T>,
    options?: CacheSetOptions,
  ): Promise<void>;

  delete(
    key: CacheKey,
    options?: CacheDeleteOptions,
  ): Promise<boolean>;

  has(
    key: CacheKey,
  ): Promise<boolean>;

  clear(): Promise<void>;

  keys?(): Promise<CacheKey[]>;

  /**
   * Optionally acquires a cross-process lock for stampede protection in
   * {@link CacheClient.getOrSet}. Stores that cannot lock (e.g. the in-memory
   * store) omit this; `getOrSet` then falls back to in-process dedup. Returns
   * `undefined` when the lock could not be taken within `lockTimeoutMs`.
   */
  acquireLock?(
    key: CacheKey,
    options?: CacheLockOptions,
  ): Promise<CacheLock | undefined>;

  close?(): Promise<void>;
}

/**
 * Minimal Redis-like client surface a Redis-backed {@link CacheStore} adapter
 * wraps. An adapter stores each entry as a serialized string with a per-key
 * `PX` expiry derived from `CacheEntry.ttlMs`, and uses `SCAN` for `keys`/
 * `clear` under its `keyPrefix`.
 */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { readonly pxMs?: number },
  ): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  scan?(
    cursor: string,
    options?: { readonly match?: string; readonly count?: number },
  ): Promise<readonly [string, string[]]>;
}

/** Contract for constructing a Redis-backed cache store. */
export interface RedisCacheAdapterOptions {
  readonly client: RedisLikeClient;
  /** Defaults to {@link jsonCacheSerializer}. */
  readonly serializer?: CacheSerializer<string>;
  /** Namespaces every key on the wire (e.g. `"cache:"`). */
  readonly keyPrefix?: string;
}

/**
 * Minimal `Deno.Kv`-like surface a KV-backed {@link CacheStore} adapter wraps.
 * The adapter maps a cache key to a KV key tuple and uses `expireIn` (ms) for
 * TTL, listing under a `keyPrefix` tuple for `keys`/`clear`.
 */
export interface DenoKvLike {
  get(key: readonly unknown[]): Promise<{ readonly value: unknown }>;
  set(
    key: readonly unknown[],
    value: unknown,
    options?: { readonly expireIn?: number },
  ): Promise<unknown>;
  delete(key: readonly unknown[]): Promise<unknown>;
  list(
    selector: { readonly prefix: readonly unknown[] },
  ): AsyncIterable<{ readonly key: readonly unknown[] }>;
}

/** Contract for constructing a `Deno.Kv`-backed cache store. */
export interface DenoKvCacheAdapterOptions {
  readonly kv: DenoKvLike;
  /** Key-tuple prefix for every entry (e.g. `["cache"]`). */
  readonly keyPrefix?: readonly unknown[];
}

/** User-facing cache client that exposes values instead of raw entries. */
export interface CacheClient {
  get<T = unknown>(
    key: CacheKey,
    options?: CacheGetOptions,
  ): Promise<T | undefined>;

  set<T = unknown>(
    key: CacheKey,
    value: T,
    options?: CacheSetOptions,
  ): Promise<void>;

  delete(
    key: CacheKey,
    options?: CacheDeleteOptions,
  ): Promise<boolean>;

  has(
    key: CacheKey,
  ): Promise<boolean>;

  clear(): Promise<void>;

  getOrSet<T = unknown>(
    key: CacheKey,
    factory: () => T | Promise<T>,
    options?: GetOrSetOptions,
  ): Promise<T>;

  namespace(namespace: string): CacheClient;

  close(): Promise<void>;
}

/** Options for creating a cache client. */
export interface CacheOptions {
  readonly store?: CacheStore;
  readonly namespace?: string;
  readonly defaultTtlMs?: number;
  readonly logger?: Logger;
}

/** Options for the in-memory cache store. */
export interface MemoryCacheStoreOptions {
  readonly maxEntries?: number;
  readonly cloneValues?: boolean;
}

export interface CacheErrorOptions {
  readonly code?: CacheErrorCode;
  readonly status?: number;
  readonly expose?: boolean;
  readonly severity?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Error thrown for invalid keys and cache operation failures. */
export class CacheError extends RootwareError {
  constructor(message: string, options: CacheErrorOptions = {}) {
    super(message, {
      code: options.code ?? "CACHE_UNKNOWN_ERROR",
      status: options.status ?? 500,
      expose: options.expose ?? false,
      severity: options.severity ?? "error",
      details: options.details,
      cause: options.cause,
    });
  }
}

/** Creates a cache client backed by a store, defaulting to in-memory storage. */
export function createCache(options: CacheOptions = {}): CacheClient {
  const store = options.store ?? memoryCacheStore();
  const namespace = options.namespace === undefined
    ? undefined
    : normalizeCacheKey(options.namespace);
  const defaultTtlMs = resolveTtlMs(undefined, options.defaultTtlMs);
  const logger = options.logger;

  return new RootwareCacheClient({
    store,
    namespace,
    defaultTtlMs,
    logger,
  });
}

/** Creates an in-memory CacheStore with TTL and optional value cloning. */
export function memoryCacheStore(
  options: MemoryCacheStoreOptions = {},
): CacheStore {
  const entries = new Map<CacheKey, CacheEntry<unknown>>();
  const maxEntries = options.maxEntries;
  const cloneValues = options.cloneValues ?? false;

  if (
    maxEntries !== undefined &&
    (!Number.isFinite(maxEntries) || maxEntries <= 0)
  ) {
    throw new CacheError("Memory cache maxEntries must be greater than zero", {
      code: "CACHE_UNKNOWN_ERROR",
      details: { option: "maxEntries" },
    });
  }

  return {
    get<T = unknown>(
      key: CacheKey,
      options: CacheGetOptions = {},
    ): Promise<CacheEntry<T> | undefined> {
      const normalizedKey = normalizeCacheKey(key);
      const entry = entries.get(normalizedKey) as CacheEntry<T> | undefined;

      if (entry === undefined) {
        return Promise.resolve(undefined);
      }

      if (!options.allowExpired && isExpired(entry)) {
        entries.delete(normalizedKey);
        return Promise.resolve(undefined);
      }

      return Promise.resolve(
        cloneValues ? cloneEntryValue(entry) : cloneCacheEntry(entry),
      );
    },

    set<T = unknown>(
      key: CacheKey,
      entry: CacheEntry<T>,
    ): Promise<void> {
      const normalizedKey = normalizeCacheKey(key);
      entries.set(
        normalizedKey,
        cloneValues ? cloneEntryValue(entry) : cloneCacheEntry(entry),
      );
      evictOldestEntries(entries, maxEntries);
      return Promise.resolve();
    },

    delete(
      key: CacheKey,
      _options: CacheDeleteOptions = {},
    ): Promise<boolean> {
      return Promise.resolve(entries.delete(normalizeCacheKey(key)));
    },

    has(key: CacheKey): Promise<boolean> {
      const normalizedKey = normalizeCacheKey(key);
      const entry = entries.get(normalizedKey);

      if (entry === undefined) {
        return Promise.resolve(false);
      }

      if (isExpired(entry)) {
        entries.delete(normalizedKey);
        return Promise.resolve(false);
      }

      return Promise.resolve(true);
    },

    clear(): Promise<void> {
      entries.clear();
      return Promise.resolve();
    },

    keys(): Promise<CacheKey[]> {
      const keys: CacheKey[] = [];

      for (const [key, entry] of entries) {
        if (isExpired(entry)) {
          entries.delete(key);
          continue;
        }

        keys.push(key);
      }

      return Promise.resolve(keys);
    },

    close(): Promise<void> {
      entries.clear();
      return Promise.resolve();
    },
  };
}

/** Creates a client wrapper that prefixes all keys with a namespace. */
export function createNamespacedCache(
  cache: CacheClient,
  namespace: string,
): CacheClient {
  const normalizedNamespace = normalizeCacheKey(namespace);

  return {
    get<T = unknown>(
      key: CacheKey,
      options?: CacheGetOptions,
    ): Promise<T | undefined> {
      return cache.get<T>(joinCacheKey([normalizedNamespace, key]), options);
    },

    set<T = unknown>(
      key: CacheKey,
      value: T,
      options?: CacheSetOptions,
    ): Promise<void> {
      return cache.set<T>(
        joinCacheKey([normalizedNamespace, key]),
        value,
        options,
      );
    },

    delete(
      key: CacheKey,
      options?: CacheDeleteOptions,
    ): Promise<boolean> {
      return cache.delete(joinCacheKey([normalizedNamespace, key]), options);
    },

    has(key: CacheKey): Promise<boolean> {
      return cache.has(joinCacheKey([normalizedNamespace, key]));
    },

    clear(): Promise<void> {
      return cache.clear();
    },

    getOrSet<T = unknown>(
      key: CacheKey,
      factory: () => T | Promise<T>,
      options?: GetOrSetOptions,
    ): Promise<T> {
      return cache.getOrSet<T>(
        joinCacheKey([normalizedNamespace, key]),
        factory,
        options,
      );
    },

    namespace(childNamespace: string): CacheClient {
      return createNamespacedCache(
        cache,
        joinCacheKey([normalizedNamespace, childNamespace]),
      );
    },

    close(): Promise<void> {
      return cache.close();
    },
  };
}

/** Trims and validates a cache key. */
export function normalizeCacheKey(key: CacheKey): CacheKey {
  if (typeof key !== "string") {
    throwInvalidKey("Cache key must be a string");
  }

  const normalizedKey = key.trim();

  if (normalizedKey.length === 0) {
    throwInvalidKey("Cache key cannot be empty");
  }

  if (hasControlCharacter(normalizedKey)) {
    throwInvalidKey("Cache key cannot contain control characters");
  }

  return normalizedKey;
}

/** Joins key parts with `:` after validation, skipping empty parts. */
export function joinCacheKey(
  parts: Array<string | null | undefined>,
): CacheKey {
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (part === null || part === undefined || part.trim().length === 0) {
      continue;
    }

    normalizedParts.push(normalizeCacheKey(part));
  }

  return normalizeCacheKey(normalizedParts.join(":"));
}

/** Returns true when a cache entry has expired at the provided timestamp. */
export function isExpired(
  entry: CacheEntry<unknown>,
  now: number = Date.now(),
): boolean {
  if (entry.expiresAt === undefined) {
    return false;
  }

  return now >= entry.expiresAt;
}

/** Resolves operation TTL with an optional fallback and validates it. */
export function resolveTtlMs(
  options?: CacheSetOptions,
  fallback?: number,
): number | undefined {
  const ttlMs = options?.ttlMs ?? fallback;

  if (ttlMs === undefined) {
    return undefined;
  }

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new CacheError("Cache TTL must be greater than zero", {
      code: "CACHE_UNKNOWN_ERROR",
      details: { option: "ttlMs" },
    });
  }

  return ttlMs;
}

/** Creates a cache entry using the current timestamp and optional TTL. */
export function createCacheEntry<T>(
  value: T,
  options: CacheSetOptions = {},
): CacheEntry<T> {
  const ttlMs = resolveTtlMs(options);
  const createdAt = Date.now();

  return {
    value,
    createdAt,
    ...(ttlMs === undefined ? {} : {
      expiresAt: createdAt + ttlMs,
      ttlMs,
    }),
  };
}

/** Clones cache metadata while preserving the original value reference. */
export function cloneCacheEntry<T>(entry: CacheEntry<T>): CacheEntry<T> {
  return {
    value: entry.value,
    createdAt: entry.createdAt,
    ...(entry.expiresAt === undefined ? {} : { expiresAt: entry.expiresAt }),
    ...(entry.ttlMs === undefined ? {} : { ttlMs: entry.ttlMs }),
  };
}

/**
 * Default JSON {@link CacheSerializer}. Out-of-process adapters can pass it (or
 * a custom serializer) to convert values to and from a string wire format.
 * Serialization or parsing failures surface as a `CacheError`.
 */
export function jsonCacheSerializer(): CacheSerializer<string> {
  return {
    serialize(value: unknown): string {
      try {
        return JSON.stringify(value ?? null);
      } catch (cause) {
        throw new CacheError("Failed to serialize cache value", {
          code: "CACHE_SERIALIZATION_FAILED",
          cause,
        });
      }
    },

    deserialize<T = unknown>(wire: string): T {
      try {
        return JSON.parse(wire) as T;
      } catch (cause) {
        throw new CacheError("Failed to deserialize cache value", {
          code: "CACHE_SERIALIZATION_FAILED",
          cause,
        });
      }
    },
  };
}

/** Creates a cache client that never stores values. */
export function noopCache(): CacheClient {
  const cache: CacheClient = {
    get<T = unknown>(
      _key: CacheKey,
      _options?: CacheGetOptions,
    ): Promise<T | undefined> {
      return Promise.resolve(undefined);
    },

    set<T = unknown>(
      _key: CacheKey,
      _value: T,
      _options?: CacheSetOptions,
    ): Promise<void> {
      return Promise.resolve();
    },

    delete(
      _key: CacheKey,
      _options?: CacheDeleteOptions,
    ): Promise<boolean> {
      return Promise.resolve(false);
    },

    has(_key: CacheKey): Promise<boolean> {
      return Promise.resolve(false);
    },

    clear(): Promise<void> {
      return Promise.resolve();
    },

    async getOrSet<T = unknown>(
      _key: CacheKey,
      factory: () => T | Promise<T>,
      _options?: GetOrSetOptions,
    ): Promise<T> {
      return await factory();
    },

    namespace(_namespace: string): CacheClient {
      return cache;
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };

  return cache;
}

interface RootwareCacheClientOptions {
  readonly store: CacheStore;
  readonly namespace?: string;
  readonly defaultTtlMs?: number;
  readonly logger?: Logger;
  readonly inFlight?: Map<CacheKey, Promise<unknown>>;
}

class RootwareCacheClient implements CacheClient {
  readonly #store: CacheStore;
  readonly #namespace?: string;
  readonly #defaultTtlMs?: number;
  readonly #logger?: Logger;
  readonly #inFlight: Map<CacheKey, Promise<unknown>>;

  constructor(options: RootwareCacheClientOptions) {
    this.#store = options.store;
    this.#namespace = options.namespace;
    this.#defaultTtlMs = options.defaultTtlMs;
    this.#logger = options.logger;
    this.#inFlight = options.inFlight ?? new Map();
  }

  async get<T = unknown>(
    key: CacheKey,
    options: CacheGetOptions = {},
  ): Promise<T | undefined> {
    const fullKey = this.#key(key);

    try {
      const entry = await this.#store.get<T>(fullKey, options);

      if (entry === undefined) {
        this.#debug({ key: fullKey, namespace: this.#namespace }, "cache miss");
        return undefined;
      }

      if (!options.allowExpired && isExpired(entry)) {
        await this.#store.delete(fullKey, { silent: true });
        this.#debug({ key: fullKey, namespace: this.#namespace }, "cache miss");
        return undefined;
      }

      this.#debug({ key: fullKey, namespace: this.#namespace }, "cache hit");
      return entry.value;
    } catch (cause) {
      this.#error(
        { key: fullKey, namespace: this.#namespace },
        "cache operation failed",
      );
      throwCacheError("Cache get failed", "CACHE_GET_FAILED", {
        key: fullKey,
        operation: "get",
        namespace: this.#namespace,
      }, cause);
    }
  }

  async set<T = unknown>(
    key: CacheKey,
    value: T,
    options: CacheSetOptions = {},
  ): Promise<void> {
    const fullKey = this.#key(key);

    try {
      const ttlMs = resolveTtlMs(options, this.#defaultTtlMs);
      const entry = createCacheEntry(value, { ttlMs });

      await this.#store.set<T>(fullKey, entry, { ttlMs });
      this.#debug(
        { key: fullKey, namespace: this.#namespace, ttlMs },
        "cache set",
      );
    } catch (cause) {
      this.#error(
        { key: fullKey, namespace: this.#namespace },
        "cache operation failed",
      );
      throwCacheError("Cache set failed", "CACHE_SET_FAILED", {
        key: fullKey,
        operation: "set",
        namespace: this.#namespace,
      }, cause);
    }
  }

  async delete(
    key: CacheKey,
    options: CacheDeleteOptions = {},
  ): Promise<boolean> {
    const fullKey = this.#key(key);

    try {
      const deleted = await this.#store.delete(fullKey, options);

      if (!options.silent) {
        this.#debug(
          { key: fullKey, namespace: this.#namespace, deleted },
          "cache delete",
        );
      }

      return deleted;
    } catch (cause) {
      this.#error(
        { key: fullKey, namespace: this.#namespace },
        "cache operation failed",
      );
      throwCacheError("Cache delete failed", "CACHE_DELETE_FAILED", {
        key: fullKey,
        operation: "delete",
        namespace: this.#namespace,
      }, cause);
    }
  }

  async has(key: CacheKey): Promise<boolean> {
    const fullKey = this.#key(key);

    try {
      const entry = await this.#store.get(fullKey);

      if (entry === undefined) {
        return false;
      }

      if (isExpired(entry)) {
        await this.#store.delete(fullKey, { silent: true });
        return false;
      }

      return true;
    } catch (cause) {
      this.#error(
        { key: fullKey, namespace: this.#namespace },
        "cache operation failed",
      );
      throwCacheError("Cache get failed", "CACHE_GET_FAILED", {
        key: fullKey,
        operation: "has",
        namespace: this.#namespace,
      }, cause);
    }
  }

  async clear(): Promise<void> {
    try {
      // Namespace-specific clear can be added once stores expose prefix deletes.
      await this.#store.clear();
      this.#debug(undefined, "cache clear");
    } catch (cause) {
      this.#error({ namespace: this.#namespace }, "cache operation failed");
      throwCacheError("Cache clear failed", "CACHE_CLEAR_FAILED", {
        operation: "clear",
        namespace: this.#namespace,
      }, cause);
    }
  }

  async getOrSet<T = unknown>(
    key: CacheKey,
    factory: () => T | Promise<T>,
    options: GetOrSetOptions = {},
  ): Promise<T> {
    const fullKey = this.#key(key);

    if (!options.forceRefresh) {
      const existing = await this.get<T>(key);

      if (existing !== undefined) {
        return existing;
      }
    }

    const inFlight = this.#inFlight.get(fullKey) as Promise<T> | undefined;

    if (inFlight !== undefined) {
      return await inFlight;
    }

    const promise = this.#computeWithLock(key, fullKey, factory, options);
    this.#inFlight.set(fullKey, promise);

    try {
      return await promise;
    } finally {
      this.#inFlight.delete(fullKey);
    }
  }

  namespace(namespace: string): CacheClient {
    return new RootwareCacheClient({
      store: this.#store,
      namespace: joinCacheKey([this.#namespace, namespace]),
      defaultTtlMs: this.#defaultTtlMs,
      logger: this.#logger,
      inFlight: this.#inFlight,
    });
  }

  async close(): Promise<void> {
    await this.#store.close?.();
  }

  #key(key: CacheKey): CacheKey {
    return joinCacheKey([this.#namespace, key]);
  }

  async #computeWithLock<T>(
    key: CacheKey,
    fullKey: CacheKey,
    factory: () => T | Promise<T>,
    options: GetOrSetOptions,
  ): Promise<T> {
    const lock = options.lockTimeoutMs !== undefined &&
        this.#store.acquireLock !== undefined
      ? await this.#store.acquireLock(fullKey, {
        lockTimeoutMs: options.lockTimeoutMs,
      })
      : undefined;

    try {
      // After winning a cross-process lock another node may have populated the
      // value while we waited, so re-check before recomputing.
      if (lock !== undefined && !options.forceRefresh) {
        const existing = await this.get<T>(key);
        if (existing !== undefined) {
          return existing;
        }
      }

      return await this.#computeAndStore(key, fullKey, factory, options);
    } finally {
      if (lock !== undefined) {
        await lock.release();
      }
    }
  }

  async #computeAndStore<T>(
    key: CacheKey,
    fullKey: CacheKey,
    factory: () => T | Promise<T>,
    options: GetOrSetOptions,
  ): Promise<T> {
    let value: T;

    try {
      value = await factory();
    } catch (cause) {
      this.#error(
        { key: fullKey, namespace: this.#namespace },
        "cache operation failed",
      );
      throwCacheError("Cache getOrSet failed", "CACHE_GET_OR_SET_FAILED", {
        key: fullKey,
        operation: "getOrSet",
        namespace: this.#namespace,
      }, cause);
    }

    await this.set<T>(key, value, options);
    return value;
  }

  #debug(fields: Record<string, unknown> | undefined, message: string): void {
    try {
      if (fields === undefined) {
        this.#logger?.debug(message);
      } else {
        this.#logger?.debug(omitUndefined(fields), message);
      }
    } catch {
      // Logging must not affect cache operations.
    }
  }

  #error(fields: Record<string, unknown>, message: string): void {
    try {
      this.#logger?.error(omitUndefined(fields), message);
    } catch {
      // Logging must not affect cache operations.
    }
  }
}

function throwInvalidKey(message: string): never {
  throw new CacheError(message, {
    code: "CACHE_INVALID_KEY",
    details: { expected: "valid cache key" },
  });
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

function throwCacheError(
  message: string,
  code: CacheErrorCode,
  details: Record<string, unknown>,
  cause: unknown,
): never {
  throw new CacheError(message, {
    code,
    details: omitUndefined(details),
    cause,
  });
}

function cloneEntryValue<T>(entry: CacheEntry<T>): CacheEntry<T> {
  return {
    ...cloneCacheEntry(entry),
    value: safeStructuredClone(entry.value),
  };
}

function safeStructuredClone<T>(value: T): T {
  const clone = (globalThis as {
    readonly structuredClone?: <TValue>(value: TValue) => TValue;
  }).structuredClone;

  if (clone === undefined) {
    return value;
  }

  try {
    return clone(value);
  } catch {
    return value;
  }
}

function evictOldestEntries(
  entries: Map<CacheKey, CacheEntry<unknown>>,
  maxEntries: number | undefined,
): void {
  if (maxEntries === undefined) {
    return;
  }

  while (entries.size > maxEntries) {
    let oldestKey: CacheKey | undefined;
    let oldestCreatedAt = Infinity;

    for (const [key, entry] of entries) {
      if (entry.createdAt < oldestCreatedAt) {
        oldestCreatedAt = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey === undefined) {
      return;
    }

    entries.delete(oldestKey);
  }
}

function omitUndefined(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      output[key] = entry;
    }
  }

  return output;
}

// Example: cache simples em memória.
// const cache = createCache({
//   store: memoryCacheStore(),
//   namespace: "app",
// });
// await cache.set("user:u_123", { id: "u_123", name: "Lucas" });
// const user = await cache.get<{ id: string; name: string }>("user:u_123");
//
// Example: cache com TTL.
// await cache.set("settings", { theme: "dark" }, { ttlMs: 60_000 });
//
// Example: getOrSet.
// const settings = await cache.getOrSet("settings", async () => {
//   return { theme: "dark" };
// }, { ttlMs: 300_000 });
//
// Example: namespace.
// const usersCache = cache.namespace("users");
// await usersCache.set("u_123", { id: "u_123" });
//
// Example: noopCache.
// const disabledCache = noopCache();
// const value = await disabledCache.getOrSet("key", () => "fresh");
