import { assertEquals, assertRejects } from "@std/assert";
import { createLogger, memorySink } from "@rootware/log";
import * as ormRoot from "@rootware/orm";
import { columns, defineTable, eq, OrmError } from "@rootware/orm";
import {
  createSqliteDb,
  sqliteColumnAffinity,
  type SqliteLikeDatabase,
  type SqliteStatement,
  statementReturnsRows,
} from "@rootware/orm/sqlite";

/** Fake {@link SqliteLikeDatabase} so the adapter is testable without `@db/sqlite`. */
class FakeSqliteDatabase implements SqliteLikeDatabase {
  readonly queries: Array<
    { readonly sql: string; readonly params: unknown[] }
  > = [];
  rows: Record<string, unknown>[] = [];
  changes = 0;
  error?: unknown;
  closed = false;

  prepare(sql: string): SqliteStatement {
    // deno-lint-ignore no-this-alias
    const db = this;
    return {
      all(...params: readonly unknown[]): Record<string, unknown>[] {
        db.queries.push({ sql, params: [...params] });
        if (db.error !== undefined) throw db.error;
        return db.rows;
      },
      run(...params: readonly unknown[]): number {
        db.queries.push({ sql, params: [...params] });
        if (db.error !== undefined) throw db.error;
        return db.changes;
      },
    };
  }

  close(): void {
    this.closed = true;
  }
}

Deno.test("@rootware/orm/sqlite - executes parameterized SELECT with ? placeholders", async () => {
  const database = new FakeSqliteDatabase();
  database.rows = [{ ok: 1 }];
  const db = await createSqliteDb({ database });

  const result = await db.execute<{ ok: number }>("select ? as ok", [1]);

  assertEquals(result.rows, [{ ok: 1 }]);
  assertEquals(result.rowCount, 1);
  assertEquals(database.queries, [{ sql: "select ? as ok", params: [1] }]);
});

Deno.test("@rootware/orm/sqlite - non-SELECT reports the change count", async () => {
  const database = new FakeSqliteDatabase();
  database.changes = 3;
  const db = await createSqliteDb({ database });

  const result = await db.execute("delete from users where active = ?", [0]);

  assertEquals(result.rows, []);
  assertEquals(result.rowCount, 3);
});

Deno.test("@rootware/orm/sqlite - renders core builders for the sqlite dialect", async () => {
  const database = new FakeSqliteDatabase();
  const db = await createSqliteDb({ database });
  const users = defineTable("users", { id: columns.text().primaryKey() });

  await db.select().from(users).where(eq(users.columns.id, "u_1")).execute();

  assertEquals(database.queries.at(-1), {
    sql: 'select * from "users" where "users"."id" = ?',
    params: ["u_1"],
  });
});

Deno.test("@rootware/orm/sqlite - wraps query errors in OrmError", async () => {
  const database = new FakeSqliteDatabase();
  database.error = new Error("no such table");
  const db = await createSqliteDb({ database });

  await assertRejects(
    () => db.execute("select * from missing"),
    OrmError,
    "SQLite query failed",
  );
});

Deno.test("@rootware/orm/sqlite - transactions wrap BEGIN/COMMIT", async () => {
  const database = new FakeSqliteDatabase();
  const db = await createSqliteDb({ database });

  await db.transaction(async (tx) => {
    await tx.execute("insert into t (id) values (?)", ["a"]);
  });

  assertEquals(database.queries.map((q) => q.sql), [
    "begin",
    "insert into t (id) values (?)",
    "commit",
  ]);
});

Deno.test("@rootware/orm/sqlite - logs query execution", async () => {
  const sink = memorySink();
  const logger = createLogger({ level: "debug", base: null }, sink);
  const database = new FakeSqliteDatabase();
  const db = await createSqliteDb({ database, logger });

  await db.execute("select 1 as ok");

  assertEquals(
    sink.records().map((record) => record.msg),
    ["orm query started", "orm query completed"],
  );
});

Deno.test("@rootware/orm/sqlite - sqliteColumnAffinity maps types to storage classes", () => {
  assertEquals(sqliteColumnAffinity("text"), "TEXT");
  assertEquals(sqliteColumnAffinity("varchar"), "TEXT");
  assertEquals(sqliteColumnAffinity("uuid"), "TEXT");
  assertEquals(sqliteColumnAffinity("json"), "TEXT");
  assertEquals(sqliteColumnAffinity("timestamp"), "TEXT");
  assertEquals(sqliteColumnAffinity("integer"), "INTEGER");
  assertEquals(sqliteColumnAffinity("bigint"), "INTEGER");
  assertEquals(sqliteColumnAffinity("boolean"), "INTEGER");
  assertEquals(sqliteColumnAffinity("number"), "REAL");
});

Deno.test("@rootware/orm/sqlite - statementReturnsRows detects row-producing SQL", () => {
  assertEquals(statementReturnsRows("select 1"), true);
  assertEquals(
    statementReturnsRows("  WITH x AS (select 1) select * from x"),
    true,
  );
  assertEquals(statementReturnsRows("pragma table_info(t)"), true);
  assertEquals(statementReturnsRows("insert into t values (1)"), false);
  assertEquals(
    statementReturnsRows("insert into t values (1) returning id"),
    true,
  );
});

Deno.test("@rootware/orm - root import does not expose SQLite exports", () => {
  assertEquals("createSqliteDb" in ormRoot, false);
  assertEquals("createSqliteOrmDriver" in ormRoot, false);
});
