import { assertEquals, assertRejects, assertThrows } from "@std/assert";
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
  MigrationError,
  noopMigrationDriver,
  noopMigrator,
  sortMigrations,
  validateMigration,
  validateMigrations,
} from "./mod.ts";

Deno.test("@rootware/migrate - checksum ignores line-ending and trailing-whitespace differences", () => {
  const unix = defineSqlMigration({
    id: "001_init",
    up: "create table t (id int);\ncreate index ti on t (id);\n",
  });
  const windows = defineSqlMigration({
    id: "001_init",
    up: "create table t (id int);  \r\ncreate index ti on t (id);\r\n",
  });

  // Same SQL with CRLF + trailing spaces hashes identically across platforms.
  assertEquals(
    calculateMigrationChecksum(unix),
    calculateMigrationChecksum(windows),
  );

  // Genuinely different SQL still produces a different checksum.
  const other = defineSqlMigration({
    id: "001_init",
    up: "create table other (id int);",
  });
  assertThrows(() =>
    assertMigrationChecksum(
      createAppliedMigration(unix),
      other,
    ), MigrationError);
});

Deno.test("@rootware/migrate - define validate sort and checksums", () => {
  const second = defineSqlMigration({
    id: "002_posts",
    up: "create table posts (id text)",
    down: "drop table posts",
  });
  const first = defineMigration({
    id: "001_users",
    up: (ctx) => ctx.driver.execute("select 1"),
    down: "select 1",
  });

  validateMigration(first);
  validateMigrations([second, first]);
  assertEquals(
    sortMigrations([second, first]).map((migration) => migration.id),
    [
      "001_users",
      "002_posts",
    ],
  );
  assertEquals(calculateMigrationChecksum(first).startsWith("migr_"), true);
  assertThrows(() => validateMigrations([first, first]), MigrationError);

  const applied = createAppliedMigration(first, {
    appliedAt: 0,
    executionMs: 5,
  });
  assertEquals(applied.appliedAt, "1970-01-01T00:00:00.000Z");
  assertMigrationChecksum(applied, first);
  assertThrows(
    () => assertMigrationChecksum({ ...applied, checksum: "bad" }, first),
    MigrationError,
  );
});

Deno.test("@rootware/migrate - plan helpers", () => {
  const first = defineSqlMigration({ id: "001", up: "up", down: "down" });
  const second = defineSqlMigration({ id: "002", up: "up", down: "down" });
  const applied = [createAppliedMigration(first)];
  const plan = createMigrationPlan([second, first], applied);

  assertEquals(plan.pending.map((item) => item.migration.id), ["002"]);
  assertEquals(plan.applied.map((item) => item.migration.id), ["001"]);
  assertEquals(plan.hasPending, true);
  assertEquals(
    getPendingMigrations([first, second], applied).map((item) => item.id),
    ["002"],
  );
  assertEquals(
    getAppliedMigrations([first, second], applied).map((item) => item.id),
    ["001"],
  );
  assertEquals(
    getRollbackMigrations([first, second], applied, 1).map((item) => item.id),
    ["001"],
  );
});

Deno.test("@rootware/migrate - schema migration plan accepts validated snapshots", () => {
  const from = {
    version: 1 as const,
    tables: [
      { name: "users", columns: [{ name: "id", type: { kind: "text" } }] },
    ],
  };
  const to = {
    version: 1 as const,
    tables: [
      { name: "posts", columns: [{ name: "id", type: { kind: "text" } }] },
      { name: "users", columns: [{ name: "id", type: { kind: "text" } }] },
    ],
  };
  const plan = defineSchemaMigrationPlan({ from, to });

  assertEquals(plan.from?.tables.map((table) => table.name), ["users"]);
  assertEquals(plan.to.tables.map((table) => table.name), ["posts", "users"]);

  assertThrows(() =>
    defineSchemaMigrationPlan({
      to: {
        version: 2 as 1,
        tables: [],
      },
    })
  );
});

Deno.test("@rootware/migrate - memory store and noop driver", async () => {
  const store = memoryMigrationStore({ cloneValues: true });
  const migration = createAppliedMigration(defineSqlMigration({
    id: "001",
    up: "up",
  }));

  await store.markApplied(migration);
  assertEquals((await store.listApplied()).length, 1);
  assertEquals((await store.getApplied("001"))?.id, "001");
  assertEquals(await store.acquireLock?.("lock"), true);
  assertEquals(await store.acquireLock?.("lock"), false);
  await store.releaseLock?.("lock");
  assertEquals(await store.unmarkApplied("001"), true);

  const driver = noopMigrationDriver();
  await driver.execute("select 1");
  assertEquals(await driver.transaction?.(() => Promise.resolve(1)), 1);
});

Deno.test("@rootware/migrate - migrator plan up down dry-run and dirty checks", async () => {
  const first = defineSqlMigration({ id: "001", up: "up", down: "down" });
  const second = defineSqlMigration({ id: "002", up: "up", down: "down" });
  const store = memoryMigrationStore();
  const migrator = createMigrator({
    migrations: [second, first],
    store,
    driver: noopMigrationDriver(),
  });

  assertEquals((await migrator.plan()).pending.length, 2);
  assertEquals((await migrator.up({ dryRun: true })).skipped, ["001", "002"]);
  assertEquals((await store.listApplied()).length, 0);

  const up = await migrator.up({ steps: 2 });
  assertEquals(up.executed.map((migration) => migration.id), ["001", "002"]);
  assertEquals((await migrator.pending()).length, 0);

  const downDry = await migrator.down({ dryRun: true, steps: 1 });
  assertEquals(downDry.skipped, ["002"]);

  const down = await migrator.down({ steps: 1 });
  assertEquals(down.executed.map((migration) => migration.id), ["002"]);
  assertEquals((await migrator.applied()).map((migration) => migration.id), [
    "001",
  ]);

  const dirty = createMigrator({
    migrations: [
      defineSqlMigration({ id: "001", up: "changed", down: "down" }),
    ],
    store,
    driver: noopMigrationDriver(),
  });
  await assertRejects(() => dirty.up(), MigrationError);
  await dirty.up({ allowDirty: true });
});

Deno.test("@rootware/migrate - noop migrator", async () => {
  const migrator = noopMigrator();
  assertEquals((await migrator.plan()).items, []);
  assertEquals((await migrator.up()).executed, []);
  assertEquals((await migrator.down()).executed, []);
  assertEquals(await migrator.pending(), []);
  assertEquals(await migrator.applied(), []);
});
