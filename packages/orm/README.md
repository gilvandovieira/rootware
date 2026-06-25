# @rootware/orm

Small typed SQL and ORM primitives for Rootware packages and Deno backends.

Status: experimental / early development.

## Import

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

## API Summary

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

## Limitations

This package does not implement real database drivers, joins, relations,
migrations, schema introspection, pooling, or advanced SQL builders yet.

[Back to Rootware](../../README.md)
