# Integration tests

Opt-in tests that exercise the **real** integration paths against live databases
across **multiple versions**, driven by [`../compose.yaml`](../compose.yaml):

- **Data layer** ([`data_layer_test.ts`](./data_layer_test.ts)) — the `orm` +
  `schema` + `migrate` packages against PostgreSQL **14, 15, 16, 17, 18**. Each
  version: ORM tables → schema snapshot → schema diff → generated PostgreSQL DDL
  → applied via the real `createPgMigrator` → verified through
  `information_schema` → real CRUD with the `eq` / `inArray` / `ilike` builders
  → schema evolution via a generated `ALTER TABLE`.
- **Cache** ([`cache_test.ts`](./cache_test.ts)) — `@rootware/cache` over a real
  `redisCacheStore` against Redis **6, 7, 8.8**: set/get/has/delete, JSON
  round-trips, `getOrSet` memoization, real `PX` TTL expiry, namespacing, and
  `clear`.

These are **excluded** from `deno task test` / `deno task ci`, which stay
network- and database-free (see [`../CLAUDE.md`](../CLAUDE.md)). They run only
under their own task with `--allow-net --allow-env`.

## Run it

```sh
deno task it:up              # docker compose up -d --wait (every version)
deno task test:integration   # run the suite against every reachable version
deno task it:down            # docker compose down -v
```

Run a subset by starting only some services — the suite **skips** versions whose
service is not reachable (and fails loudly only if none are):

```sh
docker compose up -d --wait postgres-18 redis-8.8
deno task test:integration
```

Each version appears as a subtest, e.g.:

```
integration: data layer (orm + schema + migrate) on PostgreSQL ...
  postgres-18 — postgres://***:***@localhost:5418/rootware ... ok
  postgres-14 — postgres://***:***@localhost:5414/rootware ... ignored (not reachable)
```

## Targets

| Service       | Host port | Default URL                                            |
| ------------- | --------- | ------------------------------------------------------ |
| `postgres-14` | 5414      | `postgres://rootware:rootware@localhost:5414/rootware` |
| `postgres-15` | 5415      | `postgres://rootware:rootware@localhost:5415/rootware` |
| `postgres-16` | 5416      | `postgres://rootware:rootware@localhost:5416/rootware` |
| `postgres-17` | 5417      | `postgres://rootware:rootware@localhost:5417/rootware` |
| `postgres-18` | 5418      | `postgres://rootware:rootware@localhost:5418/rootware` |
| `redis-6`     | 6306      | `redis://localhost:6306/15`                            |
| `redis-7`     | 6307      | `redis://localhost:6307/15`                            |
| `redis-8.8`   | 6308      | `redis://localhost:6308/15`                            |

Override the matrix with comma-separated `label=url` entries:

```sh
RW_PG_URLS="pg16=postgres://user:pass@db:5432/app" \
RW_REDIS_URLS="prod=redis://cache:6379/15" \
  deno task test:integration
```

## Safety

- Postgres objects use unique per-run names and are dropped in a `finally`
  block; the migration history table is per-run too.
- Redis tests target a dedicated logical DB (`/15`) and `FLUSHDB` it before and
  after — they never touch DB 0.
- The Redis client ([`redis_client.ts`](./redis_client.ts)) is a tiny
  dependency-free RESP client (only `--allow-net`), and
  [`redis_cache_store.ts`](./redis_cache_store.ts) is a real `CacheStore` built
  on the `RedisLikeClient` contract that shipped in `@rootware/cache@0.3` — it
  lives here, not in the package, so the package stays driver-free.
