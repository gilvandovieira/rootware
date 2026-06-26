# @rootware/orm

Small typed SQL and ORM primitives for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

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
- `columns`
- `sql`
- `raw`
- `identifier`
- `renderSql`
- `createDatabase`
- `noopOrmDriver`

## Security

The `sql` template keeps interpolated values as driver parameters. Use `raw`
only with trusted SQL literals.

See [publishing](../../docs/publishing.md) and [testing](../../docs/testing.md).

## Limitations

This package does not implement real database drivers, joins, relations,
migrations, schema introspection, pooling, or advanced SQL builders yet.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../README.md)
