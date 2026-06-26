import {
  and,
  columns,
  createDatabase,
  createSchemaSnapshot,
  defineTable,
  eq,
  ilike,
  inArray,
  noopOrmDriver,
  renderSql,
  toSql,
} from "@rootware/orm";
import {
  buildMigrationFile,
  checkDrift,
  defineConfig,
  type MigrationFileSystem,
  planSchemaChanges,
} from "@rootware/migrate";
import {
  generatePostgresCreateTable,
  generatePostgresUpStatements,
} from "@rootware/migrate/postgres";
import { parseMigrateCliArgs, runMigrateCli } from "@rootware/migrate/cli";
import { consume } from "../fixtures/blackhole.ts";
import {
  changedLargeSchemaSnapshot,
  largeSchemaSnapshot,
  smallSchemaSnapshot,
} from "../fixtures/schema.ts";
import { benchmarkName } from "../fixtures/names.ts";

// --- orm groups -----------------------------------------------------------
const ORM_SNAPSHOT_CREATE = "orm.snapshot.create";
const ORM_QUERY_SELECT = "orm.query.select";
const ORM_QUERY_INSERT = "orm.query.insert";
const ORM_QUERY_JOIN = "orm.query.join";
const ORM_PREDICATE_COMPOSE = "orm.predicate.compose";

// --- migrate groups -------------------------------------------------------
const MIGRATE_DDL_CREATE_TABLE = "migrate.ddl.create-table";
const MIGRATE_DDL_UP_LARGE = "migrate.ddl.up.large";
const MIGRATE_DDL_UP_DIFF = "migrate.ddl.up.diff";
const MIGRATE_PLAN_CHANGES = "migrate.plan.changes";
const MIGRATE_FILE_BUILD = "migrate.file.build";
const MIGRATE_DRIFT_CHECK = "migrate.drift.check";
const MIGRATE_CLI_GENERATE_SMALL = "migrate.cli.generate.small";
const MIGRATE_CLI_GENERATE_LARGE = "migrate.cli.generate.large";

const POSTGRES = { dialect: "postgres" } as const;

const users = defineTable("users", {
  id: columns.uuid().primaryKey(),
  email: columns.text().notNull(),
  name: columns.text().nullable(),
  age: columns.integer().nullable(),
});
const posts = defineTable("posts", {
  id: columns.uuid().primaryKey(),
  userId: columns.uuid().notNull(),
  title: columns.text().notNull(),
});

const db = createDatabase({ driver: noopOrmDriver(), dialect: "postgres" });
const ids = ["a", "b", "c", "d", "e"];

const largeUpStatements = [
  ...generatePostgresUpStatements(largeSchemaSnapshot).statements,
];
const smallConfig = defineConfig({
  dir: "migrations",
  dialect: "postgres",
  snapshot: smallSchemaSnapshot,
});
const largeConfig = defineConfig({
  dir: "migrations",
  dialect: "postgres",
  snapshot: largeSchemaSnapshot,
});

/** A fresh in-memory filesystem so the CLI generate path never touches disk. */
function memoryFs(): MigrationFileSystem {
  const files = new Map<string, string>();
  return {
    readDir(path: string): Promise<readonly string[]> {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names: string[] = [];
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
          names.push(key.slice(prefix.length));
        }
      }
      return Promise.resolve(names);
    },
    readFile: (path) => Promise.resolve(files.get(path)),
    writeFile: (path, content) => {
      files.set(path, content);
      return Promise.resolve();
    },
    mkdir: () => Promise.resolve(),
  };
}

// --- orm ------------------------------------------------------------------

Deno.bench({
  name: benchmarkName(ORM_SNAPSHOT_CREATE, "rootware"),
  group: ORM_SNAPSHOT_CREATE,
  baseline: true,
  fn(): void {
    consume(createSchemaSnapshot({ tables: { users, posts }, ...POSTGRES }));
  },
});

Deno.bench({
  name: benchmarkName(ORM_QUERY_SELECT, "rootware"),
  group: ORM_QUERY_SELECT,
  baseline: true,
  fn(): void {
    consume(
      renderSql(
        db.select().from(users)
          .where(eq(users.columns.id, "u_123"))
          .orderBy(users.columns.email, "desc")
          .limit(10)
          .offset(0)
          .toSql(),
        POSTGRES,
      ),
    );
  },
});

Deno.bench({
  name: benchmarkName(ORM_QUERY_SELECT, "platform:template"),
  group: ORM_QUERY_SELECT,
  fn(): void {
    consume({
      text:
        'select * from "users" where "users"."id" = $1 order by "users"."email" desc limit $2 offset $3',
      params: ["u_123", 10, 0],
    });
  },
});

Deno.bench({
  name: benchmarkName(ORM_QUERY_INSERT, "rootware"),
  group: ORM_QUERY_INSERT,
  baseline: true,
  fn(): void {
    consume(
      renderSql(
        db.insert(users).values({
          id: "u_123",
          email: "a@example.com",
          name: "Alice",
          age: 30,
        }).returning().toSql(),
        POSTGRES,
      ),
    );
  },
});

Deno.bench({
  name: benchmarkName(ORM_QUERY_JOIN, "rootware"),
  group: ORM_QUERY_JOIN,
  baseline: true,
  fn(): void {
    consume(
      renderSql(
        db.select({ name: users.columns.name, title: posts.columns.title })
          .from(users)
          .leftJoin(posts, eq(posts.columns.userId, users.columns.id))
          .where(eq(users.columns.id, "u_123"))
          .toSql(),
        POSTGRES,
      ),
    );
  },
});

Deno.bench({
  name: benchmarkName(ORM_PREDICATE_COMPOSE, "rootware"),
  group: ORM_PREDICATE_COMPOSE,
  baseline: true,
  fn(): void {
    consume(
      renderSql(
        toSql(
          and(
            eq(users.columns.id, "u_123"),
            inArray(users.columns.name, ids),
            ilike(users.columns.email, "%@example.com"),
          ),
        ),
        POSTGRES,
      ),
    );
  },
});

// --- migrate --------------------------------------------------------------

Deno.bench({
  name: benchmarkName(MIGRATE_DDL_CREATE_TABLE, "rootware"),
  group: MIGRATE_DDL_CREATE_TABLE,
  baseline: true,
  fn(): void {
    consume(generatePostgresCreateTable(largeSchemaSnapshot.tables[0]));
  },
});

Deno.bench({
  name: benchmarkName(MIGRATE_DDL_UP_LARGE, "rootware"),
  group: MIGRATE_DDL_UP_LARGE,
  baseline: true,
  fn(): void {
    consume(generatePostgresUpStatements(largeSchemaSnapshot));
  },
});

Deno.bench({
  name: benchmarkName(MIGRATE_DDL_UP_DIFF, "rootware"),
  group: MIGRATE_DDL_UP_DIFF,
  baseline: true,
  fn(): void {
    consume(
      generatePostgresUpStatements(
        changedLargeSchemaSnapshot,
        largeSchemaSnapshot,
      ),
    );
  },
});

Deno.bench({
  name: benchmarkName(MIGRATE_PLAN_CHANGES, "rootware"),
  group: MIGRATE_PLAN_CHANGES,
  baseline: true,
  fn(): void {
    consume(
      planSchemaChanges({
        from: largeSchemaSnapshot,
        to: changedLargeSchemaSnapshot,
      }),
    );
  },
});

Deno.bench({
  name: benchmarkName(MIGRATE_FILE_BUILD, "rootware"),
  group: MIGRATE_FILE_BUILD,
  baseline: true,
  fn(): void {
    consume(
      buildMigrationFile({
        sequence: 1,
        name: "benchmark migration",
        statements: largeUpStatements,
        snapshot: largeSchemaSnapshot,
      }),
    );
  },
});

Deno.bench({
  name: benchmarkName(MIGRATE_DRIFT_CHECK, "rootware"),
  group: MIGRATE_DRIFT_CHECK,
  baseline: true,
  fn(): void {
    consume(
      checkDrift({
        currentSnapshot: changedLargeSchemaSnapshot,
        latestSnapshot: largeSchemaSnapshot,
        pending: [],
        migrationsMissingSnapshot: [],
      }),
    );
  },
});

// --- migrate CLI: time to generate a migration ----------------------------

Deno.bench({
  name: benchmarkName(MIGRATE_CLI_GENERATE_SMALL, "rootware"),
  group: MIGRATE_CLI_GENERATE_SMALL,
  baseline: true,
  async fn(): Promise<void> {
    // Fresh in-memory dir each run = generate into an empty migrations folder.
    consume(
      await runMigrateCli(parseMigrateCliArgs(["generate", "bench"]), {
        config: smallConfig,
        fs: memoryFs(),
      }),
    );
  },
});

Deno.bench({
  name: benchmarkName(MIGRATE_CLI_GENERATE_LARGE, "rootware"),
  group: MIGRATE_CLI_GENERATE_LARGE,
  baseline: true,
  async fn(): Promise<void> {
    consume(
      await runMigrateCli(parseMigrateCliArgs(["generate", "bench"]), {
        config: largeConfig,
        fs: memoryFs(),
      }),
    );
  },
});
