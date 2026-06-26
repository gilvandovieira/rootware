# @rootware/migrate

Programmatic migration primitives for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

The v0.2 surface is intentionally the migration engine API: define migrations,
plan them, run them through injected stores/drivers, and validate checksums.

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

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package does not include database adapters, filesystem migration discovery,
CLI commands, schema diffing, or advisory locks yet. Those workflow layers are
planned after v0.2 and are not missing pieces of the v0.2 engine release.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
