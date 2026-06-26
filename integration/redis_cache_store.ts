/**
 * A Redis-backed `CacheStore`, implemented against the `@rootware/cache`
 * `RedisLikeClient` contract that shipped (as a contract only) in `0.3`. It
 * lives in the integration suite — not in the package — so `@rootware/cache`
 * stays driver-free and CI-green, while this proves the contract works against a
 * real Redis server.
 */

import {
  type CacheEntry,
  type CacheGetOptions,
  type CacheKey,
  type CacheSerializer,
  type CacheSetOptions,
  type CacheStore,
  jsonCacheSerializer,
  type RedisLikeClient,
} from "@rootware/cache";

export interface RedisCacheStoreOptions {
  /** Namespaces every key on the wire (e.g. `"cache:"`). */
  readonly keyPrefix?: string;
  /** Defaults to {@link jsonCacheSerializer}. */
  readonly serializer?: CacheSerializer<string>;
}

const SCAN_COUNT = 100;

/** Builds a {@link CacheStore} over a {@link RedisLikeClient}. */
export function redisCacheStore(
  client: RedisLikeClient,
  options: RedisCacheStoreOptions = {},
): CacheStore {
  const prefix = options.keyPrefix ?? "";
  const serializer = options.serializer ?? jsonCacheSerializer();
  const prefixed = (key: CacheKey): string => `${prefix}${key}`;

  return {
    async get<T = unknown>(
      key: CacheKey,
      _options?: CacheGetOptions,
    ): Promise<CacheEntry<T> | undefined> {
      const wire = await client.get(prefixed(key));
      return wire === null
        ? undefined
        : serializer.deserialize<CacheEntry<T>>(wire);
    },

    async set<T = unknown>(
      key: CacheKey,
      entry: CacheEntry<T>,
      setOptions?: CacheSetOptions,
    ): Promise<void> {
      const ttlMs = setOptions?.ttlMs ??
        (entry.expiresAt === undefined
          ? undefined
          : entry.expiresAt - Date.now());
      const wire = serializer.serialize(entry);

      await client.set(
        prefixed(key),
        wire,
        ttlMs !== undefined && ttlMs > 0 ? { pxMs: ttlMs } : {},
      );
    },

    async delete(key: CacheKey): Promise<boolean> {
      const removed = await client.del(prefixed(key));
      return typeof removed === "number" && removed > 0;
    },

    async has(key: CacheKey): Promise<boolean> {
      return (await client.get(prefixed(key))) !== null;
    },

    async clear(): Promise<void> {
      for (const key of await scanPrefixed(client, prefix)) {
        await client.del(key);
      }
    },

    async keys(): Promise<CacheKey[]> {
      const keys = await scanPrefixed(client, prefix);
      return keys.map((key) => key.slice(prefix.length));
    },
  };
}

async function scanPrefixed(
  client: RedisLikeClient,
  prefix: string,
): Promise<string[]> {
  if (client.scan === undefined) {
    throw new Error("Redis client does not support SCAN");
  }

  const matched: string[] = [];
  let cursor = "0";

  do {
    const [next, keys] = await client.scan(cursor, {
      match: `${prefix}*`,
      count: SCAN_COUNT,
    });
    cursor = next;
    matched.push(...keys);
  } while (cursor !== "0");

  return matched;
}
