# @rootware/migrate

Database migration primitives for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

## Install

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

## API

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

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
