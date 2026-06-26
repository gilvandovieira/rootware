import { assertEquals, assertRejects } from "@std/assert";
import { createLogger, memorySink } from "@rootware/log";
import * as migrateRoot from "@rootware/migrate";
import { MigrationError } from "@rootware/migrate";
import {
  createPgMigrationHistoryStore,
  createPgMigrator,
  generatePostgresColumnType,
  generatePostgresCreateTable,
  generatePostgresUpStatements,
  type QueryResult,
  quotePgIdent,
  type SqlExecutor,
} from "@rootware/migrate/postgres";
import { assert } from "@std/assert";
import type { RootwareSchemaSnapshot } from "@rootware/schema";

class FakeSqlExecutor implements SqlExecutor {
  readonly queries: Array<{
    readonly sql: string;
    readonly params: readonly unknown[];
  }> = [];
  readonly applied = new Map<string, Record<string, unknown>>();
  transactionCount = 0;
  failOn?: RegExp;

  execute<Row = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.queries.push({ sql, params: [...params] });

    if (this.failOn?.test(sql)) {
      return Promise.reject(new Error("postgres failed"));
    }

    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("create table if not exists")) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    if (
      normalized.startsWith("select") &&
      normalized.includes('from "rootware_migrations"')
    ) {
      const rows = normalized.includes("where id = $1")
        ? [...this.applied.values()].filter((row) => row.id === params[0])
        : [...this.applied.values()].sort((a, b) =>
          String(a.id).localeCompare(String(b.id))
        );

      return Promise.resolve({ rows: rows as Row[], rowCount: rows.length });
    }

    if (normalized.startsWith('insert into "rootware_migrations"')) {
      const [id, checksum, description, appliedAt, executionMs] = params;
      this.applied.set(String(id), {
        id,
        checksum,
        description,
        appliedAt,
        executionMs,
      });

      return Promise.resolve({ rows: [], rowCount: 1 });
    }

    if (normalized.startsWith('delete from "rootware_migrations"')) {
      const deleted = this.applied.delete(String(params[0]));
      return Promise.resolve({ rows: [], rowCount: deleted ? 1 : 0 });
    }

    return Promise.resolve({ rows: [], rowCount: 0 });
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return await fn();
  }
}

Deno.test("@rootware/migrate/postgres - applies pending migrations once and records metadata", async () => {
  const executor = new FakeSqlExecutor();
  const sink = memorySink();
  const logger = createLogger({ level: "debug", base: null }, sink);
  const migrator = await createPgMigrator({ executor, logger });
  const migration = {
    id: "0001_create_users",
    description: "create users",
    up: [
      `create table users (
        id text primary key,
        name text not null
      )`,
    ],
  };

  const first = await migrator.migrate({ migrations: [migration] });
  const second = await migrator.migrate({ migrations: [migration] });

  assertEquals(first.executed.map((item) => item.id), [
    "0001_create_users",
  ]);
  assertEquals(second.executed, []);
  assertEquals(executor.transactionCount, 1);
  assertEquals(
    executor.applied.get("0001_create_users")?.description,
    "create users",
  );
  assertEquals(
    String(executor.applied.get("0001_create_users")?.checksum).startsWith(
      "migr_",
    ),
    true,
  );
  assertEquals(
    executor.queries.filter((query) => query.sql.includes("create table users"))
      .length,
    1,
  );
  assertEquals(
    executor.queries.some((query) =>
      query.sql.toLowerCase().includes("create table if not exists")
    ),
    true,
  );
  assertEquals(
    sink.records().map((record) => record.msg).filter((msg) =>
      msg === "migration started" || msg === "migration completed"
    ),
    ["migration started", "migration completed"],
  );
});

Deno.test("@rootware/migrate/postgres - maps failures into RootwareError and logs failure", async () => {
  const executor = new FakeSqlExecutor();
  executor.failOn = /create table broken/;
  const sink = memorySink();
  const logger = createLogger({ level: "debug", base: null }, sink);
  const migrator = await createPgMigrator({ executor, logger });

  await assertRejects(
    () =>
      migrator.migrate({
        migrations: [{ id: "0001_broken", up: ["create table broken"] }],
      }),
    MigrationError,
    "PostgreSQL query failed",
  );
  assertEquals(
    sink.records().some((record) => record.msg === "migration failed"),
    true,
  );
});

Deno.test("@rootware/migrate - root import does not expose PostgreSQL exports", () => {
  assertEquals("createPgMigrator" in migrateRoot, false);
  assertEquals("createPgMigrationDriver" in migrateRoot, false);
});

Deno.test("@rootware/migrate/postgres - generatePostgresColumnType maps kinds, lengths, and arrays", () => {
  assertEquals(generatePostgresColumnType({ kind: "text" }), "text");
  assertEquals(generatePostgresColumnType({ kind: "uuid" }), "uuid");
  assertEquals(
    generatePostgresColumnType({ kind: "varchar", length: 320 }),
    "varchar(320)",
  );
  assertEquals(
    generatePostgresColumnType({ kind: "numeric", precision: 10, scale: 2 }),
    "numeric(10, 2)",
  );
  assertEquals(
    generatePostgresColumnType({ kind: "timestamp" }),
    "timestamptz",
  );
  assertEquals(
    generatePostgresColumnType({ kind: "text", array: true }),
    "text[]",
  );
  // A dialect-specific override is emitted verbatim.
  assertEquals(
    generatePostgresColumnType({ kind: "custom", dialectType: "citext" }),
    "citext",
  );
});

Deno.test("@rootware/migrate/postgres - generatePostgresCreateTable renders columns, NOT NULL, defaults, PK", () => {
  const sql = generatePostgresCreateTable({
    name: "users",
    columns: [
      { name: "id", type: { kind: "uuid" }, nullable: false },
      { name: "email", type: { kind: "text" }, nullable: false },
      {
        name: "created_at",
        type: { kind: "timestamp" },
        nullable: false,
        default: { kind: "expression", sql: "now()" },
      },
      {
        name: "status",
        type: { kind: "text" },
        default: { kind: "literal", value: "active" },
      },
    ],
    primaryKey: { columns: ["id"] },
  });

  assertEquals(
    sql,
    `CREATE TABLE "users" (\n` +
      `  "id" uuid NOT NULL,\n` +
      `  "email" text NOT NULL,\n` +
      `  "created_at" timestamptz NOT NULL DEFAULT now(),\n` +
      `  "status" text DEFAULT 'active',\n` +
      `  PRIMARY KEY ("id")\n` +
      `);`,
  );
});

Deno.test("@rootware/migrate/postgres - quotePgIdent escapes embedded quotes", () => {
  assertEquals(quotePgIdent("table"), `"table"`);
  assertEquals(quotePgIdent('we"ird'), `"we""ird"`);
});

Deno.test("@rootware/migrate/postgres - generatePostgresUpStatements emits additive SQL and withholds destructive", () => {
  const from: RootwareSchemaSnapshot = {
    version: 1,
    tables: [
      {
        name: "users",
        columns: [{ name: "id", type: { kind: "uuid" } }],
      },
      { name: "legacy", columns: [{ name: "id", type: { kind: "uuid" } }] },
    ],
  };
  const to: RootwareSchemaSnapshot = {
    version: 1,
    tables: [
      {
        name: "users",
        columns: [
          { name: "id", type: { kind: "uuid" } },
          { name: "email", type: { kind: "text" }, nullable: false },
        ],
      },
      { name: "posts", columns: [{ name: "id", type: { kind: "uuid" } }] },
    ],
  };

  const { statements, destructive } = generatePostgresUpStatements(to, from);

  // CREATE TABLE for the new table and ADD COLUMN for the new column.
  assert(statements.some((sql) => sql.startsWith(`CREATE TABLE "posts"`)));
  assert(
    statements.some((sql) =>
      sql === `ALTER TABLE "users" ADD COLUMN "email" text NOT NULL;`
    ),
  );
  // The dropped "legacy" table is reported as destructive, never emitted.
  assert(!statements.some((sql) => sql.includes("DROP")));
  assertEquals(destructive.map((change) => change.kind), ["drop_table"]);

  // With no prior snapshot, every table is created.
  const initial = generatePostgresUpStatements(to);
  assertEquals(initial.statements.length, 2);
  assertEquals(initial.destructive, []);
});

Deno.test("@rootware/migrate/postgres - history reader coerces driver numeric/date types", async () => {
  // `@db/postgres` returns `double precision` as a string and `timestamptz` as a
  // Date; the history reader must accept both (regression for a real-DB bug).
  const executor: SqlExecutor = {
    execute<Row = Record<string, unknown>>(
      sql: string,
    ): Promise<QueryResult<Row>> {
      if (sql.toLowerCase().includes("select")) {
        return Promise.resolve({
          rows: [{
            id: "0001_init",
            checksum: "migr_abc",
            description: "init",
            appliedAt: new Date("2026-06-26T00:00:00.000Z"),
            executionMs: "12.5",
          }] as Row[],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [] as Row[], rowCount: 0 });
    },
  };

  const store = createPgMigrationHistoryStore({ executor });
  const applied = await store.listApplied();

  assertEquals(applied[0].executionMs, 12.5);
  assertEquals(applied[0].appliedAt, "2026-06-26T00:00:00.000Z");
});
