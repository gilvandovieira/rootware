# @rootware/orm

Typed SQL and schema snapshot core for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

The root `@rootware/orm` import is database-agnostic. Database-specific
integrations live behind subpath exports such as `@rootware/orm/postgres`. This
prevents SQLite users from loading or depending on PostgreSQL code.

v0.3 adds PostgreSQL execution as a subpath integration. It does not create a
public `@rootware/postgres` package yet. That extraction waits until the data
core is proven in a real app.

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

PostgreSQL execution is explicit:

```ts
import { createPgDb } from "jsr:@rootware/orm/postgres";
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

## PostgreSQL

```ts
import { columns, defineTable, eq } from "jsr:@rootware/orm";
import { createPgDb } from "jsr:@rootware/orm/postgres";

const users = defineTable("users", {
  id: columns.text().primaryKey(),
  email: columns.text().notNull().unique(),
});

const db = await createPgDb({
  url: Deno.env.get("DATABASE_URL")!,
});

await db.execute("select 1 as ok");
await db.select().from(users).where(eq(users.columns.id, "u_123")).execute();
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
- `@rootware/orm/postgres` — `createPgDb`, `createPgOrmDriver`,
  `createPgExecutor`, `createPgPool`

Postgres-typed columns (`varchar`, `bigint`, `jsonb`, `timestamptz`) carry their
type — and `varchar` length — through to the `@rootware/schema` snapshot
consumed by `@rootware/migrate`. `bigint` is typed as `string` to preserve
64-bit precision.

## Security

The `sql` template keeps interpolated values as driver parameters. Use `raw`
only with trusted SQL literals.

See [publishing](../../../docs/publishing.md) and
[testing](../../../docs/testing.md).

## Limitations

The root import does not include database drivers. PostgreSQL is available only
through `@rootware/orm/postgres`; future SQLite support should use its own
subpath rather than sharing PostgreSQL code. Joins, relations, schema
introspection, and advanced SQL builders are still outside the current scope.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
