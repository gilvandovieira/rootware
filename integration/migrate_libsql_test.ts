/**
 * Real-execution integration of `@rootware/migrate/libsql` against a live libSQL
 * server (sqld from `compose.yaml`): apply a migration, verify it is recorded,
 * re-apply (no-op), roll back, and confirm the table is gone. Skipped when the
 * libSQL server is unreachable.
 *
 * Excluded from `deno task test`; run with `deno task test:integration` (grants
 * `--allow-net`/`--allow-env` and pulls `npm:@libsql/client`).
 */

import { assert, assertEquals } from "@std/assert";
import {
  createLibsqlMigrator,
  openLibsqlClient,
} from "@rootware/migrate/libsql";
import { createLibsqlDb } from "@rootware/orm/libsql";
import { canReach, libsqlTarget } from "./config.ts";

Deno.test("integration: @rootware/migrate/libsql against a live libSQL server", async (t) => {
  const target = libsqlTarget();
  const up = await canReach(target.url);

  await t.step({
    name: `libSQL — ${target.url}`,
    ignore: !up,
    fn: async () => {
      // Share one client between the migrator and a query connection.
      const client = await openLibsqlClient(target);
      const suffix = `${Date.now().toString(36)}${
        Math.random().toString(36).slice(2, 8)
      }`;
      const table = `it_libsql_mig_${suffix}`;
      const historyTable = `it_libsql_history_${suffix}`;

      const migrator = await createLibsqlMigrator({ client, historyTable });
      const db = await createLibsqlDb({ client });

      const migration = {
        id: "0001_create",
        description: "create table",
        up: [`create table ${table} (id integer primary key, body text)`],
        down: [`drop table ${table}`],
      };

      try {
        const first = await migrator.migrate({ migrations: [migration] });
        assertEquals(first.executed.map((item) => item.id), ["0001_create"]);
        assertEquals((await migrator.applied()).map((row) => row.id), [
          "0001_create",
        ]);

        await db.execute(`insert into ${table} (id, body) values (?, ?)`, [
          1,
          "hi",
        ]);
        const rows = await db.execute<{ count: number }>(
          `select count(*) as count from ${table}`,
        );
        assertEquals(Number(rows.rows[0].count), 1);

        // Re-running is a no-op.
        assertEquals(
          (await migrator.migrate({ migrations: [migration] })).executed,
          [],
        );

        // Rolling back removes the table and the history row.
        await migrator.rollback({ migrations: [migration], steps: 1 });
        assertEquals((await migrator.applied()).length, 0);

        const exists = await db.execute<{ name: string }>(
          `select name from sqlite_master where type = 'table' and name = '${table}'`,
        );
        assertEquals(exists.rows.length, 0);
        assert(true);
      } finally {
        await db.execute(`drop table if exists ${table}`).catch(() => {});
        await migrator.close();
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
