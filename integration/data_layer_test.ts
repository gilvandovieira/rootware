/**
 * Real integration of the data layer (`@rootware/orm` + `@rootware/schema` +
 * `@rootware/migrate`) against live PostgreSQL, run once per configured version.
 *
 * Flow per version: define ORM tables → build a `@rootware/schema` snapshot
 * (orm) → generate PostgreSQL DDL from the snapshot (migrate/postgres) → apply
 * it through the real `createPgMigrator` → verify the table via
 * `information_schema` → exercise real CRUD with the `eq` / `inArray` / `ilike`
 * builders → evolve the schema and apply a generated `ALTER TABLE` via a second
 * migration. Each run uses unique object names and drops them afterward.
 *
 * Excluded from `deno task test`; run with `deno task test:integration` after
 * `docker compose up -d --wait`.
 */

import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  columns,
  createSchemaSnapshot,
  defineTable,
  eq,
  identifier,
  ilike,
  inArray,
  sql,
} from "@rootware/orm";
import { createPgDb } from "@rootware/orm/postgres";
import {
  createPgMigrator,
  createPgPool,
  generatePostgresUpStatements,
} from "@rootware/migrate/postgres";
import { diffSchemaSnapshots } from "@rootware/schema";
import { canReach, type DbTarget, pgTargets, redactUrl } from "./config.ts";

Deno.test("integration: data layer (orm + schema + migrate) on PostgreSQL", async (t) => {
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
      fn: () => runDataLayerSuite(target),
    });
  }

  if (reachable === 0) {
    throw new Error(
      "No PostgreSQL targets were reachable. Start them with " +
        "`docker compose up -d --wait` (or set RW_PG_URLS).",
    );
  }
});

async function runDataLayerSuite(target: DbTarget): Promise<void> {
  const suffix = uniqueSuffix();
  const tableName = `it_users_${suffix}`;
  const postsName = `it_posts_${suffix}`;
  const historyTable = `it_migrations_${suffix}`;

  const usersV1 = defineTable(tableName, {
    id: columns.uuid().primaryKey(),
    email: columns.text().notNull(),
    name: columns.text().nullable(),
    age: columns.integer().nullable(),
  });

  const db = await createPgDb({ url: target.url });
  const migratorPool = createPgPool({ url: target.url });
  const migrator = await createPgMigrator({
    pool: migratorPool,
    historyTable,
  });

  try {
    // 1. ORM table -> schema snapshot -> generated CREATE TABLE.
    const v1 = createSchemaSnapshot({
      tables: { users: usersV1 },
      dialect: "postgres",
    });
    const create = generatePostgresUpStatements(v1);
    assert(
      create.statements.some((statement) =>
        statement.includes(`CREATE TABLE "${tableName}"`)
      ),
      "expected a CREATE TABLE statement",
    );
    assertEquals(create.destructive, []);

    // 2. Apply through the real migrator; re-running is a no-op (idempotent).
    const migrationId = `0001_create_${suffix}`;
    const first = await migrator.migrate({
      migrations: [{ id: migrationId, up: [...create.statements] }],
    });
    assertEquals(first.executed.map((entry) => entry.id), [migrationId]);

    const second = await migrator.migrate({
      migrations: [{ id: migrationId, up: [...create.statements] }],
    });
    assertEquals(second.executed, []);

    // 3. The table really exists with the expected columns.
    assertEquals(await columnNames(db, tableName), [
      "age",
      "email",
      "id",
      "name",
    ]);

    // 4. Real CRUD through the builders, including the v0.3 predicates.
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(usersV1).values([
      { id: ids[0], email: "alice@Acme.com", name: "Alice", age: 30 },
      { id: ids[1], email: "bob@acme.com", name: "Bob", age: 40 },
      { id: ids[2], email: "carol@other.com", name: null, age: null },
    ]).execute();

    const inArrayRows = await db.select().from(usersV1).where(
      inArray(usersV1.columns.id, [ids[0], ids[1]]),
    ).execute();
    assertEquals(inArrayRows.length, 2);

    const ilikeRows = await db.select().from(usersV1).where(
      ilike(usersV1.columns.email, "%@acme.com"),
    ).execute();
    // ILIKE is case-insensitive: alice@Acme.com and bob@acme.com both match.
    assertEquals(ilikeRows.length, 2);

    await db.update(usersV1).set({ name: "Robert" }).where(
      eq(usersV1.columns.id, ids[1]),
    ).execute();
    const updated = await db.select().from(usersV1).where(
      eq(usersV1.columns.id, ids[1]),
    ).execute();
    assertEquals(updated[0]?.name, "Robert");

    await db.delete(usersV1).where(eq(usersV1.columns.id, ids[2])).execute();
    const remaining = await db.select().from(usersV1).execute();
    assertEquals(remaining.length, 2);

    // 5. Evolve the schema: diff -> generated ALTER TABLE ADD COLUMN -> apply.
    const usersV2 = defineTable(tableName, {
      id: columns.uuid().primaryKey(),
      email: columns.text().notNull(),
      name: columns.text().nullable(),
      age: columns.integer().nullable(),
      status: columns.text().nullable(),
    });
    const v2 = createSchemaSnapshot({
      tables: { users: usersV2 },
      dialect: "postgres",
    });

    const diff = diffSchemaSnapshots(v1, v2);
    assertEquals(
      diff.changedTables[0]?.columns.added.map((column) => column.name),
      ["status"],
    );

    const alter = generatePostgresUpStatements(v2, v1);
    assert(
      alter.statements.some((statement) =>
        statement.includes("ADD COLUMN") && statement.includes("status")
      ),
      "expected an ALTER TABLE ADD COLUMN statement",
    );

    const alterId = `0002_add_status_${suffix}`;
    await migrator.migrate({
      migrations: [{ id: alterId, up: [...alter.statements] }],
    });
    assertEquals(
      await columnNames(db, tableName),
      ["age", "email", "id", "name", "status"],
    );

    // 6. Joins: a posts table left-joined to users via a projected select.
    const posts = defineTable(postsName, {
      id: columns.uuid().primaryKey(),
      userId: columns.uuid().notNull(),
      title: columns.text().notNull(),
    });
    for (
      const statement of generatePostgresUpStatements(
        createSchemaSnapshot({ tables: { posts }, dialect: "postgres" }),
      ).statements
    ) {
      await db.execute(statement);
    }
    await db.insert(posts).values({
      id: crypto.randomUUID(),
      userId: ids[0],
      title: "Hello",
    }).execute();

    const joined = await db.select({
      name: usersV1.columns.name,
      title: posts.columns.title,
    })
      .from(usersV1)
      .leftJoin(posts, eq(posts.columns.userId, usersV1.columns.id))
      .orderBy(usersV1.columns.email, "asc")
      .execute();
    // alice has a post; bob (renamed Robert) has none -> null on the left join.
    const aliceRow = joined.find((row) => row.title === "Hello");
    assert(aliceRow !== undefined);
    assert(joined.some((row) => row.title === null));

    // 7. Real transactions: a throwing transaction rolls back.
    const rollbackId = crypto.randomUUID();
    await assertRejects(() =>
      db.transaction(async (tx) => {
        await tx.insert(usersV1).values({
          id: rollbackId,
          email: "rollback@example.com",
          name: "Rollback",
          age: null,
        }).execute();
        throw new Error("force rollback");
      })
    );
    assertEquals(
      (await db.select().from(usersV1).where(
        eq(usersV1.columns.id, rollbackId),
      ).execute()).length,
      0,
    );

    // A committing transaction persists.
    const commitId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(usersV1).values({
        id: commitId,
        email: "commit@example.com",
        name: "Commit",
        age: null,
      }).execute();
    });
    assertEquals(
      (await db.select().from(usersV1).where(
        eq(usersV1.columns.id, commitId),
      ).execute()).length,
      1,
    );
  } finally {
    await db.execute(
      sql`drop table if exists ${identifier(postsName)} cascade`,
    ).catch(() => {});
    await db.execute(
      sql`drop table if exists ${identifier(tableName)} cascade`,
    ).catch(() => {});
    await db.execute(
      sql`drop table if exists ${identifier(historyTable)} cascade`,
    ).catch(() => {});
    await migratorPool.end?.();
    await db.close();
  }
}

async function columnNames(
  db: Awaited<ReturnType<typeof createPgDb>>,
  tableName: string,
): Promise<string[]> {
  const result = await db.query<{ column_name: string }>(sql`
    select column_name
    from information_schema.columns
    where table_name = ${tableName}
    order by column_name
  `);
  return result.rows.map((row) => row.column_name);
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
