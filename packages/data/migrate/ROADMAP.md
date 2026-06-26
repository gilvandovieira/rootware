# @rootware/migrate Product Plan

## Status

> **API freeze (`0.9.0`):** the public surface is audited and frozen to reduce
> churn toward `1.0`. The package stays **experimental** until it has real
> consumers — breaking changes remain possible even at `1.0`.

`@rootware/migrate` already exists as part of the Rootware package workspace.
This plan treats it as a real product, not as an implementation detail of
`@rootware/orm`. Older version sections are historical planning notes; the
status block below is the current v0.9 source-of-truth summary.

The package should become the migration engine for Rootware database tooling
while still allowing users to manage plain SQL migrations without adopting every
part of `@rootware/orm`.

> **Current v0.9 surface (reconciled with source).** The published package
> includes the programmatic migration engine, schema-diff helpers, file
> workflow, and SQL-first CLI subpath. It exports `defineMigration`,
> `defineSqlMigration`, `createMigrator`, `MigrationStore` /
> `memoryMigrationStore`, `createMigrationPlan`, `calculateMigrationChecksum` /
> `assertMigrationChecksum`, and the applied/pending/rollback helpers. Three
> things differ from older prose below and are intentional, not bugs:
>
> - **Rollback exists.** `MigrationDirection` is `"up" | "down"`, migrations may
>   declare a `down` step, and `Migrator.down()` / `getRollbackMigrations()` are
>   shipped. This plan is therefore **not** forward-only; the safety section
>   below was rewritten to describe how `down` and the destructive-change guard
>   work together rather than implying rollback is impossible.
> - **The product has two layers.** The programmatic engine is the root import.
>   Database execution lives under `@rootware/migrate/postgres`,
>   `@rootware/migrate/sqlite`, `@rootware/migrate/libsql`, and
>   `@rootware/migrate/turso`. The `defineConfig` + SQL-folder workflow and the
>   `@rootware/migrate/cli` subpath now ship as a thin layer on top of those
>   contracts, not a rewrite.
> - **Schema snapshots now have a metadata seam.** `defineSchemaMigrationPlan`
>   accepts prebuilt `RootwareSchemaSnapshot` values and validates/normalizes
>   them for future diffing. It does not generate SQL and it does not import
>   `@rootware/orm`.

## Product thesis

`@rootware/migrate` is a JSR-native, Deno-first database migration toolkit.

It should provide:

- SQL-first migration files.
- Schema snapshot support.
- Migration generation.
- Migration execution.
- Migration journal.
- Drift checks.
- CI-friendly validation.
- Postgres first.
- PostgreSQL, SQLite, libSQL, and Turso execution subpaths.
- Clean integration with `@rootware/orm`.
- Safe handling of destructive changes.

The package should be usable in two modes:

1. SQL-first mode, where users write migration SQL manually and
   `@rootware/migrate` handles journal, execution, status, and checks.
2. ORM-integrated mode, where migrations are generated from `@rootware/orm`
   schema snapshots.

SQL-first mode should work before ORM-generated migrations are complete. That
gives `@rootware/migrate` independent product value and prevents the migration
tool from being blocked by ORM type-system work.

## Canonical package

```ts
jsr:@rootware/migrate
```

Current root imports:

```ts
import {
  createMigrator,
  defineSqlMigration,
  memoryMigrationStore,
} from "@rootware/migrate";
```

Current execution subpaths include PostgreSQL, SQLite, libSQL, and Turso:

```ts
import { createPgMigrator } from "@rootware/migrate/postgres";
import { createSqliteMigrator } from "@rootware/migrate/sqlite";
import { createLibsqlMigrator } from "@rootware/migrate/libsql";
import { createTursoMigrator } from "@rootware/migrate/turso";
```

Current CLI usage:

```sh
deno run -A jsr:@rootware/migrate/cli generate
deno run -A jsr:@rootware/migrate/cli migrate
deno run -A jsr:@rootware/migrate/cli status
deno run -A jsr:@rootware/migrate/cli check
deno run -A jsr:@rootware/migrate/cli baseline
deno run -A jsr:@rootware/migrate/cli repair
```

Convenient `deno.json` tasks:

```json
{
  "tasks": {
    "db:generate": "deno run -A jsr:@rootware/migrate/cli generate",
    "db:migrate": "deno run -A jsr:@rootware/migrate/cli migrate",
    "db:status": "deno run -A jsr:@rootware/migrate/cli status",
    "db:check": "deno run -A jsr:@rootware/migrate/cli check",
    "db:baseline": "deno run -A jsr:@rootware/migrate/cli baseline",
    "db:repair": "deno run -A jsr:@rootware/migrate/cli repair"
  }
}
```

## Dependencies (runtime vs example/dev)

### Runtime imports

- `@rootware/errors` — `MigrateError` and the typed migration errors (value
  import).
- `@rootware/log` — **type-only** (optional injected `Logger`).
- `@rootware/schema` — **type-only**, for the `RootwareSchemaSnapshot` it
  consumes. A leaf import; does not couple migrate to orm.

### Example / dev-only imports

- `@rootware/env` — examples only (`DATABASE_URL` and related config); not a
  runtime dependency.
- `@rootware/orm` — **examples only**: the application's migrate config calls
  `orm.createSchemaSnapshot(schema)` and passes the plain result to migrate. The
  `@rootware/migrate` package itself never imports `@rootware/orm`.
- `@rootware/testing` — tests only.

### Disallowed

- `@rootware/orm` as a package-level import — migrate and orm are siblings;
  migrate only ever receives a prebuilt snapshot (whose type comes from
  `@rootware/schema`).
- Database driver SDKs in the core beyond the configured migration driver.

## Relationship with @rootware/orm

`@rootware/migrate` owns migrations. `@rootware/orm` owns runtime schema and
query behavior.

`@rootware/orm` should expose serializable schema metadata. `@rootware/migrate`
should consume that metadata through a stable snapshot contract.

The migration package should not reach into private ORM internals — and, just as
importantly, it must not import `@rootware/orm` at all. The current `mod.ts`
imports `@rootware/errors`, `@rootware/log`, and `@rootware/schema`; that
sibling boundary must be preserved. The application is the integration point: it
calls `orm.createSchemaSnapshot(schema)` and passes the resulting plain snapshot
object into the migrate config.

Planned v0.3+ config (snapshot is prebuilt by the app, so migrate never imports
the ORM):

```ts
// rootware.migrate.ts
import { defineConfig } from "@rootware/migrate";
import { createSchemaSnapshot } from "@rootware/orm";
import * as schema from "./src/db/schema.ts";

export default defineConfig({
  dialect: "postgres",
  // A serializable RootwareSchemaSnapshot, NOT the raw ORM table objects.
  snapshot: createSchemaSnapshot(schema),
  out: "./migrations",
  driver: {
    kind: "postgres",
    url: Deno.env.get("DATABASE_URL")!,
  },
});
```

Do **not** make `defineConfig` accept raw `schema` (ORM table objects) and call
`createSchemaSnapshot` internally — that would force `@rootware/migrate` to
import `@rootware/orm` and create the `migrate -> orm` edge the workspace
forbids. SQL-first mode omits `snapshot` entirely and works with zero ORM
involvement.

## Responsibilities

`@rootware/migrate` owns:

- Migration config loading.
- Schema snapshot **consumption** (validation of a prebuilt snapshot — _not_
  creation; the ORM creates it and `@rootware/schema` owns the type).
- Snapshot persistence/storage.
- Schema diffing.
- SQL migration generation.
- Migration file naming.
- Migration journal table.
- Migration execution.
- Migration status reporting.
- Drift checks.
- Destructive-change safety.
- Dialect-specific migration behavior.

`@rootware/migrate` does not own:

- The snapshot type (owned by `@rootware/schema`).
- Snapshot creation from table metadata (owned by `@rootware/orm`).
- ORM query builder.
- Runtime table APIs.
- Runtime insert/select/update/delete APIs.
- Application database client lifecycle beyond migration execution.
- Production backup systems.

## Migration lifecycle

The SQL-first lifecycle is:

```txt
SQL migration files -> journaled execution -> status/check
```

The ORM-integrated lifecycle is:

```txt
schema.ts -> schema snapshot -> diff -> SQL migration -> journaled execution -> drift check
```

A typical workflow:

```sh
deno task db:generate
deno task db:migrate
deno task db:check
```

The package should also support manual SQL migrations:

```txt
migrations/
  0001_create_users.sql
  0002_add_posts.sql
  0003_add_user_indexes.sql
```

Manual SQL migrations should still be journaled and checked.

## Snapshot contract

The schema snapshot is serializable, explicit, and versioned. Its **type is not
defined here** — it is owned by the dependency-free `@rootware/schema` leaf
package (see `../schema/ROADMAP.md`). `@rootware/migrate` imports the type and
consumes prebuilt snapshots; it does not redeclare the shape and does not import
`@rootware/orm`.

```ts
import type { RootwareSchemaSnapshot } from "@rootware/schema";
```

`@rootware/migrate`'s job for this contract is **consumption**: validate the
snapshot (version + shape, via `@rootware/schema`'s guards), persist committed
snapshot files, diff previous vs current, and generate SQL.

Rules:

- The snapshot format version is owned and bumped by `@rootware/schema`; migrate
  validates it on ingest and fails loudly on an unsupported version.
- Snapshot files should be committed.
- Diffs compare previous snapshot to current snapshot.
- Migration files should be SQL, not opaque generated code.
- Generated SQL should be inspectable and editable.
- The accepted `dialect` values are whatever `@rootware/schema`'s
  `RootwareDialectName` union defines (the open
  `mysql`/`generic`/`libsql`/`turso` question is tracked in
  `../schema/ROADMAP.md`, not here). Migrate rejects dialects it has no
  generator for.

## Migration file convention

Default folder:

```txt
migrations/
```

Default files:

```txt
migrations/
  0001_initial.sql
  0002_add_users.sql
  0003_add_posts.sql
  meta/
    0001_snapshot.json
    0002_snapshot.json
    0003_snapshot.json
    journal.json
```

The exact layout can change before v1, but the product should converge on a
stable, documented convention.

## Migration journal

Each database should have a migration journal table.

Default Postgres table:

```sql
CREATE TABLE IF NOT EXISTS "rootware_migrations" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "checksum" text NOT NULL,
  "applied_at" timestamptz NOT NULL DEFAULT now()
);
```

The journal should track:

- Migration id.
- Migration name.
- Migration checksum.
- Applied timestamp.
- Optional execution duration.
- Optional tool version.

Rules:

- Applied migrations must not be silently modified.
- Checksum mismatch should fail loudly.
- Running migrations twice should be safe.

## Baseline and repair model

Migration tooling must support adoption and recovery, not only greenfield
projects.

### Baseline

`baseline` records an existing database state as the starting point without
replaying historical migrations.

Use cases:

- Adopting `@rootware/migrate` in a project with an existing schema.
- Marking the current production schema as migration `0001_baseline`.
- Starting journal tracking without dropping or recreating existing objects.

Rules:

- `baseline` must be explicit.
- `baseline` must not modify application tables by default.
- `baseline` should create the migration journal if needed.
- `baseline` should record tool version and checksum metadata.
- ORM snapshot output may be attached when available, but SQL-first baseline
  must work without the ORM.

### Repair

`repair` reconciles the local migration metadata and database journal after an
intentional correction.

Use cases:

- A checksum mismatch was reviewed and accepted.
- A failed local migration was manually corrected during development.
- Migration metadata needs to be regenerated after a controlled recovery.

Rules:

- `repair` must be explicit and noisy.
- `repair` should require the target migration id.
- `repair` should never silently rewrite multiple journal rows.
- `repair` should print old and new checksums.
- Production repair should require a force flag or equivalent safety mechanism.

## Safety model

Migration tooling must be conservative by default.

Safe by default:

- Create table.
- Add nullable column.
- Add column with default when dialect supports it safely.
- Create index.
- Add unique constraint when data is valid.
- Add foreign key when data is valid.

Potentially unsafe:

- Drop table.
- Drop column.
- Rename table.
- Rename column.
- Change column type.
- Add not-null column without default.
- Add unique constraint on dirty data.

Unsafe changes require explicit confirmation or flags.

Possible flags:

```sh
--allow-destructive
--allow-drop-table
--allow-drop-column
--allow-unsafe-alter
```

The default behavior should be to generate a commented warning instead of
executing destructive SQL automatically.

### Rollback (down migrations)

Rollback is supported in the engine today (`Migrator.down()`, per-migration
`down` steps, `getRollbackMigrations()`), so this plan treats `down` as a
first-class part of the contract rather than a non-goal.

Rules:

- A `down` step is optional. SQL-first migrations may omit it; generated
  migrations should emit a best-effort `down` and mark it for review when the
  inverse is ambiguous (for example, a dropped column cannot restore its data).
- Running `down` is itself a destructive operation and must obey the same
  `--allow-destructive` style guard as forward destructive changes. `down` must
  never run in a way that silently loses data.
- `down` updates the journal by removing the rolled-back migration's row (or
  marking it reverted), and checksum validation applies to the `down` SQL just
  as it does to the `up` SQL.
- Production rollback should require an explicit flag, mirroring `repair`.

## Dialect strategy

### Postgres first

Postgres is the first serious target because it gives the product credibility
for production server apps.

Initial Postgres support:

- Create table.
- Add column.
- Create index.
- Add unique constraint.
- Add foreign key.
- Migration journal.
- Advisory lock or equivalent migration lock.
- Transactional migration execution where possible.

### SQLite local

SQLite support should be added after the Postgres spine is stable.

SQLite migration limitations must be explicit. SQLite is not small Postgres.

Initial SQLite support:

- Create table.
- Add column.
- Create index.
- Limited alter table support.
- In-memory database support for tests.
- File database support for local apps.

### libSQL

libSQL should build on the SQLite-family dialect but have its own adapter and
deployment caveats.

Initial libSQL support:

- Remote URL.
- Auth token.
- SQL migration execution.
- Compatibility documentation.

### Turso

Turso should be treated as a hosted SQLite-family target.

Initial Turso support:

- Turso database URL.
- Auth token.
- Deno Deploy example.
- Edge/serverless behavior notes.
- Migration safety notes.

## Release roadmap

## v0.1.x — Published foundation cleanup

Goal: make the current package state clear and safe to iterate.

### Chunk 1 — Audit current package

Tasks:

- List current exports.
- List current CLI entrypoints.
- List public types.
- List accidental internals.
- Check README status.
- Check examples status.
- Check tests status.
- Check whether package depends on npm.
- Verify clean install with `deno add jsr:@rootware/migrate`.

Output:

```txt
docs/internal/migrate-v0.1-audit.md
```

Acceptance:

- A contributor can read the audit and know what is currently public.

### Chunk 2 — Define package surface

Target exports:

```ts
import { defineConfig } from "@rootware/migrate";
import { loadConfig } from "@rootware/migrate/config";
import { createMigrator } from "@rootware/migrate/core";
```

CLI:

```sh
deno run -A jsr:@rootware/migrate/cli generate
deno run -A jsr:@rootware/migrate/cli migrate
deno run -A jsr:@rootware/migrate/cli status
deno run -A jsr:@rootware/migrate/cli check
deno run -A jsr:@rootware/migrate/cli baseline
deno run -A jsr:@rootware/migrate/cli repair
```

Acceptance:

- Public imports are documented and internal files are hidden.

### Chunk 3 — Add README product warning

Add:

```md
@rootware/migrate is currently pre-1.0. APIs are experimental, but the package
is intended as a real production-oriented migration toolkit for Deno and JSR
projects.
```

Acceptance:

- Users understand the package is real but pre-stable.

### Chunk 4 — Add documentation skeleton

Create:

```txt
docs/
  introduction.md
  quickstart.md
  config.md
  generating-migrations.md
  running-migrations.md
  migration-journal.md
  drift-checks.md
  postgres.md
  sqlite.md
  libsql.md
  turso.md
  safety.md
  baseline.md
  repair.md
  roadmap.md
```

Acceptance:

- Every major product area has a documentation placeholder.

## v0.2 — Programmatic migration engine

Goal: ship the dependency-clean migration engine that exists today.

A user should be able to:

```txt
define migrations -> plan applied/pending/rollback -> dry-run or execute through injected store/driver -> validate checksums -> accept schema snapshots
```

This historical release intentionally kept config loading, filesystem discovery,
and a CLI out of the root import. Those layers now ship outside the root import:
database execution is isolated in the database subpaths, and the SQL-folder
workflow ships under `@rootware/migrate/cli`.

### Chunk 5 — Migration definitions

Verify and document:

- `defineMigration`.
- `defineSqlMigration`.
- SQL and programmatic migration shapes.
- `MigrationDirection` with both `"up"` and `"down"`.
- `MigrationDriver` and `MigrationStore` as injectable contracts.

Acceptance:

- Applications can define ordered migrations without a config file or CLI.

### Chunk 6 — Migrator engine

Verify and document:

- `createMigrator`.
- `memoryMigrationStore`.
- `noopMigrationDriver`.
- `noopMigrator`.
- dry-run behavior.
- dirty-check behavior.
- rollback support through `Migrator.down()`.

Acceptance:

- The same migration list can be planned, dry-run, applied, and rolled back
  through injected store/driver implementations.

### Chunk 7 — Planning and state helpers

Verify and document:

- `createMigrationPlan`.
- applied/pending/rollback helpers.
- duplicate id rejection.
- deterministic sorting.
- applied migration metadata creation.

Acceptance:

- A caller can inspect migration state before executing any migration body.

### Chunk 8 — Checksums and safety

Verify and document:

- `calculateMigrationChecksum`.
- `assertMigrationChecksum`.
- normalization of line endings (CRLF/LF).
- normalization of trailing whitespace.
- checksum mismatch failures by default.

Acceptance:

- Equivalent migration text checked out on Windows and Linux produces the same
  checksum, while materially edited applied migrations fail loudly.

### Chunk 9 — Schema snapshot metadata seam

Verify and document:

- `defineSchemaMigrationPlan`.
- acceptance of prebuilt `RootwareSchemaSnapshot` values from
  `@rootware/schema`.
- validation/normalization through `@rootware/schema`.
- no import from `@rootware/orm`.

Acceptance:

- `@rootware/migrate` can consume serializable schema snapshots without knowing
  how an application produced them.

### Chunk 10 — Tests and docs

Verify the package tests cover:

- migration definition validation.
- migration planning.
- dry-runs.
- rollback selection.
- checksum normalization.
- memory store behavior.
- schema snapshot ingestion.

Acceptance:

- `deno task ci` and `deno task publish:dry:migrate` pass.

## v0.3 — SQL-first workflow, generated migrations, and hardening — **done (`0.3.0`)**

> **Done in `0.3.0`.** Snapshot ingestion (`defineSchemaMigrationPlan`, Chunk
> 16); snapshot diff + classification with destructive detection
> (`planSchemaChanges`, Chunks 17 + 23 — the structural diff lives in the
> dependency-free `@rootware/schema`); Postgres CREATE TABLE / ADD COLUMN
> generators that withhold destructive SQL (`generatePostgresCreateTable`,
> `generatePostgresUpStatements`, Chunk 18); readable filenames
> (`formatMigrationFilename`/`slugifyMigrationName`, Chunk 24); the injectable
> `MigrationFileSystem` with the file writer and folder reader/discovery
> (`buildMigrationFile`, `writeMigrationFile`, `readMigrationsDir`, Chunk 19);
> drift checking (`checkDrift`, Chunk 20); `defineConfig`; and the
> `@rootware/migrate/cli` subpath (`generate`/`migrate`/`status`/`check`/
> `baseline`/`repair`, with a pure parser + dependency-injected runner). The
> filesystem/live-DB parts — real file writing via `denoMigrationFileSystem`,
> transaction behavior (Chunk 21), and the full CLI generate→migrate→check
> workflow against real Postgres — are exercised by the opt-in integration suite
> (`integration/migrate_cli_test.ts`) on PostgreSQL 14–18. The PostgreSQL
> advisory **lock** (Chunk 22) is the one remaining hardening item.

Goal: add config/file/CLI workflow and generated migrations on top of the v0.2
programmatic engine and shipped PostgreSQL subpath.

This milestone absorbs the heavier workflow work that used to be listed under
v0.2:

- `defineConfig`.
- config loading from `rootware.migrate.ts`.
- CLI skeleton and command parsing.
- filesystem SQL migration discovery.
- migration folder reader.
- PostgreSQL history table hardening.
- PostgreSQL SQL runner hardening.
- status command.
- checksum checking for file-backed migrations.
- dry-run output for SQL files.
- baseline command.
- repair command.
- generated migration flow over the shipped PostgreSQL subpath.

A user should be able to:

```txt
app config builds snapshot (orm.createSchemaSnapshot) -> migrate receives plain snapshot -> diff -> generate SQL -> run migration -> check drift
```

The `orm.createSchemaSnapshot(schema)` call happens in the **application's**
migrate config, not inside `@rootware/migrate`. The migrate package only ever
sees the resulting plain, serializable snapshot object.

### Chunk 16 — Snapshot ingestion

Goal: consume a prebuilt, serializable schema snapshot (produced by the app via
`@rootware/orm`). `@rootware/migrate` must not import `@rootware/orm` or call
`createSchemaSnapshot` itself.

Tasks:

- Accept a prebuilt `RootwareSchemaSnapshot` from config or metadata helpers
  (the app built it).
- Validate and normalize the snapshot through `@rootware/schema`.
- Reject unsupported dialects once SQL generation is introduced.
- Do not read ORM table objects and do not import any ORM symbol.

Acceptance:

- A simple users table (whose snapshot the app produced) can be accepted as
  stable metadata through migrate's public API, with zero `@rootware/orm` import
  in `migrate`. SQL generation waits for the diff/generator chunks.

### Chunk 17 — Snapshot diff v1

Goal: compare previous and current schema snapshots.

Support:

- New table.
- New column.
- New index.
- New unique constraint.

Acceptance:

- Diff output is deterministic and testable.

### Chunk 18 — Postgres CREATE TABLE generator

Goal: generate valid SQL for new tables.

Example output:

```sql
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY,
  "email" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
```

Tasks:

- Compile table name.
- Compile column types.
- Compile primary key.
- Compile not-null.
- Compile defaults.

Acceptance:

- Generated SQL executes against Postgres.

### Chunk 19 — Migration file writer

Goal: write generated SQL to disk.

Tasks:

- Create migrations folder.
- Generate sequential migration id.
- Generate slug from migration name.
- Write `.sql` file.
- Write matching snapshot file.

Acceptance:

- `generate` creates migration SQL and snapshot metadata.

### Chunk 20 — Drift check

Goal: detect schema/migration mismatch.

Checks:

- Schema changed but no migration generated.
- Migration exists but snapshot missing.
- Snapshot exists but SQL missing.
- Pending migrations exist in CI.

Acceptance:

- `check` exits non-zero when migration state is inconsistent.

### Chunk 21 — Transaction behavior

Goal: make execution semantics explicit.

Postgres default:

- Run each migration in a transaction when possible.
- Allow opt-out for statements that cannot run in a transaction.

Acceptance:

- Transaction behavior is documented and tested.

### Chunk 22 — Migration lock

Goal: prevent concurrent migration execution.

Postgres strategy:

- Advisory lock or lock table.

Acceptance:

- Two migrators cannot safely apply the same migration concurrently.

### Chunk 23 — Destructive change warnings

Goal: prevent accidental data loss.

Tasks:

- Detect drop table.
- Detect drop column.
- Detect type changes.
- Require explicit unsafe flag.

Acceptance:

- Destructive SQL is never silently generated as normal migration SQL.

### Chunk 24 — Better generated migration names

Goal: readable migration files.

Examples:

```txt
0001_initial.sql
0002_create_users.sql
0003_add_posts.sql
0004_add_user_email_index.sql
```

Acceptance:

- Generated migration names are predictable and useful.

## v0.4 — SQLite local migrations — **done (`0.4.0`)**

Goal: support local SQLite apps and test databases.

Shipped in `0.4.0` (the `@rootware/migrate/sqlite` subpath):

- **SQLite DDL generator** (pure, CI-tested) — `generateSqliteCreateTable`,
  `generateSqliteColumnDefinition`/`generateSqliteColumnType` (snapshot kind →
  SQLite affinity: `TEXT`/`INTEGER`/`REAL`/`BLOB`; booleans as `INTEGER`,
  boolean defaults as `0`/`1`), `generateSqliteAddColumn`, and
  `generateSqliteUpStatements`. Like the Postgres generator, only additive
  changes (`CREATE TABLE`, `ADD COLUMN`) are emitted; destructive changes are
  withheld and returned separately (SQLite's `ALTER TABLE` is limited).
- **SQLite migration runner** —
  `createSqliteMigrator({ path | database |
  executor })` over the core
  migrator, with a SQLite-backed history store (`?` placeholders; `applied_at`
  as `TEXT`, `execution_ms` as `REAL`), single-connection
  `BEGIN`/`COMMIT`/`ROLLBACK`, idempotent re-runs, and rollback. `@db/sqlite` is
  imported lazily, so the package's fake-backed unit tests stay permission-free;
  real execution runs in the integration suite
  (`integration/migrate_sqlite_test.ts`) under `--allow-ffi`/`--allow-net`.
- **Snapshot reuse** — the shared `@rootware/schema` snapshot type drives both
  the Postgres and SQLite generators; `migrate` still never imports `orm`.

SQLite limitations (documented): no in-place column type changes or drops via
`ALTER TABLE` — those need the 12-step table rebuild and surface as
`destructive` changes rather than auto-generated SQL.

### Chunk 25 — SQLite snapshot support

Tasks:

- Add SQLite dialect to snapshot model.
- Support SQLite table metadata.
- Support SQLite column affinity.

Acceptance:

- SQLite schema produces valid snapshot files.

### Chunk 26 — SQLite SQL generator

Support:

- Create table.
- Add column.
- Create index.
- Create unique index.

Acceptance:

- Generated SQL executes against SQLite.

### Chunk 27 — SQLite migration runner

Support:

- File database.
- In-memory database.
- Migration journal table.
- Pending migration execution.

Acceptance:

- Running migrations twice is safe on SQLite.

### Chunk 28 — SQLite limitations documentation

Document:

- Limited alter table behavior.
- Table rebuild requirements.
- Type affinity.
- JSON behavior.
- Transaction behavior.

Acceptance:

- Users understand that SQLite migrations are not identical to Postgres
  migrations.

## v0.5 — libSQL migrations — **done (`0.5.0`)**

Goal: support SQLite-compatible remote/serverless databases.

Shipped in `0.5.0` — the `@rootware/migrate/libsql` subpath:

- **`createLibsqlMigrator({ url, authToken })`** over the bundled
  `@libsql/client` (lazy import), plus `createLibsqlMigrationDriver`/
  `createLibsqlExecutor` and an injectable structural `LibsqlLikeClient` for
  tests. Connects by URL with an auth token (Turso); executes migration SQL and
  reads/writes the migration journal.
- **SQLite SQL reuse** — libSQL is SQLite-compatible, so the migrator reuses the
  SQLite history store and the package re-exports the SQLite DDL generators
  (`generateSqliteCreateTable`, …) from `/libsql`.
- **Interactive transactions** — migrations run through the client's interactive
  `transaction("write")` handle (libSQL over HTTP is autocommit per request).
- **Lazy driver, permission-free tests** — fake-backed unit tests need no npm
  dependency; real execution runs in the integration suite
  (`integration/migrate_libsql_test.ts`) against a local libSQL server under
  `--allow-net` (apply → record → no-op → rollback).

Compatibility caveats (documented): libSQL behavior matches local SQLite for the
DDL/CRUD the migrator emits; remote execution adds network latency and the
autocommit-per-request model that the interactive transaction handle works
around.

### Chunk 29 — libSQL driver support

Tasks:

- Connect by URL.
- Support auth token.
- Execute migration SQL.
- Read/write migration journal.

Acceptance:

- Migration workflow works against libSQL target.

### Chunk 30 — libSQL compatibility checks

Tasks:

- Document SQLite compatibility assumptions.
- Document remote execution caveats.
- Add integration example.

Acceptance:

- Users know when libSQL behavior differs from local SQLite.

## v0.6 — Turso migrations — **done (`0.6.0`)**

Goal: support Turso as a hosted SQLite-family target.

Shipped in `0.6.0` — the `@rootware/migrate/turso` subpath. Turso is hosted
libSQL, so this is a thin, Turso-named entrypoint over the `0.5` libSQL
migrator:

- **`createTursoMigrator({ url, authToken })`** — delegates to
  `createLibsqlMigrator` but, for a real connection, validates that both a `url`
  and an `authToken` are present (`MIGRATION_INVALID` otherwise). Accepts an
  injected `client`/`executor` for permission-free tests; re-exports the SQLite
  DDL generators.
- **Migration journal** — inherited from the libSQL migrator (the SQLite history
  store applied verbatim); apply / re-apply (no-op) / rollback work against
  Turso over the `@libsql/client` HTTP path with interactive transactions.

Deno Deploy + Turso: the adapter runs on serverless runtimes (`--allow-net`);
deployment migration guidance lives with the example apps.

### Chunk 31 — Turso driver support

Tasks:

- Connect by Turso URL.
- Support auth token.
- Execute migration SQL.
- Track migration journal.

Acceptance:

- `@rootware/migrate` can apply migrations to Turso.

### Chunk 32 — Deno Deploy + Turso example

Example:

```txt
examples/deno-deploy-turso-migrations/
```

Acceptance:

- Deployment documentation includes migration workflow guidance.

## v0.7 — Sync-safe migration research — **done (`0.7.0`)**

Goal: understand local-first/sync migration semantics before exposing stable
APIs. This is a **research milestone**: it produces the constraints document
below and **adds no new public API** — `@rootware/migrate` ships nothing
sync-specific until the model is proven. (Version bumped to `0.7.0` only to keep
the milestone↔version mapping; the published surface is unchanged from `0.6.0`.)

### Sync migration constraints document

The constraints a future sync/local-first migration mode must satisfy:

- **Offline clients** — a client may be on an **old schema version** for a long
  time and reconnect later. Migrations must therefore be **forward-deployable**:
  the server schema can lead the client by ≥1 version, and the client must keep
  working until it catches up. Practically: avoid hard breaks; stage breaking
  changes across multiple releases (expand → migrate data → contract).
- **Schema version negotiation** — every synced row/table carries a schema
  version; client and server negotiate the **minimum common version** on
  connect. The migration journal must record a monotonic schema version that
  both ends compare. Downgrade is **not** supported — a client newer than the
  server is rejected, not silently coerced.
- **Conflict model** — sync is concurrent, so DDL must not assume a single
  writer. Migrations should be **idempotent** and **commutative where possible**
  (additive column adds, index creates). Last-write-wins (LWW) on row data
  requires an `updated_at`/version column on every synced table (see ORM v0.7).
  DDL conflicts (two clients adding the same column) resolve via
  `IF NOT EXISTS`/idempotent statements.
- **Tombstones** — rows are **soft-deleted** (a `deleted_at`/tombstone column),
  never hard-deleted, so a delete propagates to offline clients instead of
  resurrecting on the next sync. A migration that introduces a table to sync
  must add a tombstone column; a separate compaction job (not a migration) reaps
  old tombstones.
- **Generated IDs** — server-generated sequential IDs (`serial`/`bigserial`)
  break offline insert, because two offline clients would collide. Synced tables
  use **client-generatable** IDs (UUID/ULID) so an offline insert has a stable
  identity before it reaches the server. Migrations must not convert a synced
  table's PK to a server sequence.
- **Backward-compatible migrations** (new server, old client) — additive only:
  add nullable columns or columns with defaults, add tables, add indexes. Never
  drop/rename a column the old client still writes; never tighten a constraint
  the old client can violate.
- **Forward-compatible migrations** (old server, new client) — the new client
  must tolerate the server lacking its newest columns (read as absent/default)
  until the server migrates. Clients treat unknown columns as pass-through and
  missing columns as defaulted.

### Experiment outcome

The expand→migrate→contract pattern plus UUID PKs, `updated_at` LWW, and
tombstones is sufficient to make additive migrations sync-safe **without** new
migrate APIs: the existing `generateSqlite*`/`generatePostgres*` generators
already emit additive-only `up` statements and withhold destructive changes, so
a sync-safe app composes today's primitives. No stable API is added; a dedicated
`examples/sync-safe-notes-migrations/` workflow is deferred to the example apps.

## v1.0 — Stable migration product

Goal: make `@rootware/migrate` safe to recommend for production Deno apps.

The v1 contract should include:

- Stable config file shape.
- Stable CLI command names.
- Stable migration folder convention.
- Stable migration journal format.
- Stable snapshot format.
- Stable Postgres migration behavior.
- Documented SQLite/libSQL/Turso behavior if included before v1.
- Clear destructive-change policy.
- Clear semver policy.

## Cross-package integrations

### @rootware/orm

Consumes ORM schema metadata through a stable snapshot contract.

### @rootware/errors

Use for typed public errors:

- `MigrateError`
- `ConfigError`
- `SnapshotError`
- `DiffError`
- `MigrationExecutionError`
- `MigrationJournalError`
- `UnsafeMigrationError`

### @rootware/env

Use in examples to load `DATABASE_URL` and related configuration.

### @rootware/log

Optional integration later.

Possible events:

- Config loaded.
- Snapshot generated.
- Migration generated.
- Migration started.
- Migration applied.
- Migration skipped.
- Migration failed.
- Drift detected.

## First 10 implementation chunks

Do these first for the v0.2 engine release:

1. Audit published `v0.1`.
2. Verify root import and PostgreSQL subpath exports.
3. Add README product warning and v0.2 scope note.
4. Create docs skeleton.
5. Verify `defineMigration` and `defineSqlMigration`.
6. Verify `createMigrator`, `MigrationStore`, and `MigrationDriver`.
7. Verify planning helpers for applied, pending, and rollback migrations.
8. Verify dry-run, dirty-check, and checksum behavior.
9. Verify `defineSchemaMigrationPlan` accepts prebuilt snapshots without
   importing `@rootware/orm`.
10. Run `deno task ci` and `deno task publish:dry:migrate`.

After v0.2, implement `defineConfig`, the CLI skeleton, migration folder reader,
pending SQL-file detection, generated migration flow, and hardening around the
shipped PostgreSQL runner/history table.

## Product rule

Every chunk must end with one of:

- A passing test.
- A generated SQL file.
- A successful migration run.
- A documented public contract.
- A failing safety check that protects the user.

`@rootware/migrate` should be conservative, inspectable, and boring. Migration
tooling is allowed to be powerful, but it must never be casual about data loss.
