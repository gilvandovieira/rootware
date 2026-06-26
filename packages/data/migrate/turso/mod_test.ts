import { assert, assertEquals, assertThrows } from "@std/assert";
import { MigrationError } from "@rootware/migrate";
import {
  createTursoMigrator,
  generateSqliteCreateTable,
} from "@rootware/migrate/turso";
import type {
  LibsqlLikeClient,
  LibsqlResultSet,
  LibsqlStatement,
} from "@rootware/migrate/libsql";

function fakeClient(): LibsqlLikeClient {
  const applied = new Map<string, Record<string, unknown>>();
  const execute = (statement: LibsqlStatement): Promise<LibsqlResultSet> => {
    const sql = statement.sql.replace(/\s+/g, " ").trim().toLowerCase();
    const params = statement.args ?? [];
    if (sql.startsWith('insert into "rootware_migrations"')) {
      applied.set(String(params[0]), { id: params[0] });
      return Promise.resolve({ rows: [], rowsAffected: 1 });
    }
    if (
      sql.startsWith("select") && sql.includes('from "rootware_migrations"')
    ) {
      return Promise.resolve({ rows: [...applied.values()], rowsAffected: 0 });
    }
    return Promise.resolve({ rows: [], rowsAffected: 0 });
  };
  return {
    execute,
    transaction: () =>
      Promise.resolve({
        execute,
        commit: () => Promise.resolve(),
        rollback: () => Promise.resolve(),
      }),
    close: () => {},
  };
}

Deno.test("@rootware/migrate/turso - requires url and auth token", () => {
  assertThrows(
    () => createTursoMigrator({ url: "", authToken: "tok" }),
    MigrationError,
    "Turso database url is required",
  );
  assertThrows(
    () => createTursoMigrator({ url: "libsql://x.turso.io", authToken: "" }),
    MigrationError,
    "Turso auth token is required",
  );
});

Deno.test("@rootware/migrate/turso - delegates to the libSQL migrator", async () => {
  const migrator = await createTursoMigrator({ client: fakeClient() });

  const result = await migrator.migrate({
    migrations: [{
      id: "0001_init",
      up: ["create table notes (id integer primary key)"],
    }],
  });
  assertEquals(result.executed.map((item) => item.id), ["0001_init"]);
});

Deno.test("@rootware/migrate/turso - re-exports the SQLite DDL generators", () => {
  const sql = generateSqliteCreateTable({
    name: "notes",
    columns: [{ name: "id", type: { kind: "integer" }, nullable: false }],
    primaryKey: { columns: ["id"] },
  });
  assert(sql.includes('CREATE TABLE "notes"'));
});
