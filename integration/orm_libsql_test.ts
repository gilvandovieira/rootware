/**
 * Real-execution integration of `@rootware/orm/libsql` against a live libSQL
 * server (sqld from `compose.yaml`). Exercises DDL, parameterized insert/select
 * via the core query builders, and an interactive transaction with commit +
 * rollback. Skipped when the libSQL server is unreachable.
 *
 * Excluded from `deno task test`; run with `deno task test:integration` (grants
 * `--allow-net`/`--allow-env`/`--allow-read` and pulls `npm:@libsql/client`).
 */

import { assert, assertEquals } from "@std/assert";
import { columns, defineTable, eq } from "@rootware/orm";
import { createLibsqlDb } from "@rootware/orm/libsql";
import { canReach, libsqlTarget } from "./config.ts";

Deno.test("integration: @rootware/orm/libsql against a live libSQL server", async (t) => {
  const target = libsqlTarget();
  const up = await canReach(target.url);

  await t.step({
    name: `libSQL — ${target.url}`,
    ignore: !up,
    fn: async () => {
      const db = await createLibsqlDb(target);
      const suffix = `${Date.now().toString(36)}${
        Math.random().toString(36).slice(2, 8)
      }`;
      const table = `it_libsql_${suffix}`;
      const notes = defineTable(table, {
        id: columns.integer().primaryKey(),
        body: columns.text().notNull(),
        done: columns.boolean().notNull(),
      });

      try {
        await db.execute(
          `create table ${table} (id integer primary key, body text not null, done integer not null)`,
        );

        await db.execute(
          `insert into ${table} (id, body, done) values (?, ?, ?)`,
          [1, "first", 0],
        );

        const open = await db.select().from(notes).where(
          eq(notes.columns.done, 0),
        ).execute();
        assertEquals(open.map((row) => row.body), ["first"]);

        // A failing interactive transaction rolls back.
        await db.transaction(async (tx) => {
          await tx.execute(
            `insert into ${table} (id, body, done) values (?, ?, ?)`,
            [2, "second", 1],
          );
          throw new Error("boom");
        }).catch(() => {});

        const afterRollback = await db.execute<{ count: number }>(
          `select count(*) as count from ${table}`,
        );
        assertEquals(Number(afterRollback.rows[0].count), 1);

        // A committed transaction persists.
        await db.transaction(async (tx) => {
          await tx.execute(
            `insert into ${table} (id, body, done) values (?, ?, ?)`,
            [3, "third", 1],
          );
        });
        const afterCommit = await db.execute<{ count: number }>(
          `select count(*) as count from ${table}`,
        );
        assertEquals(Number(afterCommit.rows[0].count), 2);
        assert(true);
      } finally {
        await db.execute(`drop table if exists ${table}`).catch(() => {});
        await db.close();
      }
    },
  });

  if (!up) {
    console.warn(
      `Skipped: libSQL not reachable at ${target.url}. Start it with ` +
        "`docker compose up -d --wait libsql`.",
    );
  }
});
