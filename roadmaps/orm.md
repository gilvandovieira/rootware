# @rootware/orm Product Plan

## Status

`@rootware/orm` already has an experimental `v0.1` published. This plan assumes
the package is not a proof of concept. It is a real Rootware product that is
currently pre-1.0 and should be productized through small, testable releases.

The next phase is not to restart the ORM. The next phase is to convert the
published `v0.1` foundation into a coherent `v0.2` product spine.

> **Current `v0.1` surface (reconciled with source).** The published package
> already ships much of what the roadmap below schedules as future work, but
> under different names than this document originally used. The examples
> throughout this file were updated to match the real exports. Concretely,
> `v0.1` already provides:
>
> - The `sql` tagged template plus `raw`, `identifier`, `joinSql`, `renderSql`,
>   `quoteIdentifier` (parameterized by default).
> - The full predicate set:
>   `eq, ne, gt, gte, lt, lte, like, isNull, isNotNull,
>   and, or, not`.
> - `select` / `insert` / `update` / `delete` builders with `.where()`, plus
>   `createDatabase`, the `OrmDriver` / `OrmTransaction` contracts, and
>   `memoryOrmDriver` / `noopOrmDriver`.
> - Full-table `update` / `delete` protection by default, with the explicit
>   `unsafeAllowAllRows()` escape hatch for intentional all-row writes.
> - Type inference: `InferSelect`, `InferInsert`, and a phantom-typed
>   `ColumnBuilder` (`notNull`, `nullable`, `optional`, `default`, `primaryKey`,
>   `unique`, `references`).
>
> **Naming decision.** The shipped schema API is
> `defineTable(name, { col: columns.x() })` with a single dialect-generic
> entrypoint and a `SqlDialect` field — **not** `pgTable` + a `/pg` subpath.
> Because `0.1` is published, the canonical API stays `defineTable` +
> `columns.*`, and this document was rewritten to use it. A Drizzle-style
> `pgTable` and `/pg`, `/postgres`, `/neon` subpaths may be added later as thin
> aliases/adapters, but they are additive, not the primary surface.
>
> **What is genuinely missing** (the real `v0.2`): a concrete Postgres driver
> (`connect` over `@db/postgres`), projection selects, projected `returning`,
> joins, `inArray`/`ilike`, Postgres-specific column types/escaping hardening,
> real transaction semantics, and the subpath layout. `createSchemaSnapshot` now
> exists as the ORM -> `@rootware/schema` handoff and should be hardened rather
> than reimplemented.

## Product thesis

`@rootware/orm` is a JSR-native, Deno-first typed SQL ORM.

It uses Drizzle as prior work, but it is not a Drizzle port. The product should
feel native to Deno from the first import:

- No required npm runtime dependency.
- No required Node compatibility layer in the core.
- No required `package.json` for Deno users.
- TypeScript-first schema and query APIs.
- Explicit Deno permission model.
- SQL-first behavior.
- Postgres first.
- SQLite, libSQL, and Turso as planned dialect targets.
- Benchmarked against raw drivers, Drizzle, and Kysely.

## Canonical package

The canonical package name is:

```ts
jsr:@rootware/orm
```

The package currently ships a single dialect-generic entrypoint. Today's
imports:

```ts
import {
  and,
  columns,
  createDatabase,
  defineTable,
  eq,
  or,
  sql,
} from "@rootware/orm";
```

Planned subpaths (additive, not yet built) once a real driver and
dialect-specific column types exist:

```ts
import { connect } from "@rootware/orm/postgres"; // future: @db/postgres driver
import { connect as connectNeon } from "@rootware/orm/neon"; // future: serverless
import { connect as connectLibsql } from "@rootware/orm/libsql"; // future
import { connect as connectTurso } from "@rootware/orm/turso"; // future
```

If a Drizzle-style dialect-namespaced schema API is added later, it would live
behind a subpath (for example `@rootware/orm/pg` exposing `pgTable`) as an alias
over the canonical `defineTable` + `columns` API. The dialect-generic root stays
primary.

## Dependencies (runtime vs example/dev)

### Runtime imports

- `@rootware/errors` — `OrmError` / `SchemaError` / `QueryCompileError` /
  `DriverError` (value import).
- `@rootware/log` — **type-only** (optional injected `Logger`). In `v0.1`,
  `packages/orm/mod.ts` imports only `@rootware/errors` and `@rootware/log`
  (type).
- `@rootware/schema` — snapshot types plus validation through
  `defineSchemaSnapshot`. A leaf import; does not couple orm to migrate.

### Example / dev-only imports

- `@rootware/env` — examples only (`DATABASE_URL`); not a runtime dependency.
- `@rootware/testing` — tests only.

### Disallowed

- `@rootware/migrate` — orm and migrate are siblings; orm never imports migrate.
- Driver SDKs in the core (`@db/postgres` etc. live behind the `/postgres`
  adapter boundary).

## Relationship with @rootware/migrate

`@rootware/orm` should not own the migration product. That responsibility
belongs to `@rootware/migrate`.

Ownership of the snapshot is split three ways (decided — see
`rootware-roadmap.md`, "Schema snapshot handoff"):

- **`@rootware/schema`** owns the snapshot _type_ (`RootwareSchemaSnapshot` and
  its members). A dependency-free leaf package, so neither orm nor migrate
  depends on the other.
- **`@rootware/orm`** _produces_ a snapshot from table metadata via
  `createSchemaSnapshot` (importing the type from `@rootware/schema`).
- **`@rootware/migrate`** _consumes, validates, stores, diffs, and journals_ the
  snapshot (also importing the type from `@rootware/schema`).

The ORM owns:

- Schema definition API.
- Table and column metadata.
- `createSchemaSnapshot` (snapshot **production** from that metadata).
- Query builder.
- Type inference.
- Dialect compilers.
- Driver adapters.
- Runtime query execution.

`@rootware/migrate` owns:

- Snapshot **consumption**: validation, persistence/storage, diffing,
  journaling.
- Migration file generation.
- Migration journal.
- Migration execution.
- Drift checks.
- Migration CLI.

Neither owns the snapshot _type_ — `@rootware/schema` does.

The integration point between both packages should be a stable schema metadata
contract.

Example:

```ts
import * as schema from "./schema.ts";
import { createSchemaSnapshot } from "@rootware/orm";

const snapshot = createSchemaSnapshot(schema);
```

The snapshot format must be serializable and versioned so that
`@rootware/migrate` can consume it without reaching into ORM internals.

This contract is a product dependency, not an implementation detail.
`@rootware/migrate` must be able to generate migrations from ORM metadata
without importing private symbols, reading private object shapes, or depending
on query-builder internals.

## Architecture

The ORM should be split internally into four layers.

```txt
Schema DSL -> Typed query AST -> Dialect compiler -> Driver adapter
```

### 1. Schema DSL

Defines tables, columns, constraints, indexes, and relations metadata.

Example (shipped `v0.1` API — column name comes from the object key; `.named()`
overrides it; defaults take a value or a thunk):

```ts
import { columns, defineTable } from "@rootware/orm";

export const users = defineTable("users", {
  id: columns.uuid().primaryKey().default(() => crypto.randomUUID()),
  email: columns.text().notNull(),
  name: columns.text().nullable(),
  createdAt: columns.timestamp().notNull().default(() => new Date()),
});
```

Note the differences from a Drizzle-style API: there is no `.defaultRandom()` /
`.defaultNow()` (use `.default(fn)`), columns are created via the `columns`
factory rather than per-type imports, and the table is dialect-generic (the
dialect is chosen at the driver/`createDatabase` layer, not the column layer).
Postgres-specific column types and modifiers are a `v0.2` addition, not the
current surface.

### 2. Typed query AST

Represents queries before they become SQL.

The core query builder must not know which database driver will execute the
query.

### 3. Dialect compiler

Turns query nodes into database-specific SQL.

Postgres should be implemented first. SQLite-family dialects come later.

### 4. Driver adapter

Executes compiled SQL through a concrete database driver.

Initial adapter target:

```txt
@db/postgres
```

This is the native/TCP Postgres adapter for local development, servers, and
runtimes where a normal Postgres connection is appropriate.

Serverless Postgres adapter target:

```txt
@neon/serverless through @rootware/orm/neon
```

This should be modeled as a separate adapter because serverless and edge
runtimes often have different connection behavior, latency behavior, pooling
assumptions, and deployment constraints than a normal TCP Postgres client.

Future adapter targets:

```txt
@db/sqlite
@libsql/client
Turso
```

## Core contracts

### Schema snapshot contract

The ORM must _produce_ a stable, serializable schema snapshot for
`@rootware/migrate`.

The snapshot **type** is not defined here. It is owned by the dependency-free
**`@rootware/schema`** leaf package (see `schema.md`). `@rootware/orm` imports
the type to produce snapshots; `@rootware/migrate` imports the same type to
consume them. Neither package redeclares the shape, and neither imports the
other.

```ts
import type { RootwareSchemaSnapshot } from "@rootware/schema";

// produced here, from table metadata:
export function createSchemaSnapshot(
  schema: SchemaModule,
): RootwareSchemaSnapshot;
```

The ORM's job for this contract is **production only**:

- Walk the registered `defineTable` metadata.
- Emit a deterministic `RootwareSchemaSnapshot` (stable table/column ordering).
- Include no functions, symbols, or runtime-only implementation details.
- Keep the persisted `dialect` aligned with `@rootware/schema`'s
  `RootwareDialectName` union (the runtime `SqlDialect` includes
  `mysql`/`generic`; whether those are valid snapshot dialects is the open
  decision tracked in `schema.md`).

Diffing, persistence, journaling, and SQL generation are not the ORM's concern —
they belong to `@rootware/migrate`, which consumes the snapshot through
`@rootware/schema`'s public type.

### Compiled query

```ts
export interface CompiledQuery {
  sql: string;
  params: unknown[];
}
```

### Dialect

```ts
export interface Dialect {
  compile(query: QueryNode): CompiledQuery;
}
```

### Driver

```ts
export interface Driver {
  query<T = unknown>(query: CompiledQuery): Promise<QueryResult<T>>;
  transaction?<T>(fn: (tx: Driver) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}
```

### Query result

```ts
export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount?: number;
}
```

## Type testing strategy

The ORM is only credible if its type inference is tested as a public contract.

Add compile-time type assertions for every schema and query feature that claims
type safety. Runtime tests are not enough for this package.

Recommended local assertion helpers:

```ts
type Assert<T extends true> = T;
type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
```

Required type-level coverage:

- Select type inference.
- Insert type inference.
- Update type inference.
- Nullable and not-null columns.
- Defaulted columns.
- Generated columns.
- Unknown-field rejection.
- Predicate value type checking.
- Join result nullability.
- Returning result inference.

The `/testing` subpath should also expose compile-only helpers for generated SQL
assertions:

```ts
import { compileQuery } from "@rootware/orm/testing";

const compiled = compileQuery(
  db.select({ id: users.id }).from(users),
);
```

This lets contributors test SQL output without requiring a live database for
every compiler test.

## Non-goals before v1

The ORM should not attempt to support every possible ORM feature before the core
is trustworthy.

Explicit non-goals for early releases:

- No Active Record pattern.
- No decorators.
- No Prisma-style schema language.
- No visual studio.
- No broad multi-database support in `v0.2`.
- No hidden code generation requirement for normal runtime usage.
- No runtime dependency on npm packages in the core.

## Release roadmap

## v0.1.x — Published foundation cleanup

Goal: make the already-published package understandable, installable, and safe
to evaluate.

### Chunk 1 — Audit published package

Tasks:

- List current exports.
- List public types.
- List public functions.
- Mark unstable APIs.
- Identify accidental exports.
- Identify missing docs.
- Identify missing tests.
- Identify npm dependencies, if any.
- Verify clean install with `deno add jsr:@rootware/orm`.

Output:

```txt
docs/internal/v0.1-audit.md
```

Acceptance:

- A contributor can read the audit and know exactly what `v0.1` exposed
  publicly.

### Chunk 2 — Define public module surface

Target imports:

```ts
import { and, columns, defineTable, eq, sql } from "@rootware/orm";
// future subpath, once the driver exists:
import { connect } from "@rootware/orm/postgres";
```

Tasks:

- Define root export.
- Define `/pg` export.
- Define `/postgres` export.
- Define `/testing` export.
- Hide internal files.
- Remove or deprecate accidental exports.

Acceptance:

- All examples use only public exports.

### Chunk 3 — Add experimental product warning

Add to the README:

```md
@rootware/orm is currently pre-1.0. APIs are experimental, but the project is
intended as a real production-oriented ORM, not a toy or proof of concept.
```

Acceptance:

- README clearly explains what is safe to evaluate and what may change.

### Chunk 4 — Add documentation skeleton

Create:

```txt
docs/
  introduction.md
  quickstart.md
  schema.md
  queries.md
  adapters.md
  testing.md
  roadmap.md
  benchmarks.md
```

Acceptance:

- Every planned doc page exists, even if some pages are incomplete.

## v0.2 — Postgres vertical slice

Goal: ship the first complete product spine.

A user should be able to:

```txt
define schema -> connect to Postgres -> insert -> select -> test compiled SQL
```

Migration generation and execution should be handled by `@rootware/migrate`, not
by `@rootware/orm`.

> **Most of this milestone already ships in `v0.1`.** Read "Implement …" in the
> chunks below as verify-test-and-document for the parts that already exist.
> Already shipped: Chunk 5 (`sql` tag), Chunk 6 (`quoteIdentifier`), Chunk 8
> (`OrmDriver` / `memoryOrmDriver`), Chunk 9 (`defineTable` + `columns`), Chunk
> 12 (insert inference via `InferInsert`), Chunk 13 (select builder), Chunk 14
> (predicate helpers), Chunk 15 (insert builder). The **genuine gaps** are:
> Chunk 7 (the compiler-contract abstraction — `v0.1` uses `renderSql` over
> `Sql` chunks plus a `SqlDialect` string, not a `QueryNode`/`Dialect.compile`
> split, so this is a design decision, not a verify), Chunk 10
> (`createSchemaSnapshot`, now implemented and needing hardening), Chunk 11
> (Postgres-specific column types over the generic factory), Chunk 16 (projected
> `returning`, not the already-shipped basic `returning()`), and Chunk 17 (the
> real `@db/postgres` driver / `connect`). Build those; verify the rest.

### Chunk 5 — Core SQL fragment

Goal: create a safe SQL primitive.

API:

```ts
const query = sql`select * from users where id = ${userId}`;
```

Compiled output:

```ts
{
  sql: "select * from users where id = $1",
  params: [userId],
}
```

Tasks:

- Implement SQL tagged template.
- Collect parameters safely.
- Support nested SQL fragments.
- Add raw SQL escape hatch with explicit naming.
- Test parameter ordering.

Acceptance:

- User values are parameterized by default.

### Chunk 6 — Identifier escaping

Goal: safely compile table and column identifiers.

Example:

```ts
users.email;
```

Compiles to:

```sql
"users"."email"
```

Tasks:

- Escape Postgres identifiers with double quotes.
- Support schema-qualified tables.
- Test reserved words.
- Test unusual column names.

Acceptance:

- All generated identifiers are escaped consistently.

### Chunk 7 — Query compiler contract

Goal: establish the internal compiler boundary.

Tasks:

- Create `QueryNode` type.
- Create `CompiledQuery` type.
- Create `Dialect` interface.
- Create `PostgresDialect` skeleton.

Acceptance:

- Queries compile without knowing which driver will execute them.

### Chunk 8 — Driver contract

Goal: isolate database execution.

Tasks:

- Define `Driver`.
- Define `QueryResult`.
- Define transaction placeholder.
- Define driver error wrapping strategy.

Acceptance:

- ORM core has no direct dependency on `@db/postgres`.

### Chunk 9 — Basic table definition

Goal: define typed tables. **Already shipped in `v0.1`** — this chunk is now
verify-and-document, not implement.

API:

```ts
import { columns, defineTable } from "@rootware/orm";

export const users = defineTable("users", {
  id: columns.uuid().primaryKey(),
  email: columns.text().notNull(),
  name: columns.text().nullable(),
});
```

Tasks:

- Verify `defineTable` + the `columns` factory store
  name/type/primary-key/not-null metadata (they do today).
- Confirm column types are available at compile time via `InferSelect` /
  `InferInsert`.
- Document the `.named()`, `.default(value|fn)`, `.unique()`, `.references()`
  modifiers.

Acceptance:

- Table metadata is available at runtime and column types are available at
  compile time.

### Chunk 10 — Stable schema metadata and snapshot contract

Goal: expose the public metadata contract that `@rootware/migrate` will consume.

API:

```ts
import * as schema from "./schema.ts";
import { createSchemaSnapshot } from "@rootware/orm";

const snapshot = createSchemaSnapshot(schema);
```

Tasks:

- Define table metadata symbols.
- Define column metadata shape.
- Define default metadata shape.
- Define index metadata shape.
- Define unique constraint metadata shape.
- Define foreign key metadata shape.
- Implement `createSchemaSnapshot(schema)`.
- Version the snapshot format.
- Add deterministic output tests.

Acceptance:

- `@rootware/migrate` can consume the snapshot without importing ORM internals.

### Chunk 11 — Postgres core column types

`v0.1` already ships a dialect-generic `columns` factory:
`text, integer, number, boolean, json, date, timestamp, uuid`. This chunk
**extends** that factory (or adds a Postgres-typed variant) with
Postgres-specific types and fixes the naming gap (`json` vs `jsonb`); it does
not replace the existing API.

Add Postgres-typed columns:

- `varchar` (with length)
- `bigint`
- `jsonb` (decide whether this replaces or sits alongside the generic `json`)
- `timestamp` with timezone option
- keep `text`, `integer`, `boolean`, `uuid` mapping to their Postgres types

Each column needs:

- Runtime metadata.
- TypeScript select type.
- TypeScript insert type.
- Nullable/not-null behavior.
- Default behavior.

Acceptance:

- Insert and select types infer correctly for supported columns.

### Chunk 12 — Insert type inference

Goal: typed inserts.

Example:

```ts
await db.insert(users).values({
  email: "lucas@example.com",
  name: "Lucas",
});
```

Tasks:

- Infer required fields.
- Infer optional fields when default exists.
- Infer nullable fields.
- Reject unknown fields.

Acceptance:

- TypeScript rejects invalid insert objects.

### Chunk 13 — Select query builder

Goal: first useful read path.

API:

```ts
const result = await db
  .select({
    id: users.id,
    email: users.email,
  })
  .from(users);
```

Tasks:

- Support select object shape.
- Support `from(table)`.
- Compile selected columns.
- Infer result row type.

Acceptance:

- Result type matches selected fields.

### Chunk 14 — Predicate helpers

Implement:

- `eq`
- `ne`
- `lt`
- `lte`
- `gt`
- `gte`
- `and`
- `or`
- `isNull`
- `isNotNull`
- `inArray`
- `like`
- `ilike`

Example:

```ts
.where(and(
  eq(users.email, "lucas@example.com"),
  isNotNull(users.name),
))
```

Acceptance:

- Predicates compile to parameterized SQL.

### Chunk 15 — Insert query builder

Goal: first write path.

API:

```ts
await db.insert(users).values({
  email: "lucas@example.com",
});
```

Tasks:

- Single-row insert.
- Parameterized values.
- Default values handling.
- Insert type inference.

Acceptance:

- Generated SQL executes against real Postgres.

### Chunk 16 — Projected returning

Goal: Postgres-friendly write result.

API:

```ts
const [user] = await db
  .insert(users)
  .values({ email: "lucas@example.com" })
  .returning({
    id: users.id,
    email: users.email,
  });
```

Acceptance:

- Basic `.returning()` already ships; projected returning result type is
  inferred.

### Chunk 17 — @db/postgres adapter

Goal: first real driver.

API:

```ts
import { connect } from "@rootware/orm/postgres";
import * as schema from "./schema.ts";

const db = await connect({
  url: Deno.env.get("DATABASE_URL")!,
  schema,
});
```

Tasks:

- Wrap `@db/postgres` client.
- Execute `CompiledQuery`.
- Map rows.
- Expose `close()`.
- Add integration test.

Acceptance:

- A real Postgres database can be queried through `@rootware/orm`.

### Chunk 18 — Hono Postgres example

Goal: prove real usage.

Example app:

```txt
examples/hono-postgres/
  deno.json
  schema.ts
  db.ts
  main.ts
```

Routes:

```txt
POST /users
GET /users/:id
GET /users
```

Acceptance:

- Example runs with `deno task dev`.

## v0.3 — Product alpha hardening

Goal: make the Postgres path usable for careful real applications.

### Chunk 19 — Update query builder

API:

```ts
await db
  .update(users)
  .set({ name: "Lucas" })
  .where(eq(users.id, id));
```

Acceptance:

- Update values are typed and SQL is parameterized.

### Chunk 20 — Delete query builder

API:

```ts
await db
  .delete(users)
  .where(eq(users.id, id));
```

Acceptance:

- Delete works with typed predicates.

### Chunk 21 — Order, limit, offset

API:

```ts
await db
  .select()
  .from(users)
  .orderBy(desc(users.createdAt))
  .limit(10)
  .offset(20);
```

Acceptance:

- Pagination compiles correctly.

### Chunk 22 — Joins

Start with:

- `innerJoin`
- `leftJoin`

Example:

```ts
db.select({
  userId: users.id,
  postId: posts.id,
})
  .from(users)
  .leftJoin(posts, eq(posts.userId, users.id));
```

Acceptance:

- Joined result type handles nullable side of left join.

### Chunk 23 — Transactions

API:

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values(...);
  await tx.insert(posts).values(...);
});
```

Acceptance:

- Rollback happens when the callback throws.

### Chunk 24 — Driver errors

Goal: wrap low-level driver failures in Rootware error types.

Tasks:

- Define `OrmError`.
- Define `QueryCompileError`.
- Define `DriverError`.
- Define `SchemaError`.
- Use `@rootware/errors` internally where appropriate.

Acceptance:

- Public errors are typed and consistent.

### Chunk 25 — Benchmark harness

Benchmarks:

- Raw `@db/postgres`.
- `@rootware/orm`.
- Drizzle through npm path.
- Kysely.

Measure:

- Cold start RSS.
- Warm RSS.
- `deno --watch` reload retention.
- Simple select latency.
- Insert latency.
- Joined select latency.
- Type-check time.

Acceptance:

- README performance claims are backed by scripts.

### Chunk 26 — Neon/serverless Postgres adapter

Goal: support serverless Postgres through a dedicated adapter instead of
overloading the native Postgres adapter.

API:

```ts
import { connect } from "@rootware/orm/neon";
import * as schema from "./schema.ts";

const db = await connect({
  url: Deno.env.get("DATABASE_URL")!,
  schema,
});
```

Tasks:

- Add `/neon` public subpath.
- Wrap the JSR `@neon/serverless` client.
- Reuse the Postgres dialect compiler where SQL semantics match.
- Document connection behavior differences from `@rootware/orm/postgres`.
- Add integration tests that can run conditionally when `DATABASE_URL` is
  present.

Acceptance:

- Serverless Postgres usage has its own documented adapter boundary.

### Chunk 27 — Deno Deploy + Neon example

Goal: prove the serverless deployment story using the `/neon` adapter.

Example:

```txt
examples/deno-deploy-neon/
```

Tasks:

- Use the current Deno Deploy platform, not old Deploy Classic assumptions.
- Use `@rootware/orm/neon` rather than the native `/postgres` adapter.
- Keep the example small enough to copy into a fresh project.
- Document required environment variables.
- Document deployment caveats separately from ORM core behavior.

Acceptance:

- A user can copy the example and deploy a tiny app with Neon-backed Postgres.

## v0.4 — SQLite local

Goal: support local-first and embedded Deno apps without corrupting the Postgres
API.

### Chunk 28 — SQLite dialect boundary audit

Tasks:

- Audit Postgres assumptions in core.
- Move Postgres-only logic to `/pg`.
- Add compiler tests for SQLite dialect behavior.

Acceptance:

- SQLite can be added without rewriting the core.

### Chunk 29 — SQLite table builder

API:

```ts
// Canonical API is defineTable + columns; the dialect is chosen at the driver layer.
import { columns, defineTable } from "@rootware/orm";

export const notes = defineTable("notes", {
  id: columns.integer().primaryKey(),
  body: columns.text().notNull(),
});
```

Acceptance:

- SQLite schema metadata and SQLite-specific column affinity work without
  changing the canonical `defineTable` surface (a dialect-namespaced builder, if
  added, is an alias).

### Chunk 30 — SQLite column types

Implement:

- `text`
- `integer`
- `real`
- `blob`
- boolean mode via integer
- timestamp mode
- JSON mode

Acceptance:

- SQLite type affinity is documented and tested.

### Chunk 31 — SQLite adapter

Target:

```ts
import { connect } from "@rootware/orm/sqlite";
```

Support:

- Local file database.
- In-memory database.
- Query execution.

Acceptance:

- A local SQLite app works without Postgres.

## v0.5 — libSQL

Goal: support SQLite-compatible edge/serverless workflows.

### Chunk 32 — libSQL adapter

Target:

```ts
import { connect } from "@rootware/orm/libsql";
```

Support:

- Remote URL.
- Auth token.
- Query execution.

Acceptance:

- Same schema/query APIs work with libSQL where SQL semantics allow.

### Chunk 33 — libSQL compatibility docs

Document:

- What matches SQLite.
- What differs from SQLite.
- Deployment caveats.
- Migration caveats delegated to `@rootware/migrate`.

Acceptance:

- Users know when to choose SQLite vs libSQL.

## v0.6 — Turso

Goal: support hosted SQLite-family database workflows.

### Chunk 34 — Turso adapter

Target:

```ts
import { connect } from "@rootware/orm/turso";
```

Support:

- Turso database URL.
- Auth token.
- Edge/serverless query path.

Acceptance:

- Deno Deploy + Turso example works.

### Chunk 35 — Turso example app

Example:

```txt
examples/hono-turso/
```

Routes:

```txt
POST /notes
GET /notes
```

Acceptance:

- Small edge-style app proves the adapter.

## v0.7 — Sync and local-first research

Goal: explore sync behavior without polluting stable APIs.

### Chunk 36 — Sync constraints document

Document:

- Conflict model.
- Generated IDs.
- `updated_at` requirements.
- Deleted/tombstone model.
- Sync-safe schema constraints.
- Offline writes.

Acceptance:

- No sync API is added before the model is understood.

### Chunk 37 — Local-first experiment

Example:

```txt
examples/local-first-notes/
```

Goal:

- Local SQLite/libSQL-style app with future sync compatibility.

Acceptance:

- Useful research without contaminating stable APIs.

## v1.0 — Stable public API

Goal: make `@rootware/orm` safe to recommend for production Deno apps.

The v1 contract should include:

- Stable schema DSL APIs.
- Stable query builder APIs.
- Stable driver interface.
- Stable schema snapshot interface for `@rootware/migrate`.
- Documented dialect limitations.
- Compatibility matrix.
- Semver discipline.

## Cross-package integrations

### @rootware/errors

Use for typed public errors:

- `OrmError`
- `SchemaError`
- `QueryCompileError`
- `DriverError`

### @rootware/env

Use in examples, not as a hard runtime dependency.

### @rootware/log

Optional integration later:

```ts
const db = await connect({
  url,
  logger,
});
```

Possible events:

- Query started.
- Query completed.
- Query failed.
- Transaction started.
- Transaction committed.
- Transaction rolled back.

### @rootware/migrate

The ORM exposes schema metadata and snapshots. `@rootware/migrate` consumes
those snapshots and owns migration generation/execution.

## First 10 implementation chunks

Do these first (most of the builder work already exists in `v0.1`; the real
near-term gap is the snapshot contract, a concrete driver, and type-level
tests):

1. Audit published `v0.1` and pin the public export list.
2. Decide subpath layout (`/postgres` etc.) — additive over the generic root.
3. Add experimental product README using `defineTable` + `columns`.
4. Create docs skeleton.
5. Verify the shipped `sql` tagged template and parameterization.
6. Verify the `OrmDriver` interface and `memoryOrmDriver`.
7. Reconcile the `SqlDialect` union with the snapshot dialect union.
8. Verify `defineTable` + `columns` metadata (already implemented).
9. Harden schema metadata serialization and `createSchemaSnapshot()`
   (implemented in the alignment pass).
10. Add compile-time type assertion tests for schema/query inference.

After these, build the real `@db/postgres` driver and `connect`, then
Postgres-specific column types — the `select`/`insert`/`update`/`delete`
builders and predicates already exist and only need a real driver to execute
against.

## Product rule

Every chunk must end with one of:

- A passing test.
- A working example.
- A documented public contract.
- A benchmark result.
- A typed API assertion.

The ORM should move like a real product: small public contracts, tested
behavior, clean release notes, and no accidental API drift.
