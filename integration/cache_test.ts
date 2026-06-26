/**
 * Real integration of `@rootware/cache` against live Redis, run once per
 * configured version. It drives `createCache` over a {@link redisCacheStore}
 * (built on the `RedisLikeClient` contract) using a tiny dependency-free RESP
 * client, exercising set/get/has/delete, JSON round-trips, `getOrSet`
 * memoization, real `PX` TTL expiry, namespacing, and `clear`.
 *
 * Each run targets a dedicated logical DB (15 by default) and flushes it, so it
 * never touches application data. Excluded from `deno task test`; run with
 * `deno task test:integration` after `docker compose up -d --wait`.
 */

import { assert, assertEquals } from "@std/assert";
import { createCache } from "@rootware/cache";
import { canReach, type DbTarget, redactUrl, redisTargets } from "./config.ts";
import { connectRedis, parseRedisUrl } from "./redis_client.ts";
import { redisCacheStore } from "./redis_cache_store.ts";

Deno.test("integration: cache on Redis", async (t) => {
  const targets = redisTargets();
  let reachable = 0;

  for (const target of targets) {
    const up = await canReach(target.url);
    if (up) {
      reachable += 1;
    }

    await t.step({
      name: `${target.label} — ${redactUrl(target.url)}`,
      ignore: !up,
      fn: () => runCacheSuite(target),
    });
  }

  if (reachable === 0) {
    throw new Error(
      "No Redis targets were reachable. Start them with " +
        "`docker compose up -d --wait` (or set RW_REDIS_URLS).",
    );
  }
});

async function runCacheSuite(target: DbTarget): Promise<void> {
  const client = await connectRedis(parseRedisUrl(target.url));

  try {
    assertEquals(await client.ping(), "PONG");
    // Start clean on the dedicated test DB.
    await client.flushdb();

    const cache = createCache({
      store: redisCacheStore(client, { keyPrefix: "it:cache:" }),
      namespace: "app",
    });

    // JSON round-trip through the real wire format.
    await cache.set("user:1", { id: "u1", name: "Alice", roles: ["admin"] });
    assertEquals(await cache.get("user:1"), {
      id: "u1",
      name: "Alice",
      roles: ["admin"],
    });
    assertEquals(await cache.has("user:1"), true);
    assertEquals(await cache.get("missing"), undefined);
    assertEquals(await cache.has("missing"), false);

    // getOrSet memoizes: the factory runs only on the first miss.
    let factoryCalls = 0;
    const computed = await cache.getOrSet("settings", () => {
      factoryCalls += 1;
      return { theme: "dark" };
    });
    assertEquals(computed, { theme: "dark" });
    const cached = await cache.getOrSet("settings", () => {
      factoryCalls += 1;
      return { theme: "light" };
    });
    assertEquals(cached, { theme: "dark" });
    assertEquals(factoryCalls, 1);

    // Real Redis PX expiry: a short TTL key is gone after it elapses.
    await cache.set("ephemeral", "value", { ttlMs: 50 });
    assertEquals(await cache.get("ephemeral"), "value");
    await delay(120);
    assertEquals(await cache.get("ephemeral"), undefined);

    // Delete and clear.
    assertEquals(await cache.delete("user:1"), true);
    assertEquals(await cache.has("user:1"), false);

    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.clear();
    assertEquals(await cache.get("a"), undefined);
    assertEquals(await cache.get("b"), undefined);

    // The wire really is namespaced/prefixed under the store key prefix.
    await cache.set("k", "v");
    const store = redisCacheStore(client, { keyPrefix: "it:cache:" });
    const keys = await store.keys?.();
    assert(keys !== undefined && keys.includes("app:k"));
  } finally {
    await client.flushdb().catch(() => {});
    client.close();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
