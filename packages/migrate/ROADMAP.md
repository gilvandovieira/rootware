# @rootware/migrate Product Plan

## Status

`@rootware/migrate` already exists as part of the Rootware package workspace.
This plan treats it as a real product, not as an implementation detail of
`@rootware/orm`.

The package should become the migration engine for Rootware database tooling
while still allowing users to manage plain SQL migrations without adopting every
part of `@rootware/orm`.

> **Current `v0.1` surface (reconciled with source).** The published package is
> a programmatic, in-memory migration _engine_, not yet the file + CLI tool
> described later in this plan. It exports `defineMigration`,
> `defineSqlMigration`, `createMigrator`, `MigrationStore` /
> `memoryMigrationStore`, `createMigrationPlan`, `calculateMigrationChecksum` /
> `assertMigrationChecksum`, and the applied/pending/rollback helpers. Two
> things differ from the prose below and are intentional, not bugs:
>
> - **Rollback exists.** `MigrationDirection` is `"up" | "down"`, migrations may
>   declare a `down` step, and `Migrator.down()` / `getRollbackMigrations()` are
>   shipped. This plan is therefore **not** forward-only; the safety section
>   below was rewritten to describe how `down` and the destructive-change guard
>   work together rather than implying rollback is impossible.
> - **The product has two layers.** The programmatic engine above is the core.
>   The `defineConfig` + CLI + SQL-folder + Postgres-store workflow in the v0.2
>   roadmap is a thin layer _on top of_ that engine (config loader, folder
>   reader, a Postgres `MigrationStore`/`MigrationDriver`, and CLI argument
>   parsing), not a rewrite. The `createMigrator` / `MigrationStore` /
>   `MigrationDriver` contracts are the seam the CLI builds on.
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
- SQLite, libSQL, and Turso on the roadmap.
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

Expected imports:

```ts
import { defineConfig } from "@rootware/migrate";
```

Expected CLI usage:

`@rootware/migrate/cli` is a planned subpath. It is not exported until a real
CLI file and tests exist.

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
- `@rootware/log` — **type-only** (optional injected `Logger`). In `v0.1`,
  `packages/migrate/mod.ts` imports only `@rootware/errors` and `@rootware/log`
  (type).
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
importantly, it must not import `@rootware/orm` at all. In the published `v0.1`,
`packages/migrate/mod.ts` imports only `@rootware/errors` and `@rootware/log`,
and that boundary must be preserved. The application is the integration point:
it calls `orm.createSchemaSnapshot(schema)` (an ORM API, not yet built) and
passes the resulting plain snapshot object into the migrate config.

Example config (snapshot is prebuilt by the app, so migrate never imports the
ORM):

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

## v0.2 — SQL-first Postgres migration spine

Goal: create the first complete SQL-first migration workflow for Postgres.

A user should be able to:

```txt
load config -> read migration folder -> create journal -> detect pending SQL files -> run migrations -> view status
```

This release should not depend on `@rootware/orm` being complete.

### Chunk 5 — Config loader

Goal: support `rootware.migrate.ts`.

Tasks:

- Define `defineConfig`.
- Load config file.
- Validate config shape.
- Support `dialect`.
- Support `out`.
- Support `driver`.
- Allow `snapshot` to be optional. SQL-first mode omits `snapshot` entirely;
  ORM-integrated mode receives a prebuilt `RootwareSchemaSnapshot` (imported
  from `@rootware/schema`). `defineConfig` must never accept raw ORM `schema`
  objects — doing so would force a `migrate -> orm` import.

Acceptance:

- CLI can load config from project root.

### Chunk 6 — CLI skeleton

Commands:

```txt
generate
migrate
status
check
baseline
repair
```

Tasks:

- Parse command.
- Load config.
- Print useful errors.
- Exit with correct status codes.
- Make unimplemented commands fail explicitly instead of silently doing nothing.

Acceptance:

- Each command runs and fails gracefully when config is missing.

### Chunk 7 — Migration folder reader

Goal: discover manual SQL migrations.

Tasks:

- Read the configured migration folder.
- Ignore `meta/` files for SQL execution.
- Sort migration files deterministically.
- Validate migration file naming.
- Reject duplicate ids.
- Reject unsupported file extensions.

Acceptance:

- A folder of plain `.sql` migration files produces a deterministic migration
  list.

### Chunk 8 — Postgres migration journal table

Goal: track applied migrations.

Tasks:

- Create journal table if missing.
- Store migration id.
- Store migration name.
- Store checksum.
- Store applied timestamp.
- Store optional tool version.
- Store optional execution duration.

Acceptance:

- Journal table exists after the first migration run.

### Chunk 9 — Pending migration detection

Goal: compare local migration files with the database journal.

Tasks:

- Read migration files.
- Read applied migration rows.
- Detect pending migrations.
- Detect unknown applied migrations.
- Detect checksum mismatch.
- Return structured status data.

Acceptance:

- The migrator knows exactly which SQL files need to run before executing
  anything.

### Chunk 10 — Postgres SQL migration runner

Goal: apply pending SQL migrations.

Tasks:

- Execute pending SQL files in order.
- Insert journal row after successful execution.
- Skip applied migrations.
- Stop on first failure.
- Preserve useful error context.

Acceptance:

- Running `migrate` twice is safe.

### Chunk 11 — Status command

Goal: show migration state.

Output should show:

- Applied migrations.
- Pending migrations.
- Checksum mismatches.
- Unknown applied migrations.
- Current database target.

Acceptance:

- User can understand database migration state without reading the DB manually.

### Chunk 12 — Checksum validation

Tasks:

- Hash migration files.
- Decide and document the normalization before hashing: the engine's
  `calculateMigrationChecksum` is a deterministic **non-cryptographic** hash
  (fine for detecting accidental edits, not a tamper-proof signature). For
  file-based migrations, normalize line endings (CRLF/LF) and trailing
  whitespace before hashing, or a Windows contributor will trip `check` on every
  applied `.sql` for a pure line-ending difference.
- Compare with journal checksums.
- Fail on modified applied migrations.
- Print the migration id and file path that failed validation.

Acceptance:

- Edited applied migration fails loudly.
- The same `.sql` file checked out on Windows and Linux produces the same
  checksum.

### Chunk 13 — Dry-run mode

Command:

```sh
deno task db:migrate --dry-run
```

Tasks:

- Print pending migrations.
- Print SQL files that would run.
- Do not modify database.
- Do not write journal rows.

Acceptance:

- Users can preview migration execution safely.

### Chunk 14 — Baseline command

Goal: adopt an existing database without replaying migrations.

Tasks:

- Create journal table if missing.
- Record a baseline migration id.
- Store checksum and tool version metadata.
- Support SQL-first baseline without ORM schema snapshots.
- Optionally attach current ORM snapshot when schema metadata is available.

Acceptance:

- Existing projects can start using `@rootware/migrate` without dropping or
  recreating schema objects.

### Chunk 15 — Repair command

Goal: provide an explicit recovery path for intentional checksum reconciliation.

Tasks:

- Require a target migration id.
- Print old checksum and new checksum.
- Require explicit confirmation or force flag.
- Update only the requested journal row.
- Record repair metadata where possible.

Acceptance:

- Checksum recovery is possible, explicit, auditable, and never silent.

## v0.3 — ORM-generated migrations and hardening

Goal: add generated migrations and production-grade safety on top of the
SQL-first runner.

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

## v0.4 — SQLite local migrations

Goal: support local SQLite apps and test databases.

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

## v0.5 — libSQL migrations

Goal: support SQLite-compatible remote/serverless databases.

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

## v0.6 — Turso migrations

Goal: support Turso as a hosted SQLite-family target.

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

## v0.7 — Sync-safe migration research

Goal: understand local-first/sync migration semantics before exposing stable
APIs.

### Chunk 33 — Sync migration constraints document

Document:

- Offline clients.
- Schema version negotiation.
- Conflict model.
- Tombstones.
- Generated IDs.
- Backward-compatible migrations.
- Forward-compatible migrations.

Acceptance:

- Sync support is designed before APIs are added.

### Chunk 34 — Sync-safe migration experiment

Build one experimental workflow:

```txt
examples/sync-safe-notes-migrations/
```

Acceptance:

- Research produces concrete constraints without contaminating stable APIs.

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

Do these first:

1. Audit published `v0.1`.
2. Define public package exports.
3. Add README product warning.
4. Create docs skeleton.
5. Implement `defineConfig` with an optional prebuilt `snapshot` for
   ORM-integrated mode. SQL-first mode omits `snapshot` entirely. `defineConfig`
   must not accept raw ORM `schema` objects.
6. Implement CLI skeleton.
7. Implement migration folder reader.
8. Implement Postgres migration journal table.
9. Implement pending migration detection.
10. Implement Postgres SQL migration runner.

After these are done, add status, checksum validation, dry-run, baseline,
repair, and only then ORM snapshot generation.

## Product rule

Every chunk must end with one of:

- A passing test.
- A generated SQL file.
- A successful migration run.
- A documented public contract.
- A failing safety check that protects the user.

`@rootware/migrate` should be conservative, inspectable, and boring. Migration
tooling is allowed to be powerful, but it must never be casual about data loss.
