# @rootware/orm

Typed SQL and schema snapshot core for Rootware packages and Deno backends.

Experimental JSR-native package for Rootware.

The root `@rootware/orm` import is database-agnostic. Database-specific
integrations live behind subpath exports such as `@rootware/orm/postgres`. This
prevents SQLite users from loading or depending on PostgreSQL code.

PostgreSQL execution is available through the package subpath. It does not
create a public `@rootware/postgres` package yet. That extraction waits until
the data core is proven in a real app.

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
- Predicates — `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `inArray`,
  `notInArray`, `isNull`, `isNotNull`, `and`, `or`, `not`
- `@rootware/orm/postgres` — `createPgDb`, `connect`, `createPgOrmDriver`,
  `createPgExecutor`, `createPgPool`
- `@rootware/orm/sqlite` — `createSqliteDb`, `connect`, `createSqliteOrmDriver`,
  `createSqliteExecutor`, `sqliteColumnAffinity`

## Query expansion (`0.3`)

`ilike` (case-insensitive, PostgreSQL-oriented) and the set predicates `inArray`
/ `notInArray` join the comparison helpers. Set members are bound as parameters,
and an empty array compiles to a safe constant (`1 = 0` / `1 = 1`) instead of
invalid `IN ()` SQL, so dynamic filters with no values do not crash:

```ts
db.select().from(users).where(
  and(inArray(users.columns.id, ids), ilike(users.columns.email, "%@acme.com")),
);
```

### Joins, projections, and returning

Comparison predicates are column-aware, so `eq(a.col, b.col)` powers join `ON`
clauses. Project columns with `select({ alias: column })` and pick specific
returned columns with `returning({ alias: column })`:

```ts
const rows = await db
  .select({ name: users.columns.name, title: posts.columns.title })
  .from(users)
  .leftJoin(posts, eq(posts.columns.userId, users.columns.id))
  .where(eq(users.columns.id, id))
  .execute();

const [created] = (await db
  .insert(users)
  .values(row)
  .returning({ id: users.columns.id })
  .execute()).rows;
```

Both `innerJoin` and `leftJoin` are supported. Note: a column projected from a
**left-joined** table can be `null` at runtime; the result type does not infer
that automatically, so treat left-joined columns as nullable.

### Transactions

`db.transaction(fn)` runs `fn` in a real transaction (`BEGIN`/`COMMIT`, with
`ROLLBACK` if `fn` throws) when the driver supports it (both the Postgres and
SQLite adapters do). `connect(options)` is a convenience alias for `createPgDb`
(and for `createSqliteDb` on the `/sqlite` subpath).

### SQLite (`0.4`)

`@rootware/orm/sqlite` runs the same `defineTable`/`columns`/query-builder
surface against SQLite via the bundled `@db/sqlite` driver — the compiler
already emits `?` placeholders for the `sqlite` dialect:

```ts
import { createSqliteDb } from "jsr:@rootware/orm/sqlite";

const db = await createSqliteDb({ path: ":memory:" }); // or a file path
const open = await db.select().from(notes).where(eq(notes.columns.done, false))
  .execute();
```

`createSqliteDb` accepts a `path` (`:memory:` by default), an already-open
`database`, or an `executor` (for tests). The `@db/sqlite` driver uses FFI, so a
real open needs `--allow-ffi` (plus `--allow-read`/`--allow-write`/`--allow-net`
to fetch the native library the first time); the driver is imported lazily, so
importing the subpath and injecting a fake database needs no permissions.
`sqliteColumnAffinity(dataType)` exposes the type→storage-class mapping
(`TEXT`/`INTEGER`/`REAL`).

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

The root import does not include database drivers. PostgreSQL is available
through `@rootware/orm/postgres` and SQLite through `@rootware/orm/sqlite`, each
with its own driver. Relations, schema introspection, and advanced SQL builders
are still outside the current scope.

## Status

Experimental. API may change before 1.0.

## License

MIT

[Back to Rootware](../../../README.md)
