import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  type CacheEntry,
  CacheError,
  type CacheKey,
  type CacheLock,
  type CacheStore,
  cloneCacheEntry,
  createCache,
  createCacheEntry,
  isExpired,
  joinCacheKey,
  jsonCacheSerializer,
  memoryCacheStore,
  noopCache,
  normalizeCacheKey,
  resolveTtlMs,
} from "./mod.ts";

Deno.test("@rootware/cache - jsonCacheSerializer round-trips values and reports failures", () => {
  const serializer = jsonCacheSerializer();
  const wire = serializer.serialize({ id: "u_1", tags: ["a", "b"] });

  assertEquals(typeof wire, "string");
  assertEquals(serializer.deserialize(wire), { id: "u_1", tags: ["a", "b"] });
  assertEquals(serializer.serialize(undefined), "null");

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const error = assertThrows(
    () => serializer.serialize(circular),
    CacheError,
  ) as CacheError;
  assertEquals(error.code, "CACHE_SERIALIZATION_FAILED");

  const parseError = assertThrows(
    () => serializer.deserialize("{not json"),
    CacheError,
  ) as CacheError;
  assertEquals(parseError.code, "CACHE_SERIALIZATION_FAILED");
  assert(parseError instanceof CacheError);
});

Deno.test("@rootware/cache - memory store and client set/get/has/delete/clear", async () => {
  const cache = createCache({ store: memoryCacheStore() });

  await cache.set("user:u_123", { id: "u_123" });
  assertEquals(await cache.get("user:u_123"), { id: "u_123" });
  assertEquals(await cache.has("user:u_123"), true);
  assertEquals(await cache.delete("user:u_123"), true);
  assertEquals(await cache.has("user:u_123"), false);

  await cache.set("a", 1);
  await cache.clear();
  assertEquals(await cache.get("a"), undefined);
});

Deno.test("@rootware/cache - TTL expiration and allowExpired", async () => {
  const cache = createCache();

  await cache.set("short", "value", { ttlMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 5));

  assertEquals(await cache.get("short", { allowExpired: true }), "value");
  assertEquals(await cache.get("short"), undefined);
  assertEquals(await cache.has("short"), false);
});

Deno.test("@rootware/cache - getOrSet and forceRefresh", async () => {
  const cache = createCache();
  let calls = 0;

  assertEquals(
    await cache.getOrSet("settings", () => {
      calls += 1;
      return "first";
    }),
    "first",
  );
  assertEquals(
    await cache.getOrSet("settings", () => {
      calls += 1;
      return "second";
    }),
    "first",
  );
  assertEquals(
    await cache.getOrSet("settings", () => {
      calls += 1;
      return "third";
    }, { forceRefresh: true }),
    "third",
  );
  assertEquals(calls, 2);

  await assertRejects(async () => {
    await cache.getOrSet("boom", () => {
      throw new Error("factory");
    });
  }, CacheError);
});

Deno.test("@rootware/cache - getOrSet deduplicates concurrent misses", async () => {
  const cache = createCache();
  let calls = 0;
  let resolveFactory!: (value: string) => void;
  const gate = new Promise<string>((resolve) => {
    resolveFactory = resolve;
  });

  const first = cache.getOrSet("shared", async () => {
    calls += 1;
    return await gate;
  });
  const second = cache.getOrSet("shared", () => {
    calls += 1;
    return "duplicate";
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(calls, 1);
  resolveFactory("value");

  assertEquals(await Promise.all([first, second]), ["value", "value"]);
  assertEquals(await cache.get("shared"), "value");
});

Deno.test("@rootware/cache - getOrSet cleans up in-flight entry after rejection", async () => {
  const cache = createCache();
  let calls = 0;

  const first = cache.getOrSet("rejects", () => {
    calls += 1;
    return Promise.reject(new Error("factory"));
  });
  const second = cache.getOrSet("rejects", () => {
    calls += 1;
    return "duplicate";
  });

  await assertRejects(() => first, CacheError);
  await assertRejects(() => second, CacheError);
  assertEquals(calls, 1);

  assertEquals(
    await cache.getOrSet("rejects", () => {
      calls += 1;
      return "retry";
    }),
    "retry",
  );
  assertEquals(calls, 2);
});

Deno.test("@rootware/cache - getOrSet does not block different keys", async () => {
  const cache = createCache();
  let calls = 0;

  const values = await Promise.all([
    cache.getOrSet("a", async () => {
      calls += 1;
      await Promise.resolve();
      return "a";
    }),
    cache.getOrSet("b", async () => {
      calls += 1;
      await Promise.resolve();
      return "b";
    }),
  ]);

  assertEquals(values, ["a", "b"]);
  assertEquals(calls, 2);
});

Deno.test("@rootware/cache - namespaces nest", async () => {
  const cache = createCache({ namespace: "app" });
  const users = cache.namespace("users").namespace("sessions");

  await users.set("u_123", "ok");

  assertEquals(await cache.get("users:sessions:u_123"), "ok");
});

Deno.test("@rootware/cache - noopCache", async () => {
  const cache = noopCache();

  assertEquals(await cache.get("x"), undefined);
  assertEquals(await cache.has("x"), false);
  assertEquals(await cache.delete("x"), false);
  assertEquals(await cache.getOrSet("x", () => "fresh"), "fresh");

  await cache.set("x", "ignored");
  await cache.clear();
  await cache.close();
});

Deno.test("@rootware/cache - key and entry helpers", () => {
  assertEquals(normalizeCacheKey(" key "), "key");
  assertEquals(joinCacheKey(["app", undefined, "", "users"]), "app:users");
  assertThrows(() => normalizeCacheKey(""), CacheError);
  assertThrows(() => normalizeCacheKey("bad\nkey"), CacheError);

  const entry = createCacheEntry("value", { ttlMs: 10 });
  assertEquals(entry.value, "value");
  assertEquals(entry.ttlMs, 10);
  assertEquals(isExpired(entry, entry.createdAt + 10), true);
  assertEquals(cloneCacheEntry(entry), entry);
  assertEquals(resolveTtlMs(undefined, 100), 100);
  assertThrows(() => resolveTtlMs({ ttlMs: 0 }), CacheError);
});

Deno.test("@rootware/cache - maxEntries and cloneValues", async () => {
  const store = memoryCacheStore({ maxEntries: 2, cloneValues: true });
  const cache = createCache({ store });

  await cache.set("a", 1);
  await cache.set("b", 2);
  await cache.set("c", 3);

  assertEquals(await cache.get("a"), undefined);
  assertEquals((await store.keys?.())?.sort(), ["b", "c"]);

  await cache.set("object", { nested: { count: 1 } });
  const first = await cache.get<{ nested: { count: number } }>("object");
  first!.nested.count = 2;
  const second = await cache.get<{ nested: { count: number } }>("object");

  assertEquals(second!.nested.count, 1);
});

Deno.test("@rootware/cache - getOrSet uses a store lock and double-checks after acquiring", async () => {
  const events: string[] = [];
  const entries = new Map<CacheKey, CacheEntry<unknown>>();
  let preLockValue: CacheEntry<unknown> | undefined = undefined;

  const lockingStore: CacheStore = {
    get<T = unknown>(key: CacheKey): Promise<CacheEntry<T> | undefined> {
      return Promise.resolve(entries.get(key) as CacheEntry<T> | undefined);
    },
    set<T = unknown>(key: CacheKey, entry: CacheEntry<T>): Promise<void> {
      entries.set(key, entry);
      return Promise.resolve();
    },
    delete(key: CacheKey): Promise<boolean> {
      return Promise.resolve(entries.delete(key));
    },
    has(key: CacheKey): Promise<boolean> {
      return Promise.resolve(entries.has(key));
    },
    clear(): Promise<void> {
      entries.clear();
      return Promise.resolve();
    },
    acquireLock(key: CacheKey): Promise<CacheLock | undefined> {
      events.push("acquire");
      // Simulate another node populating the value while the lock was contended.
      if (preLockValue !== undefined) {
        entries.set(key, preLockValue);
      }
      return Promise.resolve({
        release(): Promise<void> {
          events.push("release");
          return Promise.resolve();
        },
      });
    },
  };

  const cache = createCache({ store: lockingStore });

  // First call: no value yet, so it computes under the lock, stores, releases.
  let factoryCalls = 0;
  const value = await cache.getOrSet("k", () => {
    factoryCalls += 1;
    return "computed";
  }, { lockTimeoutMs: 1000 });
  assertEquals(value, "computed");
  assertEquals(factoryCalls, 1);
  assertEquals(events, ["acquire", "release"]);

  // Now simulate the value appearing right after the lock is acquired: the
  // double-check returns it and the factory never runs.
  entries.clear();
  events.length = 0;
  preLockValue = createCacheEntry("from-other-node");
  let secondFactoryCalls = 0;
  const cached = await cache.getOrSet("k2", () => {
    secondFactoryCalls += 1;
    return "should-not-run";
  }, { lockTimeoutMs: 1000 });
  assertEquals(cached, "from-other-node");
  assertEquals(secondFactoryCalls, 0);
  assertEquals(events, ["acquire", "release"]);
});

Deno.test("@rootware/cache - getOrSet without lockTimeoutMs never calls acquireLock", async () => {
  let acquired = false;
  const store = memoryCacheStore() as CacheStore & {
    acquireLock(): Promise<CacheLock | undefined>;
  };
  store.acquireLock = () => {
    acquired = true;
    return Promise.resolve(undefined);
  };

  const cache = createCache({ store });
  await cache.getOrSet("k", () => "v");
  assertEquals(acquired, false);
});
