/**
 * End-to-end integration of the `@rootware/migrate/cli` SQL-first workflow
 * against live PostgreSQL: `generate` (writing real files via
 * `denoMigrationFileSystem` into a temp dir) → `check` (drift) → `migrate`
 * (applying through the real Postgres runner) → `check` (clean) → re-`migrate`
 * (no-op). Run once per configured Postgres version.
 *
 * Excluded from `deno task test`; run with `deno task test:integration` after
 * `docker compose up -d --wait`.
 */

import { assert, assertEquals } from "@std/assert";
import {
  columns,
  createSchemaSnapshot,
  defineTable,
  identifier,
  sql,
} from "@rootware/orm";
import { createPgDb } from "@rootware/orm/postgres";
import { defineConfig, denoMigrationFileSystem } from "@rootware/migrate";
import { createPgPool } from "@rootware/migrate/postgres";
import {
  createPostgresMigrateRunner,
  parseMigrateCliArgs,
  runMigrateCli,
} from "@rootware/migrate/cli";
import { canReach, type DbTarget, pgTargets, redactUrl } from "./config.ts";

Deno.test("integration: migrate CLI workflow on PostgreSQL", async (t) => {
  const targets = pgTargets();
  let reachable = 0;

  for (const target of targets) {
    const up = await canReach(target.url);
    if (up) {
      reachable += 1;
    }
    await t.step({
      name: `${target.label} — ${redactUrl(target.url)}`,
      ignore: !up,
      fn: () => runCliWorkflow(target),
    });
  }

  if (reachable === 0) {
    throw new Error(
      "No PostgreSQL targets were reachable. Start them with " +
        "`docker compose up -d --wait` (or set RW_PG_URLS).",
    );
  }
});

async function runCliWorkflow(target: DbTarget): Promise<void> {
  const suffix = `${Date.now().toString(36)}${
    Math.random().toString(36).slice(2, 8)
  }`;
  const tableName = `it_cli_${suffix}`;
  const historyTable = `it_cli_migrations_${suffix}`;
  const dir = await Deno.makeTempDir({ prefix: "rootware_migrate_" });

  const widget = defineTable(tableName, {
    id: columns.uuid().primaryKey(),
    label: columns.text().notNull(),
  });
  const config = defineConfig({
    dir,
    dialect: "postgres",
    snapshot: createSchemaSnapshot({
      tables: { widget },
      dialect: "postgres",
    }),
    databaseUrl: target.url,
    historyTable,
  });
  const fs = denoMigrationFileSystem();
  const pool = createPgPool({ url: target.url });
  const runner = createPostgresMigrateRunner({ pool, historyTable });
  const db = await createPgDb({ url: target.url });

  try {
    // generate: writes a real .sql + .snapshot.json into the temp dir.
    assertEquals(
      (await runMigrateCli(parseMigrateCliArgs(["generate", "create_widget"]), {
        config,
        fs,
      })).code,
      0,
    );
    const files = [...Deno.readDirSync(dir)].map((entry) => entry.name);
    assert(files.some((name) => name.endsWith(".sql")));
    assert(files.some((name) => name.endsWith(".snapshot.json")));

    // check before applying: the generated migration is pending -> drift.
    assertEquals(
      (await runMigrateCli(parseMigrateCliArgs(["check"]), {
        config,
        fs,
        runner,
      }))
        .code,
      1,
    );

    // migrate: applies through the real Postgres runner.
    assertEquals(
      (await runMigrateCli(parseMigrateCliArgs(["migrate"]), {
        config,
        fs,
        runner,
      })).code,
      0,
    );

    // the table really exists.
    const cols = await db.query<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_name = ${tableName} order by column_name
    `);
    assertEquals(cols.rows.map((row) => row.column_name), ["id", "label"]);

    // check after applying: clean.
    assertEquals(
      (await runMigrateCli(parseMigrateCliArgs(["check"]), {
        config,
        fs,
        runner,
      }))
        .code,
      0,
    );

    // re-running migrate is a no-op.
    assertEquals(
      (await runMigrateCli(parseMigrateCliArgs(["migrate"]), {
        config,
        fs,
        runner,
      })).code,
      0,
    );
    assertEquals(await runner.applied(), [
      [...Deno.readDirSync(dir)]
        .map((entry) => entry.name)
        .find((name) => name.endsWith(".sql"))!
        .replace(/\.sql$/, ""),
    ]);
  } finally {
    await db.execute(
      sql`drop table if exists ${identifier(tableName)} cascade`,
    ).catch(() => {});
    await db.execute(
      sql`drop table if exists ${identifier(historyTable)} cascade`,
    ).catch(() => {});
    await db.close();
    await pool.end?.();
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}
