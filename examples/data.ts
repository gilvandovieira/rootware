import { assert, assertEquals, assertExists } from "@rootware/testing";
import {
  assertValidSchemaSnapshot,
  deserializeSchemaSnapshot,
  equalSchemaSnapshots,
  serializeSchemaSnapshot,
  validateSchemaSnapshot,
} from "@rootware/schema";
import {
  and,
  columns,
  createDatabase,
  createSchemaSnapshot,
  defineTable,
  eq,
  gt,
  identifier,
  type InferInsert,
  isNotNull,
  memoryOrmDriver,
  renderSql,
  sql,
  toSql,
} from "@rootware/orm";
import {
  assertMigrationChecksum,
  calculateMigrationChecksum,
  createAppliedMigration,
  createMigrationPlan,
  createMigrator,
  defineMigration,
  defineSchemaMigrationPlan,
  defineSqlMigration,
  getAppliedMigrations,
  getPendingMigrations,
  getRollbackMigrations,
  memoryMigrationStore,
  type MigrationDriver,
  noopMigrator,
  sortMigrations,
} from "@rootware/migrate";

export async function runDataExample(): Promise<void> {
  const organizations = defineTable("organizations", {
    id: columns.uuid().primaryKey().default(() => "org_1"),
    name: columns.varchar(80).notNull().unique(),
    createdAt: columns.timestamp({ withTimezone: true }).default(
      () => new Date("2024-01-01T00:00:00.000Z"),
    ),
  });
  const users = defineTable("users", {
    id: columns.uuid().primaryKey().default(() => "u_1"),
    orgId: columns.uuid().references("organizations", "id"),
    email: columns.varchar(160).notNull().unique(),
    displayName: columns.text().nullable(),
    age: columns.integer().optional(),
    settings: columns.jsonb<{ readonly theme: string }>().default({
      theme: "system",
    }),
  });

  type UserInsert = InferInsert<typeof users>;
  const insert: UserInsert = {
    orgId: "org_1",
    email: "ada@example.com",
    displayName: "Ada",
  };
  assertEquals(insert.email, "ada@example.com");

  const snapshot = createSchemaSnapshot({
    dialect: "postgres",
    tables: [users, organizations],
    metadata: { owner: "examples" },
  });
  assertValidSchemaSnapshot(snapshot);
  assertEquals(validateSchemaSnapshot(snapshot), []);

  const serialized = serializeSchemaSnapshot(snapshot);
  const parsed = deserializeSchemaSnapshot(serialized);
  assert(equalSchemaSnapshots(snapshot, parsed));
  assertEquals(parsed.tables.map((table) => table.name), [
    "organizations",
    "users",
  ]);

  const schemaPlan = defineSchemaMigrationPlan({ to: parsed });
  assertEquals(schemaPlan.to.dialect, "postgres");

  const condition = and(
    eq(users.columns.email, "ada@example.com"),
    gt(users.columns.age, 20),
    isNotNull(users.columns.displayName),
  );
  const rendered = renderSql(
    sql`select ${identifier("users.email")} from ${identifier("users")} where ${
      toSql(condition)
    }`,
    { dialect: "postgres" },
  );
  assert(rendered.text.includes('"users"."email"'));
  assertEquals(rendered.params, ["ada@example.com", 20]);

  const db = createDatabase({
    dialect: "postgres",
    driver: memoryOrmDriver(),
  });
  const selected = await db.select()
    .from(users)
    .where(eq(users.columns.email, "ada@example.com"))
    .limit(1)
    .execute();
  assertEquals(selected, []);

  const inserted = await db.insert(users).values(insert).returning().execute();
  assertEquals(inserted.rowCount, 0);
  await db.close();

  const createOrganizations = defineSqlMigration({
    id: "001_create_organizations",
    description: "Create organizations table",
    up: "create table organizations (id text primary key, name text not null)",
    down: "drop table organizations",
  });
  const createUsers = defineMigration({
    id: "002_create_users",
    description: "Create users table",
    up: async (ctx) => {
      await ctx.driver.execute(
        "create table users (id text primary key, org_id text not null)",
      );
    },
    down: [
      "drop table users",
      "delete from organizations where id = 'org_1'",
    ],
  });
  const migrations = sortMigrations([createUsers, createOrganizations]);
  assertEquals(
    calculateMigrationChecksum(createOrganizations).startsWith("migr_"),
    true,
  );

  const appliedOrganizations = createAppliedMigration(createOrganizations, {
    appliedAt: new Date(0),
    executionMs: 2,
  });
  assertMigrationChecksum(appliedOrganizations, createOrganizations);

  const plan = createMigrationPlan(migrations, [appliedOrganizations]);
  assertEquals(plan.pending.map((item) => item.migration.id), [
    "002_create_users",
  ]);
  assertEquals(
    getPendingMigrations(migrations, [appliedOrganizations]).map((item) =>
      item.id
    ),
    ["002_create_users"],
  );
  assertEquals(
    getAppliedMigrations(migrations, [appliedOrganizations]).map((item) =>
      item.id
    ),
    ["001_create_organizations"],
  );
  assertEquals(
    getRollbackMigrations(migrations, [appliedOrganizations]).map((item) =>
      item.id
    ),
    ["001_create_organizations"],
  );

  const executedSql: string[] = [];
  const driver: MigrationDriver = {
    execute(statement: string): Promise<void> {
      executedSql.push(statement);
      return Promise.resolve();
    },
    transaction<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },
    close(): Promise<void> {
      executedSql.push("-- closed");
      return Promise.resolve();
    },
  };
  const store = memoryMigrationStore();
  const migrator = createMigrator({ migrations, store, driver });

  const dryRun = await migrator.up({ dryRun: true });
  assertEquals(dryRun.skipped, [
    "001_create_organizations",
    "002_create_users",
  ]);
  assertEquals(await store.listApplied(), []);

  const up = await migrator.up();
  assertEquals(up.executed.map((item) => item.id), [
    "001_create_organizations",
    "002_create_users",
  ]);
  assert(
    executedSql.some((statement) => statement.includes("create table users")),
  );

  const down = await migrator.down({ steps: 1 });
  assertEquals(down.executed.map((item) => item.id), ["002_create_users"]);
  assertExists(await store.getApplied("001_create_organizations"));
  await migrator.close();

  const empty = noopMigrator();
  assertEquals(await empty.pending(), []);
  assertEquals((await empty.plan()).items, []);
}

if (import.meta.main) {
  await runDataExample();
  console.log("data example passed");
}
