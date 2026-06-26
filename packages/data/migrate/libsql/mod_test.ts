import { assert, assertEquals, assertRejects } from "@std/assert";
import { createLogger, memorySink } from "@rootware/log";
import * as migrateRoot from "@rootware/migrate";
import { MigrationError } from "@rootware/migrate";
import {
  createLibsqlMigrator,
  generateSqliteCreateTable,
  type LibsqlLikeClient,
  type LibsqlLikeTransaction,
  type LibsqlResultSet,
  type LibsqlStatement,
} from "@rootware/migrate/libsql";

/** Fake libSQL client simulating the migration history table (`?` params). */
class FakeLibsqlClient implements LibsqlLikeClient {
  readonly statements: LibsqlStatement[] = [];
  readonly applied = new Map<string, Record<string, unknown>>();
  transactions = 0;
  failOn?: RegExp;

  execute(statement: LibsqlStatement): Promise<LibsqlResultSet> {
    this.statements.push(statement);
    const sql = statement.sql;
    const params = statement.args ?? [];

    if (this.failOn?.test(sql)) {
      return Promise.reject(new Error("libsql failed"));
    }

    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (
      normalized.startsWith("select") &&
      normalized.includes('from "rootware_migrations"')
    ) {
      const rows = normalized.includes("where id = ?")
        ? [...this.applied.values()].filter((row) => row.id === params[0])
        : [...this.applied.values()].sort((a, b) =>
          String(a.id).localeCompare(String(b.id))
        );
      return Promise.resolve({ rows, rowsAffected: 0 });
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
      return Promise.resolve({ rows: [], rowsAffected: 1 });
    }

    if (normalized.startsWith('delete from "rootware_migrations"')) {
      const deleted = this.applied.delete(String(params[0]));
      return Promise.resolve({ rows: [], rowsAffected: deleted ? 1 : 0 });
    }

    return Promise.resolve({ rows: [], rowsAffected: 0 });
  }

  transaction(_mode?: string): Promise<LibsqlLikeTransaction> {
    this.transactions += 1;
    // deno-lint-ignore no-this-alias
    const client = this;
    return Promise.resolve({
      execute: (statement) => client.execute(statement),
      commit: () => Promise.resolve(),
      rollback: () => Promise.resolve(),
    });
  }

  close(): void {}
}

Deno.test("@rootware/migrate/libsql - applies pending migrations once and records metadata", async () => {
  const client = new FakeLibsqlClient();
  const sink = memorySink();
  const logger = createLogger({ level: "debug", base: null }, sink);
  const migrator = await createLibsqlMigrator({ client, logger });
  const migration = {
    id: "0001_create_notes",
    description: "create notes",
    up: ["create table notes (id integer primary key, body text not null)"],
  };

  const first = await migrator.migrate({ migrations: [migration] });
  const second = await migrator.migrate({ migrations: [migration] });

  assertEquals(first.executed.map((item) => item.id), ["0001_create_notes"]);
  assertEquals(second.executed, []);
  assert(client.transactions >= 1);
  assertEquals(
    client.applied.get("0001_create_notes")?.description,
    "create notes",
  );
  assertEquals(
    sink.records().map((record) => record.msg).filter((msg) =>
      msg === "migration started" || msg === "migration completed"
    ),
    ["migration started", "migration completed"],
  );
});

Deno.test("@rootware/migrate/libsql - maps failures into MigrationError", async () => {
  const client = new FakeLibsqlClient();
  client.failOn = /create table broken/;
  const migrator = await createLibsqlMigrator({ client });

  await assertRejects(
    () =>
      migrator.migrate({
        migrations: [{ id: "0001_broken", up: ["create table broken"] }],
      }),
    MigrationError,
    "libSQL query failed",
  );
});

Deno.test("@rootware/migrate/libsql - re-exports the SQLite DDL generators", () => {
  const sql = generateSqliteCreateTable({
    name: "notes",
    columns: [{ name: "id", type: { kind: "integer" }, nullable: false }],
    primaryKey: { columns: ["id"] },
  });
  assert(sql.includes('CREATE TABLE "notes"'));
  assert(sql.includes('"id" INTEGER'));
});

Deno.test("@rootware/migrate - root import does not expose libSQL exports", () => {
  assertEquals("createLibsqlMigrator" in migrateRoot, false);
});
