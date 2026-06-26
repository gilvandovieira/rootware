# Rootware Roadmap Changelog

## 2026-06-26 — Documentation graph alignment

- Updated root `README.md` with the CI-enforced runtime dependency graph and the
  product build-order ladder.
- Updated public package docs to include `@rootware/schema` in package lists,
  publishing guidance, release guidance, and package README coverage.
- Corrected roadmap status language now that `@rootware/schema` exists and
  `@rootware/orm` ships `createSchemaSnapshot`.

## 2026-06-26 — Move package roadmaps beside package code

- Moved package-specific roadmaps from `roadmaps/*.md` to
  `packages/*/ROADMAP.md` so each roadmap now lives with the package it owns.
- Kept `roadmaps/` for workspace-level planning only: the root package roadmap,
  adapters roadmap, template, and roadmap index.
- Left package `deno.json` publish includes unchanged, so `ROADMAP.md` files
  remain repository-only and are not included in JSR package contents.

## 2026-06-26 — Roadmap/code alignment and foundational hardening

- Corrected roadmap status language so missing adapter/subpath packages are no
  longer described as shipped. Current root exports remain package roots only;
  future subpaths require real files, tests, and export entries.
- Added `@rootware/schema` as a dependency-free schema snapshot leaf with
  validation, normalization, README, package manifest, and tests.
- Added root workspace imports, the `graph` task, `scripts/check_graph.ts`, and
  CI graph enforcement.
- Added ORM `createSchemaSnapshot` and a migrate-side
  `defineSchemaMigrationPlan` metadata seam; no migration diffing or SQL
  generation was added.
- Hardened cache `getOrSet` with per-key in-flight de-duplication for concurrent
  misses.
- Replaced storage's size-derived checksum placeholder in the client path with
  SHA-256 content checksums.
- Formalized and tested HTTP redaction helpers for headers, URLs, and JSON-like
  diagnostics.
- Added `@rootware/testing` helpers for Rootware errors: `assertRootwareError`,
  `assertErrorCode`, and `assertThrowsRootwareError`.
- Added ORM full-table update/delete protection with an explicit
  `unsafeAllowAllRows()` escape hatch.

## 2026-06-26 — Reconcile roadmaps with published `v0.1` source

This pass cross-checked the roadmap/spec docs against the actual code in (the
archive now holds 16 docs under `roadmaps/` — the original 15 reviewed against
code, plus `schema.md` added during this pass — alongside this top-level
`CHANGELOG.md`) `packages/*/mod.ts` and corrected the mismatches. The headline:
the roadmaps had drifted from the shipped `v0.1` in three ways — one
load-bearing architecture error (which the _code_ actually gets right), many
places where the docs schedule work that already shipped, and API names in the
docs that don't match the published exports.

Evidence for every change is the package source. The real cross-package
dependency graph (from `mod.ts` imports) is:

```txt
errors  -> (none)
env     -> errors
log     -> errors
testing -> errors, env, log
http    -> errors, log
cache   -> errors, log
storage -> errors, log
session -> errors, cache, log
migrate -> errors, log          # does NOT import orm
orm     -> errors, log          # does NOT import migrate
jobs    -> errors, log          # cache/orm not yet wired
```

---

### Follow-up 4 — final cleanup before canonical

1. **Blocker: `migrate.md` config-loader `migrate -> orm` leak.** The v0.2
   config-loader chunk still said "Allow `schema` to be optional for SQL-first
   mode" — the exact old mistake. Replaced with: `snapshot` is optional;
   SQL-first omits it; ORM-integrated mode receives a prebuilt
   `RootwareSchemaSnapshot` (from `@rootware/schema`); `defineConfig` must never
   accept raw ORM `schema`. The leak is gone; the only remaining
   `createSchemaSnapshot(schema)` references are app-level config examples.

2. **`rootware-roadmap.md` global dependency table now matches the per-package
   docs.** Split into two tables. The **runtime** table drops `env` from every
   package that only uses it in examples (`log`, `http`, `cache`, `storage`,
   `session`, `migrate`, `orm`, `jobs`) and reduces `log -> errors` (no env).
   `testing -> errors, env, log` stays (it imports env at runtime for
   `testEnv`). Added an **example/dev-only imports** table where `env` (and the
   app-level `migrate -> orm` snapshot wiring) is allowed, plus notes that
   several `log`/`cache` edges are type-only. Disallowed table updated to match
   (env not a runtime edge; `migrate -> orm` package-level forbidden; jobs
   cache/orm are adapter-only).

3. **Stale API names in small chunks.** `cache.md` "Stabilize `Cache`,
   `CacheAdapter`…" → `CacheClient`/`CacheStore`; `storage.md` "Stabilize
   `Storage`, `StorageAdapter`…" → `StorageClient`/`StorageStore`.

4. **"Verify …" chunk titles whose bodies still said Implement/Define/Add.**
   Fixed the five mismatches: storage Chunk 4 ("Add deterministic in-memory
   adapter" → "Verify the shipped memory storage behavior"), session Chunk 4
   (Session shape), session Chunk 5 (`SessionStore`), jobs Chunk 4
   (`defineJob`), jobs Chunk 5 (`JobQueue`). Titles and bodies now both say
   verify.

5. **`adapters.md` Hono wording.** No longer says `log.md` "mentions
   `@rootware/log/hono` as one option" — it now says `log.md` agrees Hono
   belongs in `@rootware/hono`, since that file was already updated to point
   there. The question stays closed on both sides.

---

### Follow-up 3 — schema leaf, snapshot extraction, First-10 rewrites, dependency split

Closing consistency pass. After this the archive is intended as canonical enough
to guide implementation.

1. **Added `roadmaps/schema.md`** — a full product plan for the new
   dependency-free `@rootware/schema` leaf that owns the snapshot type. It
   carries the canonical `RootwareSchemaSnapshot` shape, a
   `SCHEMA_SNAPSHOT_VERSION`, guards (`isSchemaSnapshot`,
   `assertSnapshotVersion`), and the `SnapshotDialect` open decision (now forced
   into one place).

2. **`README.md` includes schema** — added `schema.md` to the file list (with a
   note on why it exists) and to the dependency ladder (`errors/schema -> …`),
   reaffirming migrate/orm as siblings linked only through the leaf.

3. **Moved the snapshot interface out of `orm.md` and `migrate.md`** — both
   previously embedded the full `RootwareSchemaSnapshot` / table / column
   interfaces (duplicated). Now neither has the interface (0 copies each); both
   import the type from `@rootware/schema` and point at `schema.md`. `orm.md`
   keeps only the _production_ responsibility (`createSchemaSnapshot`);
   `migrate.md` keeps only _consumption_. The dialect-reconciliation note now
   lives in `schema.md` as the open decision.

4. **Rewrote the bottom "First 10 implementation chunks"** in `http`, `cache`,
   `storage`, `session`, and `jobs`. They no longer say "Implement memory
   adapter / client factory / session manager / worker" for code that already
   ships. Each list now opens with verification of the published surface, then
   the genuine gap(s) (redaction; cache serialization; local FS adapter;
   rotation + CSRF; scheduling + durable adapters), then real next work.

5. **Split dependency tables into runtime vs example/dev imports** across
   `http`, `cache`, `storage`, `session`, `jobs`, plus new `### Dependencies`
   blocks in `orm.md` and `migrate.md` and the leaf section in `schema.md`. Each
   now distinguishes **runtime imports** (and marks
   `@rootware/log`/`@rootware/cache` as **type-only**, since injected types are
   build edges, not runtime edges) from **example/dev-only** imports
   (`@rootware/env` in examples, `@rootware/testing` in tests). This matches the
   real `v0.1` import graph (errors value + log type).

6. **Jobs durable/cache integrations reframed as adapters, not core deps.**
   `jobs.md` "sits after" no longer lists cache/orm; a new "Adapter-only
   dependencies (not jobs-core)" section explains cache coordination and durable
   (Postgres) persistence live in separate adapter packages. The cross-package
   cache/orm sections are relabeled as adapters. `rootware-roadmap.md`'s
   direction table changed `jobs -> errors, env, log, cache, orm` to
   `jobs -> errors, env, log` plus a `jobs adapters -> …` line. This matches the
   code (jobs imports only errors + log).

---

### Follow-up 2 — API-name, milestone-verb, and ownership cleanup

Six issues raised after review, all resolved:

1. **Stale API names in `cache.md` / `storage.md` examples.** Quick-starts and
   public-contract wording used `createMemoryCache` / `createMemoryStorage` /
   `bucket` / `Cache` / `Storage` / `CacheAdapter` / `StorageAdapter`. Replaced
   with the shipped names: `createCache` + `CacheClient`/`CacheStore`;
   `createStorage` + `StorageClient`/`StorageStore`/`createStorageBucket`. No
   `createMemory*` remains.

2. **Release chunks scheduled already-shipped work.** Added an "already ships in
   `v0.1`" directive to the `v0.2` milestones of `http`, `storage`, `session`,
   `jobs`, `cache`, and `orm`, and retitled the genuinely-shipped chunks to
   "Verify … (ships in v0.1)". Genuine gaps stay "Implement": storage Chunk 5
   (local adapter), cache Chunk 8 (serialization contract), and orm Chunks
   7/10/11/16/17 (compiler-contract decision, `createSchemaSnapshot`, Postgres
   column types, `returning`, real driver). A contributor can now tell verify
   from build at a glance.

3. **`migrate.md` stale snapshot phrasing.** First-10 chunk 5 changed from
   "optional schema for SQL-first mode" to "optional **prebuilt `snapshot`** for
   ORM-integrated mode; SQL-first omits snapshot; `defineConfig` must not accept
   raw `schema`." The v0.3 flow and Chunk 16 were reframed: the app calls
   `createSchemaSnapshot`; `@rootware/migrate` only ever consumes the plain
   snapshot and imports zero ORM symbols. No "read ORM schema" lines remain.

4. **Snapshot ownership made explicit — decided on the `@rootware/schema`
   leaf.** Resolved the contradiction where `orm.md` said migrate "owns Schema
   snapshots" while also requiring the ORM to expose them. Now stated everywhere
   as: `@rootware/schema` owns the type; `@rootware/orm` produces;
   `@rootware/migrate` consumes/validates/ stores/diffs/journals. Added
   `@rootware/schema` to the canonical ladder and the direction table
   (`schema -> nothing`; `orm`/`migrate -> …, schema`), and committed the
   handoff section to the leaf (the "type-in-orm" fallback is explicitly
   rejected).

5. **Stale cross-package names in `log.md`.** `createMigrationRunner` →
   `createMigrator`; `createOrm` → `createDatabase` (both the §4.5 list and the
   §12.6 example); `createJobWorker` → `createJobQueue` (worker is
   `queue.worker()`).

6. **`@rootware/log/hono` ambiguity removed.** `adapters.md` no longer shows a
   `@rootware/log/hono` subpath example — it is marked explicitly rejected, with
   `@rootware/hono` as the single home. `log.md`'s §0.5.0 Hono option, its
   roadmap line, and its backlog checkbox were repointed to `@rootware/hono` and
   marked decided, so the question stays closed.

---

### Follow-up 1 — `testing.md` made fully self-consistent

The first pass fixed the _top_ of `testing.md` (the status note) but left the
body contradicting it. Resolved the whole file so it agrees with one rule:
**testing core contains fakes only for packages below it (env source, memory log
sink); every higher-package fake lives in that package's own `/testing` subpath
and imports testing core downward.**

- Removed the duplicate `Last reviewed: 2026-06-26` line (an artifact of the
  inserted status note).
- Canonical package: deleted the `@rootware/testing/storage` and
  `@rootware/testing/database` subpath examples; replaced with imports from the
  owning packages (`@rootware/storage/testing`, `@rootware/orm/testing`,
  `@rootware/http/testing`).
- Product thesis + "provides" list: dropped "Deterministic fake adapters for
  Rootware contracts"; added an explicit "does not ship fakes for packages above
  it" paragraph.
- Responsibilities: scoped "owns" to below-package fakes; added
  http/cache/storage/ session/orm/migrate fakes to "does not own".
- Architecture: relabeled the "Fake adapters" step/section to clarify core ships
  only below-package fakes and higher-package fakes live in subpaths.
- v0.3.0 retitled "Shared scaffolding for package fixtures" — the
  HTTP/cache/storage fixtures ship from those packages' `/testing` subpaths, not
  from here.
- v0.5.0 "Data testing foundation" — the test database and migration fakes live
  in `@rootware/orm/testing` / `@rootware/migrate/testing`; core provides only
  the shared scaffolding they compose.
- Cross-package integrations: the `http/cache/storage/session` entry now says
  those packages own their fakes and testing core must not import them.
- v1.0.0 and runtime-targets wording aligned to the same split.

---

### Architecture (load-bearing)

- **`rootware-roadmap.md` — removed the non-existent `orm -> migrate` edge.**
  The allowed-direction table listed `orm -> errors, env, log, migrate`. The
  code has no such edge: `orm/mod.ts` imports only `@rootware/errors` and
  `@rootware/log`. Changed to `orm -> errors, env, log`.
- **`rootware-roadmap.md` — added `migrate -> orm` and `orm -> migrate` to the
  disallowed list, plus a "Schema snapshot handoff" section.** `migrate` and
  `orm` are siblings, not a chain. They integrate only through a serializable
  `RootwareSchemaSnapshot` that the _application_ passes between them (orm
  produces it via `createSchemaSnapshot`; the app hands the plain object to
  migrate). Documented two ways to keep the type from drifting: a
  dependency-free `@rootware/schema` leaf (preferred), or keep the type in orm
  and have migrate accept a prebuilt snapshot.
- **`migrate.md` — fixed the config example so migrate never imports orm.** The
  old `defineConfig({ dialect, schema, out, driver })` passed raw ORM table
  objects, which would force `migrate -> orm` and invert the ladder. Changed to
  `defineConfig({ dialect, snapshot: createSchemaSnapshot(schema), … })`, with
  an explicit "do not accept raw `schema`" rule. SQL-first mode omits `snapshot`
  entirely (zero ORM involvement), preserving migrate's independent value.
- **`orm.md` — designated the snapshot type the single source of truth.** It was
  duplicated verbatim in `orm.md` and `migrate.md` (guaranteed to drift).
  Documented that one place owns it and the other imports it.
- **`rootware-roadmap.md` — added "Enforce the ladder mechanically."** The fact
  that an `orm -> migrate` edge sat in the docs but never in code (and that
  per-package roadmaps scheduled shipped features) shows convention-only
  enforcement fails. Added a recommended `deno task lint:graph` that asserts the
  direction table via `deno graph --json` per package, including the "no
  non-test module imports `@rootware/testing`" rule.

### Status reconciliation (docs were behind the code)

- **`rootware-roadmap.md` — added a top-level note** listing the packages that
  ship more than a bare foundation, so the per-package gates below stop
  scheduling done work.
- **`README.md` — clarified the ladder is build order, not imports**, and that
  migrate/orm are siblings linked only by the snapshot.
- **`orm.md` — the query builder already exists.** `sql` tag, the full predicate
  set (`eq, ne, gt, gte, lt, lte, like, isNull, isNotNull, and, or, not`),
  `select`/`insert`/`update`/`delete` builders, `InferSelect`/`InferInsert`, and
  `memoryOrmDriver` all ship in `v0.1`. Retargeted the "First 10 chunks" and
  Chunk 9 to verify-and-document those, and pointed the real near-term work at
  the snapshot contract, a concrete `@db/postgres` driver, and Postgres-specific
  column types.
- **`migrate.md` — documented the real `v0.1` shape: a programmatic in-memory
  engine with up/**down** rollback**, not the file+CLI tool the prose led with.
  `defineMigration`/`createMigrator`/`MigrationStore`/`memoryMigrationStore`,
  checksums, and `getRollbackMigrations()` ship today. Framed the
  `defineConfig` + CLI
  - Postgres-store workflow as a layer on top of that engine, not a rewrite.
- **`session.md` — `requireActor`, `cacheSessionStore`, crypto session ids, and
  secure cookie defaults (`HttpOnly`/`Secure`/`SameSite=Lax`) already ship.**
  The roadmap scheduled `requireActor` for v0.4 and the cache store for v0.3;
  both are done. Retargeted v0.3 to docs/hardening and v0.4 to the genuine gaps
  (rotation + CSRF).
- **`cache.md` — `has()` and `getOrSet()` already ship** (roadmap scheduled
  `getOrSet` for v0.2). Noted the v0.2 chunks are mostly verify-and-test.
- **`env.md` — the v0.2 typed-env spine already ships** (`defineEnv`, `env`
  builder, `fromRecord`, `readDenoEnv`, `redactEnv`/`isSecretKey`,
  `generateEnvExample`, parsers). Noted the real work is v0.3 DX and v0.4 file
  loading.
- **`http.md` — client, retry, timeout, and a test transport already ship.**
  Noted `createMockFetch` lives in-core (the "fakes live in testing" line is
  aspirational), and that header/secret redaction is the real gap and must
  precede logger hooks.
- **`storage.md` — memory store, buckets, key safety, checksum, and upload
  constraints (`maxSizeBytes`, required content type) already ship.** Noted the
  local filesystem adapter and signed URLs are the real gaps.
- **`jobs.md` — the memory job spine already ships** (`defineJob`,
  `createJobQueue`, `memoryJobStore`, worker, retry/backoff). `cache`/`orm` are
  not yet wired, which is correct; durable adapters are the real forward work.
- **`testing.md` — the core helpers already ship** (`createTestContext`,
  `createFakeClock`, `testEnv`, `testLogger`, `assertLog`, fixtures) and the
  package is dependency-clean (errors/env/log only).

### API naming aligned to the published exports

- **`orm.md` — `pgTable` → `defineTable`, per-type imports → the `columns`
  factory.** The published schema API is
  `defineTable("users", { id: columns.uuid()… })` with a single dialect-generic
  entrypoint and a `SqlDialect` field, not `pgTable` + `/pg`/`/postgres`
  subpaths. Updated all examples (canonical imports, Schema DSL, Chunk 2, Chunk
  9, the SQLite chunk, First-10). Recorded the decision: keep
  `defineTable`/`columns` canonical (it's published); a Drizzle-style
  `pgTable`/`/pg` may be added later as an additive alias.
- **`orm.md` — fixed column modifiers.** No `.defaultRandom()` /
  `.defaultNow()`; the real API is `.default(value | () => value)`, plus
  `.named()`, `.nullable()`, `.optional()`, `.unique()`,
  `.references(table, column)`.
- **`orm.md` — Chunk 11 reframed** to _extend_ the existing generic `columns`
  factory (`text, integer, number, boolean, json, date, timestamp, uuid`) with
  Postgres types (`varchar`, `bigint`, `jsonb`) rather than implement columns
  from scratch, and to resolve `json` vs `jsonb` naming.
- **`storage.md` — corrected the public contract** from `Storage` to the shipped
  `StorageClient`: body type is
  `StoragePutBody = Blob | Uint8Array | ArrayBuffer |
  string` (not `BodyInit`,
  not a stream), and `list` returns `StorageListResult` (not `AsyncIterable`).
  Flagged that the "streaming-friendly API" goal is unrealized.
- **`cache.md` — corrected the public contract** from `Cache` to the shipped
  `CacheClient`, adding `has()` and `getOrSet()`.
- **`errors.md` — corrected the `RootwareError` class sketch** to match the
  code: `override cause: unknown` (mutable, cooperates with ES2022
  `Error.cause`) instead of a conflicting `readonly cause?`, and `status`
  non-optional. Noted `toJSON()` is expose-respecting and never emits `stack`.

### Security / safety gaps scheduled (real, in code)

- **`session.md` — CSRF given a home.** It was an unscheduled non-goal. Added a
  security-model rule (Lax allows top-level cross-site GET, so Lax alone is not
  full CSRF protection), interim guidance (no state-changing GETs;
  framework-level check), and scheduled a real defense (double-submit token or
  origin/`Sec-Fetch-Site`) into the retargeted v0.4. Also documented _why_
  `SameSite=Lax` (not Strict) is the correct default here — it keeps the
  WhatsApp share-and-return loop logged in.
- **`session.md` — rotation/fixation** moved from a vague "plan before v1" into
  the concrete v0.4 milestone (rotate session id on login).
- **`migrate.md` — Rollback (down migrations) documented as first-class** with
  safety rules (down obeys the same destructive guard, updates the journal,
  checksum applies to down SQL, production rollback needs a flag). Removes the
  forward-only implication that contradicted the code.
- **`migrate.md` — checksum normalization decision** added to Chunk 12: the
  engine's checksum is deterministic but non-cryptographic, and file-mode
  hashing must normalize EOL/trailing whitespace or a Windows checkout trips
  `check` on every applied `.sql`.

### Cross-doc consistency

- **`log.md` — fixed the Pino-entry self-contradiction.** §10.1 imported `pino`
  from the package root, which §6.1/§10.3 forbid during `0.x`. Changed to
  `jsr:@rootware/log/compat/pino` and added a note.
- **`log.md` — clarified the `errorKey` default is `error`** (the `err` value in
  the options block is the Pino-compat value; there is no `errorKey` option in
  `v0.1`).
- **`log.md` / `errors.md` — flagged the `serializeError` name clash.** Both
  packages export `serializeError` (errors = safe/no-stack; log = with-stack).
  Documented the collision and the fix (rename log's or have it delegate to
  errors').
- **`errors.md` — `ErrorSeverity` documented as metadata-only**, a subset of
  log's levels (no `trace`/`silent`), and _not_ a log-level driver — so logging
  a `severity:"warn"` error via `logger.error` is not a contradiction.
- **`migrate.md` / `orm.md` — dialect-enum mismatch flagged.** Runtime
  `SqlDialect` is `"postgres" | "sqlite" | "mysql" | "generic"`; the snapshot
  shape lists `"postgres" | "sqlite" | "libsql" | "turso"`. Both docs now
  require these be reconciled (one owner) before `createSchemaSnapshot` ships.
- **`adapters.md` — declared `@rootware/hono` the single home for Hono
  middleware**, resolving the `@rootware/hono` vs `@rootware/log/hono`
  ambiguity.

---

### Open decisions surfaced (flagged, not changed)

These need a call from you; the docs now point at them rather than papering over
them:

1. ~~Snapshot type ownership.~~ **Decided: the `@rootware/schema` leaf owns the
   type; orm produces, migrate consumes.** The current package plan lives in
   `packages/schema/ROADMAP.md`; the interface was removed from
   `orm.md`/`migrate.md`. The `@rootware/schema` package now exists.
2. Dialect union: are `mysql`/`generic` real snapshot targets, and are
   `libsql`/`turso` distinct dialects or `sqlite` + an adapter tag?
3. `serializeError` collision: rename log's, or delegate to errors'.
4. `createMockFetch`: keep in `@rootware/http` core or move to
   `@rootware/http/testing`.
5. Whether a Drizzle-style `pgTable`/`/pg` alias is worth adding over
   `defineTable`.

### Not touched

`template.md` (it is a template, nothing to reconcile) and `adapters.md` beyond
the Hono note (its packages have no shipped code to mismatch yet).
