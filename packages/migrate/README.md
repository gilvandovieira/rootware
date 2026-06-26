# @rootware/migrate

Programmatic migration primitives for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

The root `@rootware/migrate` import contains migration planning and generic
migration primitives. Database-specific execution lives behind subpath exports
such as `@rootware/migrate/postgres`.

v0.3 adds PostgreSQL execution as a subpath integration. It does not create a
public `@rootware/postgres` package yet. That extraction waits until the data
core is proven in a real app.

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
- `noopMigrationDriver`
- `noopMigrator`
- `@rootware/migrate/postgres` — `createPgMigrator`, `createPgMigrationDriver`,
  `createPgMigrationHistoryStore`, `createPgExecutor`, `createPgPool`

## Security

Dry-runs do not execute SQL or programmatic migration functions. Checksum
mismatches fail by default unless explicitly allowed.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

The root import does not include database adapters. PostgreSQL is available only
through `@rootware/migrate/postgres`; future SQLite support should use its own
subpath rather than sharing PostgreSQL code. Filesystem migration discovery, CLI
commands, schema diffing, advisory locks, and checksum repair workflows are
still planned for later releases.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
