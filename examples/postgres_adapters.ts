import { sql } from "@rootware/orm";
import {
  createPgDb,
  createPgExecutor as createOrmPgExecutor,
  createPgOrmDriver,
  type PgClient as OrmPgClient,
} from "@rootware/orm/postgres";
import { type AppliedMigration, defineSqlMigration } from "@rootware/migrate";
import {
  createPgExecutor as createMigrationPgExecutor,
  createPgMigrationDriver,
  createPgMigrationHistoryStore,
  createPgMigrator,
  DEFAULT_PG_MIGRATION_TABLE,
  type PgClient as MigrationPgClient,
  type QueryResult,
  type SqlExecutor,
} from "@rootware/migrate/postgres";
import { assert, assertEquals, assertExists } from "@rootware/testing";

interface RecordedPgQuery {
  readonly query: string;
  readonly args: readonly unknown[];
}

class RecordingPgClient implements OrmPgClient, MigrationPgClient {
  readonly queries: RecordedPgQuery[] = [];
  released = false;
  ended = false;

  queryObject<Row = Record<string, unknown>>(
    query: string,
    args: unknown[] = [],
  ): Promise<{ readonly rows: Row[]; readonly rowCount?: number }> {
    this.queries.push({ query, args: [...args] });

    if (query.toLowerCase().includes("select") && args.length > 0) {
      return Promise.resolve({
        rows: [{ ok: args[0] } as Row],
        rowCount: 1,
      });
    }

    return Promise.resolve({ rows: [], rowCount: 0 });
  }

  release(): void {
    this.released = true;
  }

  end(): Promise<void> {
    this.ended = true;
    return Promise.resolve();
  }
}

interface RecordingMigrationExecutor extends SqlExecutor {
  readonly statements: RecordedPgQuery[];
  readonly history: Map<string, AppliedMigration>;
}

export async function runPostgresAdaptersExample(): Promise<void> {
  const client = new RecordingPgClient();
  const ormExecutor = createOrmPgExecutor({ client });
  assertEquals(
    await ormExecutor.execute<{ readonly ok: number }>(
      "select $1 as ok",
      [1],
    ),
    {
      rows: [{ ok: 1 }],
      rowCount: 1,
    },
  );

  const driver = createPgOrmDriver({ executor: ormExecutor });
  assertEquals(
    await driver.query<{ readonly ok: number }>({
      text: "select $1 as ok",
      params: [2],
    }),
    {
      rows: [{ ok: 2 }],
      rowCount: 1,
    },
  );

  const db = await createPgDb({ client });
  assertEquals(
    await db.query<{ readonly ok: number }>(
      sql`select ${3} as ok`,
    ),
    {
      rows: [{ ok: 3 }],
      rowCount: 1,
    },
  );
  await db.close();

  const migrationPgExecutor = createMigrationPgExecutor({ client });
  assertEquals(
    await migrationPgExecutor.execute<{ readonly ok: number }>(
      "select $1 as ok",
      [4],
    ),
    {
      rows: [{ ok: 4 }],
      rowCount: 1,
    },
  );

  assertEquals(DEFAULT_PG_MIGRATION_TABLE, "rootware_migrations");

  const historyExecutor = createRecordingMigrationExecutor();
  const historyStore = createPgMigrationHistoryStore({
    executor: historyExecutor,
    tableName: "app_rootware_migrations",
  });
  assertEquals(await historyStore.listApplied(), []);

  const migration = defineSqlMigration({
    id: "001_create_accounts",
    up: "create table accounts (id text primary key)",
    down: "drop table accounts",
  });

  const migrationDriver = createPgMigrationDriver({
    executor: historyExecutor,
  });
  await migrationDriver.execute("select 1");
  await migrationDriver.transaction?.(() => Promise.resolve());

  const pgMigrator = await createPgMigrator({
    executor: historyExecutor,
    historyTable: "app_rootware_migrations",
  });
  const plan = await pgMigrator.plan({ migrations: [migration] });
  assertEquals(plan.hasPending, true);

  const migrated = await pgMigrator.migrate({ migrations: [migration] });
  assertEquals(migrated.executed.map((item) => item.id), [
    "001_create_accounts",
  ]);
  assertEquals((await pgMigrator.applied()).map((item) => item.id), [
    "001_create_accounts",
  ]);

  const applied = await historyStore.getApplied("001_create_accounts");
  assertExists(applied);
  assertEquals(applied.id, "001_create_accounts");

  const rolledBack = await pgMigrator.rollback({
    migrations: [migration],
    steps: 1,
  });
  assertEquals(rolledBack.executed.map((item) => item.id), [
    "001_create_accounts",
  ]);
  assertEquals(await historyStore.listApplied(), []);
  assert(
    historyExecutor.statements.some((entry) =>
      entry.query.includes("create table accounts")
    ),
  );

  await pgMigrator.close();
  await historyStore.close?.();
  await ormExecutor.close?.();
  await migrationPgExecutor.close?.();
}

function createRecordingMigrationExecutor(): RecordingMigrationExecutor {
  const statements: RecordedPgQuery[] = [];
  const history = new Map<string, AppliedMigration>();

  const executor: RecordingMigrationExecutor = {
    statements,
    history,

    execute<Row = Record<string, unknown>>(
      query: string,
      params: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
      statements.push({ query, args: [...params] });
      const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();

      if (
        normalized.startsWith("select") && normalized.includes("where id = $1")
      ) {
        const id = String(params[0]);
        const migration = history.get(id);
        return Promise.resolve({
          rows: migration === undefined
            ? []
            : [migrationToRow(migration) as Row],
          rowCount: migration === undefined ? 0 : 1,
        });
      }

      if (normalized.startsWith("select")) {
        return Promise.resolve({
          rows: [...history.values()].map((migration) =>
            migrationToRow(migration) as Row
          ),
          rowCount: history.size,
        });
      }

      if (normalized.startsWith("insert into")) {
        const migration = paramsToAppliedMigration(params);
        history.set(migration.id, migration);
        return Promise.resolve({ rows: [], rowCount: 1 });
      }

      if (normalized.startsWith("delete from")) {
        const deleted = history.delete(String(params[0]));
        return Promise.resolve({ rows: [], rowCount: deleted ? 1 : 0 });
      }

      return Promise.resolve({ rows: [], rowCount: 0 });
    },

    transaction<T>(fn: () => Promise<T>): Promise<T> {
      statements.push({ query: "begin", args: [] });
      return fn().finally(() => {
        statements.push({ query: "commit", args: [] });
      });
    },

    close(): Promise<void> {
      statements.push({ query: "-- closed", args: [] });
      return Promise.resolve();
    },
  };

  return executor;
}

function paramsToAppliedMigration(
  params: readonly unknown[],
): AppliedMigration {
  const [id, checksum, description, appliedAt, executionMs] = params;

  if (typeof id !== "string" || typeof checksum !== "string") {
    throw new Error("Invalid applied migration parameters");
  }

  return {
    id,
    checksum,
    appliedAt: normalizeAppliedAt(appliedAt),
    ...(typeof description === "string" ? { description } : {}),
    ...(typeof executionMs === "number" ? { executionMs } : {}),
  };
}

function migrationToRow(
  migration: AppliedMigration,
): Record<string, unknown> {
  return {
    id: migration.id,
    checksum: migration.checksum,
    description: migration.description ?? null,
    appliedAt: migration.appliedAt,
    executionMs: migration.executionMs ?? null,
  };
}

function normalizeAppliedAt(value: unknown): string {
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  throw new Error("Invalid applied migration timestamp");
}

if (import.meta.main) {
  await runPostgresAdaptersExample();
  console.log("postgres adapter example passed");
}
