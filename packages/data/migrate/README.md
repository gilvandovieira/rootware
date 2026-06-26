# @rootware/migrate

Programmatic migration primitives for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

The root `@rootware/migrate` import contains migration planning and generic
migration primitives. Database-specific execution lives behind subpath exports
such as `@rootware/migrate/postgres`.

PostgreSQL execution is available through the package subpath. It does not
create a public `@rootware/postgres` package yet. That extraction waits until
the data core is proven in a real app.

## Install

```ts
import {
  createMigrator,
  defineSqlMigration,
  memoryMigrationStore,
} from "jsr:@rootware/migrate";
```

PostgreSQL execution is explicit:

```ts
import { createPgMigrator } from "jsr:@rootware/migrate/postgres";
```

## Example

```ts
const createUsers = defineSqlMigration({
  id: "001_create_users",
  up: "create table users (id text primary key)",
  down: "drop table users",
});

const migrator = createMigrator({
  migrations: [createUsers],
  store: memoryMigrationStore(),
});

await migrator.up({ dryRun: true });
```

## PostgreSQL

```ts
import { defineMigration } from "jsr:@rootware/migrate";
import { createPgMigrator } from "jsr:@rootware/migrate/postgres";

const migrator = await createPgMigrator({
  url: Deno.env.get("DATABASE_URL")!,
  logger,
});

await migrator.migrate({
  migrations: [
    defineMigration({
      id: "0001_create_users",
      up: [
        `create table users (
          id text primary key,
          name text not null
        )`,
      ],
    }),
  ],
});
```

## API

- `defineSqlMigration`
- `defineMigration`
- `createMigrator`
- `memoryMigrationStore`
- `createMigrationPlan`
- `defineSchemaMigrationPlan`
- `planSchemaChanges` — classify a snapshot diff into ordered changes (flags
  destructive ones)
- `formatMigrationFilename` / `slugifyMigrationName`
- `defineConfig`, `checkDrift`
- Filesystem workflow — `MigrationFileSystem`, `denoMigrationFileSystem`,
  `buildMigrationFile`, `writeMigrationFile`, `readMigrationsDir`,
  `nextMigrationSequence`
- `noopMigrationDriver`
- `noopMigrator`
- `@rootware/migrate/postgres` — `createPgMigrator`, `createPgMigrationDriver`,
  `createPgMigrationHistoryStore`, `createPgExecutor`, `createPgPool`, and the
  DDL generators `generatePostgresCreateTable`, `generatePostgresUpStatements`,
  `generatePostgresColumnType`, `quotePgIdent`
- `@rootware/migrate/sqlite` — `createSqliteMigrator`,
  `createSqliteMigrationDriver`, `createSqliteMigrationHistoryStore`,
  `createSqliteExecutor`, and the DDL generators `generateSqliteCreateTable`,
  `generateSqliteUpStatements`, `generateSqliteColumnType`, `quoteSqliteIdent`
- `@rootware/migrate/libsql` — `createLibsqlMigrator`,
  `createLibsqlMigrationDriver`, `createLibsqlExecutor` (libSQL/Turso over
  `@libsql/client`; re-exports the SQLite DDL generators)
- `@rootware/migrate/cli` — `parseMigrateCliArgs`, `runMigrateCli`,
  `createPostgresMigrateRunner`, `main`

## SQLite migrations (`0.4`)

`@rootware/migrate/sqlite` mirrors the Postgres subpath for SQLite. The DDL
generators are pure (snapshot kind → SQLite affinity), and
`createSqliteMigrator` runs migrations through the bundled `@db/sqlite` driver:

```ts
import { createSqliteMigrator } from "jsr:@rootware/migrate/sqlite";

const migrator = await createSqliteMigrator({ path: "./app.db" }); // or :memory:
await migrator.migrate({
  migrations: [{
    id: "0001_init",
    up: ["create table notes (id integer primary key)"],
  }],
});
```

The `@db/sqlite` driver uses FFI, so a real migrator needs `--allow-ffi` (plus
`--allow-read`/`--allow-write`/`--allow-net`); the driver is imported lazily, so
the pure DDL generators and an injected `executor`/`database` need no
permissions. Only additive changes are auto-generated; SQLite cannot drop or
retype columns in place (those surface as `destructive` for a manual table
rebuild).

## Generated migrations (`0.3`)

`@rootware/migrate` consumes a plain schema snapshot the **application** builds
(via `@rootware/orm`), so `migrate` never imports `orm`. `planSchemaChanges`
diffs two snapshots (using `@rootware/schema`'s `diffSchemaSnapshots`) into an
ordered, classified change list and surfaces destructive changes separately:

```ts
import { planSchemaChanges } from "jsr:@rootware/migrate";
import { generatePostgresUpStatements } from "jsr:@rootware/migrate/postgres";

const plan = planSchemaChanges({ from: previousSnapshot, to: currentSnapshot });
if (plan.destructive.length > 0) {
  // drop table/column or column type change — require an explicit unsafe flag
}

const { statements, destructive } = generatePostgresUpStatements(
  currentSnapshot,
  previousSnapshot,
);
// statements: additive CREATE TABLE / ALTER TABLE ADD COLUMN only.
// destructive: changes that are detected but never emitted as ordinary SQL.
```

The generators are pure (no driver, no connection), so they are fully unit
tested.

## SQL-first CLI (`0.3`)

`@rootware/migrate/cli` ships the file-based workflow on top of the generators.
Configure it with `rootware.migrate.ts` (default-exporting a `MigrateConfig`),
where the **app** builds the snapshot via `@rootware/orm` so `migrate` never
imports `orm`:

```ts
// rootware.migrate.ts
import { defineConfig } from "jsr:@rootware/migrate";
import { createSchemaSnapshot } from "jsr:@rootware/orm";
import * as schema from "./src/db/schema.ts";

export default defineConfig({
  dir: "./migrations",
  dialect: "postgres",
  snapshot: createSchemaSnapshot({ tables: schema }),
  databaseUrl: Deno.env.get("DATABASE_URL"),
});
```

```sh
deno run -A jsr:@rootware/migrate/cli generate add_users  # diff -> NNNN_*.sql + snapshot
deno run -A jsr:@rootware/migrate/cli migrate             # apply pending
deno run -A jsr:@rootware/migrate/cli status              # applied / pending
deno run -A jsr:@rootware/migrate/cli check               # non-zero on drift or pending
deno run -A jsr:@rootware/migrate/cli baseline            # mark existing as applied
deno run -A jsr:@rootware/migrate/cli repair              # re-record history checksums
```

The argument parser and command handlers are pure and database-agnostic (a
`MigrateCliRunner` is injected), so they unit-test without a database;
`denoMigrationFileSystem` and `createPostgresMigrateRunner` provide the real
filesystem and Postgres wiring, exercised end-to-end by the integration suite.
The only remaining hardening item is a PostgreSQL **advisory lock** for
concurrent migrators.

## Security

Dry-runs do not execute SQL or programmatic migration functions. Checksum
mismatches fail by default unless explicitly allowed.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

The root import does not include database adapters. PostgreSQL is available
through `@rootware/migrate/postgres` and SQLite through
`@rootware/migrate/sqlite`, each with its own driver. Advisory locks and
checksum repair workflows are still planned for later releases.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
