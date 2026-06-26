/**
 * Real-execution integration of `@rootware/migrate/sqlite` against an in-memory
 * `@db/sqlite` database: apply a migration, verify it is recorded, re-apply
 * (no-op), roll back, and confirm the table is gone. No Docker service needed,
 * only local FFI.
 *
 * Excluded from `deno task test` (which is permission-free); run with
 * `deno task test:integration`, which grants `--allow-ffi`/`--allow-env`/
 * `--allow-read`/`--allow-net`.
 */

import { assert, assertEquals } from "@std/assert";
import { createSqliteMigrator } from "@rootware/migrate/sqlite";
import { createSqliteDb } from "@rootware/orm/sqlite";

Deno.test("integration: @rootware/migrate/sqlite applies and rolls back on real SQLite", async () => {
  // Share one in-memory database between the migrator and a query connection.
  const { openSqliteDatabase } = await import("@rootware/migrate/sqlite");
  const database = await openSqliteDatabase({ path: ":memory:" });

  const migrator = await createSqliteMigrator({ database });
  const db = await createSqliteDb({ database });

  const migration = {
    id: "0001_create_notes",
    description: "create notes",
    up: [
      `create table notes (
        id integer primary key,
        body text not null
      )`,
    ],
    down: ["drop table notes"],
  };

  try {
    const first = await migrator.migrate({ migrations: [migration] });
    assertEquals(first.executed.map((item) => item.id), ["0001_create_notes"]);

    // The history records exactly one applied migration.
    const applied = await migrator.applied();
    assertEquals(applied.map((row) => row.id), ["0001_create_notes"]);

    // The real table exists and is usable.
    await db.execute("insert into notes (id, body) values (?, ?)", [1, "hi"]);
    const rows = await db.execute<{ count: number }>(
      "select count(*) as count from notes",
    );
    assertEquals(rows.rows[0].count, 1);

    // Re-running is a no-op.
    const second = await migrator.migrate({ migrations: [migration] });
    assertEquals(second.executed, []);

    // Rolling back removes the table and the history row.
    await migrator.rollback({ migrations: [migration], steps: 1 });
    assertEquals((await migrator.applied()).length, 0);

    const tables = await db.execute<{ name: string }>(
      "select name from sqlite_master where type = 'table' and name = 'notes'",
    );
    assertEquals(tables.rows.length, 0);
    assert(true);
  } finally {
    await migrator.close();
  }
});
