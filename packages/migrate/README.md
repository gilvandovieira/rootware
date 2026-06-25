# @rootware/migrate

Database migration primitives for Rootware packages and Deno backends.

Status: experimental / early development.

## Import

```ts
import {
  createMigrator,
  defineSqlMigration,
  memoryMigrationStore,
} from "jsr:@rootware/migrate";
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

## API Summary

- `defineSqlMigration`
- `defineMigration`
- `createMigrator`
- `memoryMigrationStore`
- `createMigrationPlan`
- `noopMigrationDriver`
- `noopMigrator`

## Security

Dry-runs do not execute SQL or programmatic migration functions. Checksum
mismatches fail by default unless explicitly allowed.

## Limitations

This package does not include database adapters, filesystem migration discovery,
CLI commands, schema diffing, or advisory locks yet.

[Back to Rootware](../../README.md)
