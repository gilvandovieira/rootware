/**
 * Real-execution integration of `@rootware/orm/sqlite` against an in-memory
 * `@db/sqlite` database. Exercises DDL, parameterized insert/select via the
 * core query builders, a transaction, and rollback — no Docker service needed,
 * only local FFI.
 *
 * Excluded from `deno task test` (which is permission-free); run with
 * `deno task test:integration`, which grants `--allow-ffi`/`--allow-env`/
 * `--allow-read`.
 */

import { assert, assertEquals } from "@std/assert";
import { columns, defineTable, eq } from "@rootware/orm";
import { createSqliteDb, sqliteColumnAffinity } from "@rootware/orm/sqlite";

Deno.test("integration: @rootware/orm/sqlite executes against in-memory SQLite", async () => {
  const db = await createSqliteDb({ path: ":memory:" });

  const notes = defineTable("notes", {
    id: columns.integer().primaryKey(),
    body: columns.text().notNull(),
    done: columns.boolean().notNull(),
  });

  try {
    // DDL using the affinity mapping the package exposes (constants, not input).
    await db.execute(
      `create table notes (
        id ${sqliteColumnAffinity("integer")} primary key,
        body ${sqliteColumnAffinity("text")} not null,
        done ${sqliteColumnAffinity("boolean")} not null
      )`,
    );

    await db.execute(
      "insert into notes (id, body, done) values (?, ?, ?)",
      [1, "first", 0],
    );
    await db.execute(
      "insert into notes (id, body, done) values (?, ?, ?)",
      [2, "second", 1],
    );

    // Core query builder renders `?` placeholders and quotes identifiers.
    const open = await db.select().from(notes).where(eq(notes.columns.done, 0))
      .execute();
    assertEquals(open.map((row) => row.body), ["first"]);

    const all = await db.execute<{ count: number }>(
      "select count(*) as count from notes",
    );
    assertEquals(all.rows[0].count, 2);

    // A failing transaction rolls back.
    await db.transaction(async (tx) => {
      await tx.execute("insert into notes (id, body, done) values (?, ?, ?)", [
        3,
        "third",
        0,
      ]);
      throw new Error("boom");
    }).catch(() => {});

    const afterRollback = await db.execute<{ count: number }>(
      "select count(*) as count from notes",
    );
    assertEquals(afterRollback.rows[0].count, 2);

    // A committed transaction persists.
    await db.transaction(async (tx) => {
      await tx.execute("insert into notes (id, body, done) values (?, ?, ?)", [
        4,
        "fourth",
        1,
      ]);
    });

    const afterCommit = await db.execute<{ count: number }>(
      "select count(*) as count from notes",
    );
    assertEquals(afterCommit.rows[0].count, 3);
    assert(true);
  } finally {
    await db.close();
  }
});
