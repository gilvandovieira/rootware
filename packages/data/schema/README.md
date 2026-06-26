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
- `diffSchemaSnapshots` / `isEmptySchemaSnapshotDiff`

## Snapshot diff (`0.3`)

`diffSchemaSnapshots(from, to)` computes the structural difference between two
snapshots — `addedTables`, `removedTables`, and `changedTables` (each with
per-column `added`/`removed`/`changed`). Both sides are normalized first, so
ordering is ignored. It is a dependency-free primitive: `@rootware/migrate`
consumes it to generate migrations from a pair of snapshots without `orm` and
`migrate` importing each other.

```ts
const diff = diffSchemaSnapshots(previous, current);
if (!isEmptySchemaSnapshotDiff(diff)) {
  for (const table of diff.changedTables) {
    for (const column of table.columns.added) {
      // emit ALTER TABLE ... ADD COLUMN ...
    }
  }
}
```

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

This package owns the snapshot contract and the structural `diffSchemaSnapshots`
primitive. ORM metadata production, migration **SQL generation**, and driver
adapters live in higher-level packages. Normalization sorts tables and
constraints deterministically while preserving column declaration order inside
each table.

## Status

**Experimental.** The public API was audited and **frozen at `0.9`** to reduce
churn on the way to `1.0` — but until this package has real-world consumers it
stays experimental, so breaking changes remain possible **even at `1.0`**. The
version tracks roadmap progress, not a production-stability guarantee.

## License

MIT

[Back to Rootware](../../../README.md)
