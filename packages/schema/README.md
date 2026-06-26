# @rootware/schema

Serializable schema snapshot types and validation helpers for Rootware database
tooling.

Experimental JSR-native package for Rootware.

## Install

```ts
import {
  assertValidSchemaSnapshot,
  defineSchemaSnapshot,
} from "jsr:@rootware/schema";
```

## Example

```ts
import {
  assertValidSchemaSnapshot,
  defineSchemaSnapshot,
} from "jsr:@rootware/schema";

const snapshot = defineSchemaSnapshot({
  version: 1,
  dialect: "postgres",
  tables: [
    {
      name: "users",
      columns: [
        { name: "id", type: { kind: "uuid" }, nullable: false },
        { name: "email", type: { kind: "text" }, nullable: false },
      ],
      primaryKey: { columns: ["id"] },
    },
  ],
});

assertValidSchemaSnapshot(snapshot);
```

## API

- `SCHEMA_SNAPSHOT_VERSION`
- `defineSchemaSnapshot`
- `validateSchemaSnapshot`
- `assertValidSchemaSnapshot`
- `normalizeSchemaSnapshot`

## Security

Schema snapshots are plain data. Validation reports structural issues without
executing SQL, functions, or driver code.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package owns the snapshot contract only. ORM metadata production, migration
diffing, SQL generation, and driver adapters live in higher-level packages.
Normalization sorts tables and constraints deterministically while preserving
column declaration order inside each table.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
