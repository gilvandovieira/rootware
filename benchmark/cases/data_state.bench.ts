import {
  createCache,
  createCacheEntry,
  joinCacheKey,
  memoryCacheStore,
} from "@rootware/cache";
import {
  diffSchemaSnapshots,
  equalSchemaSnapshots,
  serializeSchemaSnapshot,
  validateSchemaSnapshot,
} from "@rootware/schema";
import { consume } from "../fixtures/blackhole.ts";
import {
  changedLargeSchemaSnapshot,
  largeSchemaSnapshot,
  smallSchemaSnapshot,
} from "../fixtures/schema.ts";
import { benchmarkName } from "../fixtures/names.ts";

const CACHE_CLIENT_SET_GET = "cache.client.set-get";
const CACHE_STORE_GET = "cache.store.get";
const CACHE_KEY_JOIN = "cache.key.join";
const SCHEMA_SERIALIZE_SMALL = "schema.serialize.small";
const SCHEMA_SERIALIZE_LARGE = "schema.serialize.large";
const SCHEMA_VALIDATE_LARGE = "schema.validate.large";
const SCHEMA_DIFF_LARGE = "schema.diff.large";
const SCHEMA_EQUAL_LARGE = "schema.equal.large";

const cachePayload = Object.freeze({
  id: "user_123",
  roles: ["owner", "admin"],
  profile: {
    displayName: "Benchmark User",
    region: "local",
  },
});

const cache = createCache({
  namespace: "benchmark",
  defaultTtlMs: 60_000,
});

const platformCache = new Map<string, unknown>();
const store = memoryCacheStore();
const platformStore = new Map<string, unknown>();
const cacheEntry = createCacheEntry(cachePayload, { ttlMs: 60_000 });

await store.set("warm", cacheEntry);
platformStore.set("warm", cacheEntry);

Deno.bench({
  name: benchmarkName(CACHE_CLIENT_SET_GET, "rootware"),
  group: CACHE_CLIENT_SET_GET,
  baseline: true,
  async fn(): Promise<void> {
    await cache.set("user:123", cachePayload);
    consume(await cache.get("user:123"));
  },
});

Deno.bench({
  name: benchmarkName(CACHE_CLIENT_SET_GET, "platform:map"),
  group: CACHE_CLIENT_SET_GET,
  async fn(): Promise<void> {
    platformCache.set("benchmark:user:123", cachePayload);
    consume(await Promise.resolve(platformCache.get("benchmark:user:123")));
  },
});

Deno.bench({
  name: benchmarkName(CACHE_STORE_GET, "rootware"),
  group: CACHE_STORE_GET,
  baseline: true,
  async fn(): Promise<void> {
    consume(await store.get("warm"));
  },
});

Deno.bench({
  name: benchmarkName(CACHE_STORE_GET, "platform:map"),
  group: CACHE_STORE_GET,
  async fn(): Promise<void> {
    consume(await Promise.resolve(platformStore.get("warm")));
  },
});

Deno.bench({
  name: benchmarkName(CACHE_KEY_JOIN, "rootware"),
  group: CACHE_KEY_JOIN,
  baseline: true,
  fn(): void {
    consume(joinCacheKey(["tenant", "benchmark", "user", "123"]));
  },
});

Deno.bench({
  name: benchmarkName(CACHE_KEY_JOIN, "platform:template"),
  group: CACHE_KEY_JOIN,
  fn(): void {
    consume("tenant:benchmark:user:123");
  },
});

Deno.bench({
  name: benchmarkName(SCHEMA_SERIALIZE_SMALL, "rootware"),
  group: SCHEMA_SERIALIZE_SMALL,
  baseline: true,
  fn(): void {
    consume(serializeSchemaSnapshot(smallSchemaSnapshot));
  },
});

Deno.bench({
  name: benchmarkName(SCHEMA_SERIALIZE_SMALL, "platform:json-stringify"),
  group: SCHEMA_SERIALIZE_SMALL,
  fn(): void {
    consume(JSON.stringify(smallSchemaSnapshot));
  },
});

Deno.bench({
  name: benchmarkName(SCHEMA_SERIALIZE_LARGE, "rootware"),
  group: SCHEMA_SERIALIZE_LARGE,
  baseline: true,
  fn(): void {
    consume(serializeSchemaSnapshot(largeSchemaSnapshot));
  },
});

Deno.bench({
  name: benchmarkName(SCHEMA_SERIALIZE_LARGE, "platform:json-stringify"),
  group: SCHEMA_SERIALIZE_LARGE,
  fn(): void {
    consume(JSON.stringify(largeSchemaSnapshot));
  },
});

Deno.bench({
  name: benchmarkName(SCHEMA_VALIDATE_LARGE, "rootware"),
  group: SCHEMA_VALIDATE_LARGE,
  baseline: true,
  fn(): void {
    consume(validateSchemaSnapshot(largeSchemaSnapshot));
  },
});

Deno.bench({
  name: benchmarkName(SCHEMA_DIFF_LARGE, "rootware"),
  group: SCHEMA_DIFF_LARGE,
  baseline: true,
  fn(): void {
    consume(
      diffSchemaSnapshots(largeSchemaSnapshot, changedLargeSchemaSnapshot),
    );
  },
});

Deno.bench({
  name: benchmarkName(SCHEMA_EQUAL_LARGE, "rootware"),
  group: SCHEMA_EQUAL_LARGE,
  baseline: true,
  fn(): void {
    consume(equalSchemaSnapshots(largeSchemaSnapshot, largeSchemaSnapshot));
  },
});

Deno.bench({
  name: benchmarkName(SCHEMA_EQUAL_LARGE, "platform:json-equality"),
  group: SCHEMA_EQUAL_LARGE,
  fn(): void {
    consume(
      JSON.stringify(largeSchemaSnapshot) ===
        JSON.stringify(largeSchemaSnapshot),
    );
  },
});
