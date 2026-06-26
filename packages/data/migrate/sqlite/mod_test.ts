import { assert, assertEquals, assertRejects } from "@std/assert";
import { createLogger, memorySink } from "@rootware/log";
import * as migrateRoot from "@rootware/migrate";
import { MigrationError } from "@rootware/migrate";
import {
  createSqliteMigrator,
  generateSqliteColumnType,
  generateSqliteCreateTable,
  generateSqliteUpStatements,
  type QueryResult,
  quoteSqliteIdent,
  type SqlExecutor,
} from "@rootware/migrate/sqlite";
import type { RootwareSchemaSnapshot } from "@rootware/schema";

/** Fake executor simulating the SQLite migration history table (`?` params). */
class FakeSqlExecutor implements SqlExecutor {
  readonly queries: Array<
    { readonly sql: string; readonly params: readonly unknown[] }
  > = [];
  readonly applied = new Map<string, Record<string, unknown>>();
  transactionCount = 0;
  failOn?: RegExp;

  execute<Row = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.queries.push({ sql, params: [...params] });

    if (this.failOn?.test(sql)) {
      return Promise.reject(new Error("sqlite failed"));
    }

    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("create table if not exists")) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    if (
      normalized.startsWith("select") &&
      normalized.includes('from "rootware_migrations"')
    ) {
      const rows = normalized.includes("where id = ?")
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

Deno.test("@rootware/migrate/sqlite - applies pending migrations once and records metadata", async () => {
  const executor = new FakeSqlExecutor();
  const sink = memorySink();
  const logger = createLogger({ level: "debug", base: null }, sink);
  const migrator = await createSqliteMigrator({ executor, logger });
  const migration = {
    id: "0001_create_notes",
    description: "create notes",
    up: [
      `create table notes (
        id integer primary key,
        body text not null
      )`,
    ],
  };

  const first = await migrator.migrate({ migrations: [migration] });
  const second = await migrator.migrate({ migrations: [migration] });

  assertEquals(first.executed.map((item) => item.id), ["0001_create_notes"]);
  assertEquals(second.executed, []);
  assertEquals(executor.transactionCount, 1);
  assertEquals(
    executor.applied.get("0001_create_notes")?.description,
    "create notes",
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

Deno.test("@rootware/migrate/sqlite - maps failures into MigrationError and logs failure", async () => {
  const executor = new FakeSqlExecutor();
  executor.failOn = /create table broken/;
  const sink = memorySink();
  const logger = createLogger({ level: "debug", base: null }, sink);
  const migrator = await createSqliteMigrator({ executor, logger });

  await assertRejects(
    () =>
      migrator.migrate({
        migrations: [{ id: "0001_broken", up: ["create table broken"] }],
      }),
    MigrationError,
    "SQLite query failed",
  );
  assertEquals(
    sink.records().some((record) => record.msg === "migration failed"),
    true,
  );
});

Deno.test("@rootware/migrate - root import does not expose SQLite exports", () => {
  assertEquals("createSqliteMigrator" in migrateRoot, false);
  assertEquals("createSqliteMigrationDriver" in migrateRoot, false);
});

Deno.test("@rootware/migrate/sqlite - generateSqliteColumnType maps kinds to affinities", () => {
  assertEquals(generateSqliteColumnType({ kind: "text" }), "TEXT");
  assertEquals(generateSqliteColumnType({ kind: "uuid" }), "TEXT");
  assertEquals(
    generateSqliteColumnType({ kind: "varchar", length: 320 }),
    "TEXT",
  );
  assertEquals(generateSqliteColumnType({ kind: "timestamp" }), "TEXT");
  assertEquals(generateSqliteColumnType({ kind: "json" }), "TEXT");
  assertEquals(generateSqliteColumnType({ kind: "integer" }), "INTEGER");
  assertEquals(generateSqliteColumnType({ kind: "bigint" }), "INTEGER");
  assertEquals(generateSqliteColumnType({ kind: "boolean" }), "INTEGER");
  assertEquals(generateSqliteColumnType({ kind: "numeric" }), "REAL");
  assertEquals(generateSqliteColumnType({ kind: "bytea" }), "BLOB");
});

Deno.test("@rootware/migrate/sqlite - generateSqliteCreateTable renders columns, NOT NULL, defaults, PK", () => {
  const sql = generateSqliteCreateTable({
    name: "notes",
    columns: [
      { name: "id", type: { kind: "integer" }, nullable: false },
      { name: "body", type: { kind: "text" }, nullable: false },
      {
        name: "created_at",
        type: { kind: "timestamp" },
        nullable: false,
        default: { kind: "expression", sql: "current_timestamp" },
      },
      {
        name: "done",
        type: { kind: "boolean" },
        default: { kind: "literal", value: false },
      },
    ],
    primaryKey: { columns: ["id"] },
  });

  assertEquals(
    sql,
    `CREATE TABLE "notes" (\n` +
      `  "id" INTEGER NOT NULL,\n` +
      `  "body" TEXT NOT NULL,\n` +
      `  "created_at" TEXT NOT NULL DEFAULT current_timestamp,\n` +
      `  "done" INTEGER DEFAULT 0,\n` +
      `  PRIMARY KEY ("id")\n` +
      `);`,
  );
});

Deno.test("@rootware/migrate/sqlite - generateSqliteUpStatements is additive and withholds destructive changes", () => {
  const from: RootwareSchemaSnapshot = {
    version: 1,
    tables: [
      {
        name: "notes",
        columns: [{ name: "id", type: { kind: "integer" }, nullable: false }],
        primaryKey: { columns: ["id"] },
      },
      {
        name: "legacy",
        columns: [{ name: "id", type: { kind: "integer" }, nullable: false }],
      },
    ],
  };
  const to: RootwareSchemaSnapshot = {
    version: 1,
    tables: [
      {
        name: "notes",
        columns: [
          { name: "id", type: { kind: "integer" }, nullable: false },
          { name: "body", type: { kind: "text" }, nullable: false },
        ],
        primaryKey: { columns: ["id"] },
      },
      {
        name: "tags",
        columns: [{ name: "id", type: { kind: "integer" }, nullable: false }],
        primaryKey: { columns: ["id"] },
      },
    ],
  };

  const { statements, destructive } = generateSqliteUpStatements(to, from);

  // New table created, new column added — both additive.
  assert(statements.some((sql) => sql.includes('CREATE TABLE "tags"')));
  assert(
    statements.some((sql) =>
      sql.includes('ALTER TABLE "notes" ADD COLUMN "body"')
    ),
  );
  // Dropping "legacy" is destructive and never emitted as ordinary SQL.
  assert(destructive.length > 0);
  assertEquals(quoteSqliteIdent('a"b'), '"a""b"');
});
