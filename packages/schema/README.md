# @rootware/schema

Serializable schema snapshot types and validation helpers for Rootware database
tooling.

`@rootware/schema` is a dependency-free leaf package. It owns the plain JSON
contract that `@rootware/orm` can produce and `@rootware/migrate` can consume
without either package importing the other.

```ts
import {
  assertValidSchemaSnapshot,
  defineSchemaSnapshot,
} from "@rootware/schema";

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

Normalization sorts tables and constraints deterministically while preserving
column declaration order inside each table.
