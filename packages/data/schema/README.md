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
- `serializeSchemaSnapshot` / `deserializeSchemaSnapshot`
- `equalSchemaSnapshots`

## Serialization and compatibility

`serializeSchemaSnapshot` emits **canonical JSON**: the snapshot is normalized
first (tables and constraints sorted, declaration order of columns preserved),
so two snapshots that differ only in ordering serialize to identical strings —
safe for storage, migration journals, and checksums. `deserializeSchemaSnapshot`
parses, normalizes, and validates, so a successful round-trip always yields a
valid snapshot. `equalSchemaSnapshots` compares two snapshots by their canonical
form.

The shape is versioned by `SCHEMA_SNAPSHOT_VERSION` (currently `1`). A future
breaking change to the snapshot shape bumps this constant;
`validateSchemaSnapshot` rejects unknown versions so consumers can migrate
deliberately rather than silently mis-reading an incompatible snapshot.

## Security

Schema snapshots are plain data. Validation reports structural issues without
executing SQL, functions, or driver code.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

This package owns the snapshot contract only. ORM metadata production, migration
diffing, SQL generation, and driver adapters live in higher-level packages.
Normalization sorts tables and constraints deterministically while preserving
column declaration order inside each table.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
