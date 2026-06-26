# @rootware/orm

Typed SQL and schema snapshot core for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

The v0.2 surface is intentionally the root package core: table metadata, safe
SQL composition, query builders over injected drivers, and schema snapshots for
`@rootware/migrate`.

## Install

```ts
import {
  columns,
  createDatabase,
  defineTable,
  eq,
  noopOrmDriver,
  sql,
} from "jsr:@rootware/orm";
```

## Example

```ts
const users = defineTable("users", {
  id: columns.text().primaryKey(),
  email: columns.text().notNull().unique(),
});

const db = createDatabase({
  driver: noopOrmDriver(),
});

await db.select().from(users).where(eq(users.columns.id, "u_123")).execute();

await db.execute(sql`select * from users where id = ${"u_123"}`);
```

## API

- `defineTable`
- `columns` — `text`, `varchar(n)`, `integer`, `bigint`, `number`, `boolean`,
  `json`, `jsonb`, `date`, `timestamp({ withTimezone })`, `uuid`
- `createSchemaSnapshot`
- `sql`
- `raw`
- `identifier`
- `renderSql`
- `createDatabase`
- `noopOrmDriver`

Postgres-typed columns (`varchar`, `bigint`, `jsonb`, `timestamptz`) carry their
type — and `varchar` length — through to the `@rootware/schema` snapshot
consumed by `@rootware/migrate`. `bigint` is typed as `string` to preserve
64-bit precision.

## Security

The `sql` template keeps interpolated values as driver parameters. Use `raw`
only with trusted SQL literals.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package does not implement real database drivers, joins, relations,
migrations, schema introspection, pooling, or advanced SQL builders yet. Those
features are planned after v0.2 and are not missing pieces of the v0.2 root
core.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
