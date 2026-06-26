import { assertEquals, assertRejects } from "@std/assert";
import { createLogger, memorySink } from "@rootware/log";
import * as migrateRoot from "@rootware/migrate";
import { MigrationError } from "@rootware/migrate";
import {
  createPgMigrator,
  type QueryResult,
  type SqlExecutor,
} from "@rootware/migrate/postgres";

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
