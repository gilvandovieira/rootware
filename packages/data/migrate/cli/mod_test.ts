import { assert, assertEquals } from "@std/assert";
import {
  buildMigrationFile,
  defineConfig,
  type DiscoveredMigration,
  type MigrationFileSystem,
  writeMigrationFile,
} from "@rootware/migrate";
import {
  type MigrateCliRunner,
  parseMigrateCliArgs,
  runMigrateCli,
} from "@rootware/migrate/cli";
import type { RootwareSchemaSnapshot } from "@rootware/schema";

const snapshot = (
  tables: RootwareSchemaSnapshot["tables"],
): RootwareSchemaSnapshot => ({ version: 1, tables });

const usersV1 = snapshot([
  { name: "users", columns: [{ name: "id", type: { kind: "uuid" } }] },
]);

function fakeFs(): MigrationFileSystem & {
  readonly files: Map<string, string>;
} {
  const files = new Map<string, string>();
  return {
    files,
    readDir(path: string): Promise<readonly string[]> {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
          names.add(key.slice(prefix.length));
        }
      }
      return Promise.resolve([...names]);
    },
    readFile: (path) => Promise.resolve(files.get(path)),
    writeFile: (path, content) => {
      files.set(path, content);
      return Promise.resolve();
    },
    mkdir: () => Promise.resolve(),
  };
}

function fakeRunner(): MigrateCliRunner & { readonly calls: string[] } {
  const applied = new Set<string>();
  const calls: string[] = [];
  return {
    calls,
    applied: () => Promise.resolve([...applied]),
    apply: (migrations: readonly DiscoveredMigration[]) => {
      const ids = migrations.map((m) => m.id);
      for (const id of ids) {
        applied.add(id);
      }
      calls.push(`apply:${ids.join(",")}`);
      return Promise.resolve(ids);
    },
    baseline: (migrations: readonly DiscoveredMigration[]) => {
      calls.push("baseline");
      return Promise.resolve(migrations.map((m) => m.id));
    },
    repair: (migrations: readonly DiscoveredMigration[]) => {
      calls.push("repair");
      return Promise.resolve(migrations.map((m) => m.id));
    },
  };
}

Deno.test("@rootware/migrate/cli - parseMigrateCliArgs", () => {
  assertEquals(
    parseMigrateCliArgs(["generate", "add_users"]).command,
    "generate",
  );
  assertEquals(
    parseMigrateCliArgs(["generate", "add_users"]).name,
    "add_users",
  );
  assertEquals(parseMigrateCliArgs(["migrate", "--foo=bar"]).flags.foo, "bar");
  assertEquals(parseMigrateCliArgs(["status", "--json"]).flags.json, true);
  assertEquals(parseMigrateCliArgs(["bogus"]).command, "help");
  assertEquals(parseMigrateCliArgs([]).command, "help");
});

Deno.test("@rootware/migrate/cli - generate writes a migration from the snapshot diff", async () => {
  const fs = fakeFs();
  const config = defineConfig({
    dir: "migrations",
    dialect: "postgres",
    snapshot: usersV1,
  });
  const logs: string[] = [];

  const result = await runMigrateCli(
    parseMigrateCliArgs(["generate", "create_users"]),
    { config, fs, log: (m) => logs.push(m) },
  );

  assertEquals(result.code, 0);
  assert(logs.some((l) => l.includes("Generated 0001_create_users.sql")));
  assert(
    [...fs.files.keys()].some((k) => k.endsWith("0001_create_users.sql")),
  );
  assert(
    [...fs.files.keys()].some((k) =>
      k.endsWith("0001_create_users.snapshot.json")
    ),
  );

  // Re-generating with no changes is a no-op.
  const second = await runMigrateCli(
    parseMigrateCliArgs(["generate", "noop"]),
    { config, fs, log: (m) => logs.push(m) },
  );
  assertEquals(second.code, 0);
  assert(logs.some((l) => l.includes("No schema changes")));
});

Deno.test("@rootware/migrate/cli - migrate applies pending, status reports them", async () => {
  const fs = fakeFs();
  await writeMigrationFile(
    fs,
    "migrations",
    buildMigrationFile({
      sequence: 1,
      name: "init",
      statements: ['create table "users" ()'],
      snapshot: usersV1,
    }),
  );
  const config = defineConfig({ dir: "migrations", dialect: "postgres" });
  const runner = fakeRunner();
  const logs: string[] = [];

  const status = await runMigrateCli(parseMigrateCliArgs(["status"]), {
    config,
    fs,
    runner,
    log: (m) => logs.push(m),
  });
  assertEquals(status.code, 0);
  assert(logs.some((l) => l.includes("Pending:  1")));

  const migrate = await runMigrateCli(parseMigrateCliArgs(["migrate"]), {
    config,
    fs,
    runner,
    log: (m) => logs.push(m),
  });
  assertEquals(migrate.code, 0);
  assertEquals(runner.calls, ["apply:0001_init"]);
  assertEquals(await runner.applied(), ["0001_init"]);
});

Deno.test("@rootware/migrate/cli - check fails on drift, passes when clean", async () => {
  const config = defineConfig({
    dir: "migrations",
    dialect: "postgres",
    snapshot: usersV1,
  });

  // No migration captured yet -> schema drift -> exit 1.
  const drift = await runMigrateCli(parseMigrateCliArgs(["check"]), {
    config,
    fs: fakeFs(),
  });
  assertEquals(drift.code, 1);

  // After generating AND applying, the snapshot matches and nothing is pending.
  const fs = fakeFs();
  const runner = fakeRunner();
  await runMigrateCli(parseMigrateCliArgs(["generate", "init"]), {
    config,
    fs,
  });
  await runMigrateCli(parseMigrateCliArgs(["migrate"]), { config, fs, runner });
  const clean = await runMigrateCli(parseMigrateCliArgs(["check"]), {
    config,
    fs,
    runner,
  });
  assertEquals(clean.code, 0);
});

Deno.test("@rootware/migrate/cli - baseline and repair delegate to the runner", async () => {
  const fs = fakeFs();
  await writeMigrationFile(
    fs,
    "migrations",
    buildMigrationFile({
      sequence: 1,
      name: "init",
      statements: ['create table "users" ()'],
      snapshot: usersV1,
    }),
  );
  const config = defineConfig({ dir: "migrations" });
  const runner = fakeRunner();

  await runMigrateCli(parseMigrateCliArgs(["baseline"]), {
    config,
    fs,
    runner,
  });
  await runMigrateCli(parseMigrateCliArgs(["repair"]), { config, fs, runner });
  assertEquals(runner.calls, ["baseline", "repair"]);
});

Deno.test("@rootware/migrate/cli - help prints usage", async () => {
  const logs: string[] = [];
  const result = await runMigrateCli(parseMigrateCliArgs(["help"]), {
    config: defineConfig({ dir: "migrations" }),
    fs: fakeFs(),
    log: (m) => logs.push(m),
  });
  assertEquals(result.code, 0);
  assert(logs.join("\n").includes("rootware migrate"));
});
