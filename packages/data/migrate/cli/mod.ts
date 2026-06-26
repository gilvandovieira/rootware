/**
 * SQL-first migration CLI for `@rootware/migrate`.
 *
 * The argument parser and command handlers are pure and dependency-injected (a
 * {@link MigrateCliRunner} abstracts the database), so they are unit-testable
 * without a live database; the integration suite drives the real Postgres
 * runner and `denoMigrationFileSystem` end-to-end.
 *
 * @example
 * ```sh
 * deno run -A jsr:@rootware/migrate/cli generate add_users
 * deno run -A jsr:@rootware/migrate/cli migrate
 * deno run -A jsr:@rootware/migrate/cli status
 * deno run -A jsr:@rootware/migrate/cli check
 * ```
 *
 * @module
 */

import {
  buildMigrationFile,
  checkDrift,
  createAppliedMigration,
  defineSqlMigration,
  denoMigrationFileSystem,
  type DiscoveredMigration,
  type MigrateConfig,
  MigrationError,
  type MigrationFileSystem,
  nextMigrationSequence,
  readMigrationsDir,
  writeMigrationFile,
} from "../mod.ts";
import {
  createPgExecutor,
  createPgMigrationHistoryStore,
  createPgMigrator,
  generatePostgresUpStatements,
  type PgConnectionOptions,
} from "../postgres/mod.ts";

export type MigrateCommand =
  | "generate"
  | "migrate"
  | "status"
  | "check"
  | "baseline"
  | "repair"
  | "help";

const COMMANDS = new Set<string>([
  "generate",
  "migrate",
  "status",
  "check",
  "baseline",
  "repair",
  "help",
]);

/** Parsed CLI invocation. */
export interface ParsedCliArgs {
  readonly command: MigrateCommand;
  /** Migration name argument (for `generate`). */
  readonly name?: string;
  readonly flags: Readonly<Record<string, string | boolean>>;
}

/** Parses CLI argv into a {@link ParsedCliArgs} (pure). */
export function parseMigrateCliArgs(args: readonly string[]): ParsedCliArgs {
  const [rawCommand, ...rest] = args;
  const command = rawCommand !== undefined && COMMANDS.has(rawCommand)
    ? rawCommand as MigrateCommand
    : "help";

  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (const arg of rest) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      flags[key] = value ?? true;
    } else {
      positionals.push(arg);
    }
  }

  return {
    command,
    ...(positionals[0] === undefined ? {} : { name: positionals[0] }),
    flags,
  };
}

/** Applies/inspects migrations; injected so the CLI is database-agnostic. */
export interface MigrateCliRunner {
  applied(): Promise<readonly string[]>;
  apply(migrations: readonly DiscoveredMigration[]): Promise<readonly string[]>;
  baseline(
    migrations: readonly DiscoveredMigration[],
  ): Promise<readonly string[]>;
  repair(
    migrations: readonly DiscoveredMigration[],
  ): Promise<readonly string[]>;
}

/** Dependencies for {@link runMigrateCli}. */
export interface MigrateCliDeps {
  readonly config: MigrateConfig;
  readonly fs: MigrationFileSystem;
  readonly runner?: MigrateCliRunner;
  readonly log?: (message: string) => void;
}

/** Result of a CLI run; `code` is the intended process exit code. */
export interface MigrateCliResult {
  readonly code: number;
}

const USAGE = [
  "rootware migrate — SQL-first migrations",
  "",
  "Commands:",
  "  generate <name>  Generate a migration from the schema snapshot diff",
  "  migrate          Apply pending migrations",
  "  status           Show applied and pending migrations",
  "  check            Fail if the schema has drifted or migrations are pending",
  "  baseline         Mark existing migrations as applied without running them",
  "  repair           Re-record migration history checksums",
  "  help             Show this help",
].join("\n");

/** Runs a parsed CLI command against injected dependencies. */
export async function runMigrateCli(
  parsed: ParsedCliArgs,
  deps: MigrateCliDeps,
): Promise<MigrateCliResult> {
  const log = deps.log ?? (() => {});

  switch (parsed.command) {
    case "generate":
      return await runGenerate(parsed, deps, log);
    case "migrate":
      return await runMigrate(deps, log);
    case "status":
      return await runStatus(deps, log);
    case "check":
      return await runCheck(deps, log);
    case "baseline":
      return await runWithRunner(deps, log, "baseline");
    case "repair":
      return await runWithRunner(deps, log, "repair");
    default:
      log(USAGE);
      return { code: 0 };
  }
}

async function runGenerate(
  parsed: ParsedCliArgs,
  deps: MigrateCliDeps,
  log: (message: string) => void,
): Promise<MigrateCliResult> {
  const snapshot = deps.config.snapshot;
  if (snapshot === undefined) {
    throw new MigrationError(
      "generate requires a schema snapshot in the migrate config",
      { code: "MIGRATION_INVALID", details: { command: "generate" } },
    );
  }
  assertPostgres(deps.config);

  const name = parsed.name ?? "migration";
  const discovered = await readMigrationsDir(deps.fs, deps.config.dir);
  const latest = latestSnapshot(discovered);
  const { statements, destructive } = generatePostgresUpStatements(
    snapshot,
    latest,
  );

  if (statements.length === 0) {
    log(
      destructive.length > 0
        ? "No additive changes; destructive changes were withheld."
        : "No schema changes detected.",
    );
    return { code: 0 };
  }

  const file = buildMigrationFile({
    sequence: nextMigrationSequence(discovered),
    name,
    statements,
    snapshot,
  });
  await writeMigrationFile(deps.fs, deps.config.dir, file);

  log(`Generated ${file.sqlFileName}`);
  if (destructive.length > 0) {
    log(
      `Withheld ${destructive.length} destructive change(s); add them manually.`,
    );
  }
  return { code: 0 };
}

async function runMigrate(
  deps: MigrateCliDeps,
  log: (message: string) => void,
): Promise<MigrateCliResult> {
  const runner = requireRunner(deps);
  const discovered = await readMigrationsDir(deps.fs, deps.config.dir);
  const applied = new Set(await runner.applied());
  const pending = discovered.filter((migration) => !applied.has(migration.id));

  if (pending.length === 0) {
    log("No pending migrations.");
    return { code: 0 };
  }

  const executed = await runner.apply(pending);
  log(`Applied ${executed.length} migration(s): ${executed.join(", ")}`);
  return { code: 0 };
}

async function runStatus(
  deps: MigrateCliDeps,
  log: (message: string) => void,
): Promise<MigrateCliResult> {
  const runner = requireRunner(deps);
  const discovered = await readMigrationsDir(deps.fs, deps.config.dir);
  const applied = new Set(await runner.applied());
  const pending = discovered.filter((migration) => !applied.has(migration.id));

  log(`Applied:  ${applied.size}`);
  log(`Pending:  ${pending.length}`);
  for (const migration of pending) {
    log(`  - ${migration.id}`);
  }
  return { code: 0 };
}

async function runCheck(
  deps: MigrateCliDeps,
  log: (message: string) => void,
): Promise<MigrateCliResult> {
  const discovered = await readMigrationsDir(deps.fs, deps.config.dir);
  const applied = deps.runner === undefined
    ? new Set<string>()
    : new Set(await deps.runner.applied());
  const pending = discovered
    .filter((migration) => !applied.has(migration.id))
    .map((migration) => migration.id);
  const missingSnapshot = discovered
    .filter((migration) => migration.snapshot === undefined)
    .map((migration) => migration.id);

  const report = checkDrift({
    ...(deps.config.snapshot === undefined
      ? {}
      : { currentSnapshot: deps.config.snapshot }),
    ...(latestSnapshot(discovered) === undefined
      ? {}
      : { latestSnapshot: latestSnapshot(discovered) }),
    pending,
    migrationsMissingSnapshot: missingSnapshot,
  });

  if (report.clean) {
    log("No drift detected.");
    return { code: 0 };
  }

  for (const finding of report.findings) {
    log(`drift: ${finding.message}`);
  }
  return { code: 1 };
}

async function runWithRunner(
  deps: MigrateCliDeps,
  log: (message: string) => void,
  operation: "baseline" | "repair",
): Promise<MigrateCliResult> {
  const runner = requireRunner(deps);
  const discovered = await readMigrationsDir(deps.fs, deps.config.dir);
  const affected = await runner[operation](discovered);
  log(`${operation}: ${affected.length} migration(s) — ${affected.join(", ")}`);
  return { code: 0 };
}

function requireRunner(deps: MigrateCliDeps): MigrateCliRunner {
  if (deps.runner === undefined) {
    throw new MigrationError("This command requires a database runner", {
      code: "MIGRATION_DRIVER_MISSING",
    });
  }
  return deps.runner;
}

function assertPostgres(config: MigrateConfig): void {
  if (config.dialect !== undefined && config.dialect !== "postgres") {
    throw new MigrationError(
      "Migration generation currently supports only the postgres dialect",
      { code: "MIGRATION_INVALID", details: { dialect: config.dialect } },
    );
  }
}

function latestSnapshot(migrations: readonly DiscoveredMigration[]) {
  for (let index = migrations.length - 1; index >= 0; index -= 1) {
    const snapshot = migrations[index].snapshot;
    if (snapshot !== undefined) {
      return snapshot;
    }
  }
  return undefined;
}

/** Options for the real Postgres CLI runner. */
export interface PostgresMigrateRunnerOptions extends PgConnectionOptions {
  readonly historyTable?: string;
}

/**
 * Builds a {@link MigrateCliRunner} backed by a real PostgreSQL connection,
 * wiring `createPgMigrator` (apply) and the history store (status/baseline/
 * repair). Requires `--allow-net`.
 */
export function createPostgresMigrateRunner(
  options: PostgresMigrateRunnerOptions,
): MigrateCliRunner {
  const executor = createPgExecutor(options);
  const store = createPgMigrationHistoryStore({
    executor,
    tableName: options.historyTable,
  });
  const migratorPromise = createPgMigrator({
    executor,
    ...(options.historyTable === undefined
      ? {}
      : { historyTable: options.historyTable }),
  });

  const appliedIds = async (): Promise<readonly string[]> =>
    (await store.listApplied()).map((migration) => migration.id);

  return {
    applied: appliedIds,

    async apply(
      migrations: readonly DiscoveredMigration[],
    ): Promise<readonly string[]> {
      const migrator = await migratorPromise;
      const result = await migrator.migrate({
        migrations: migrations.map((migration) => ({
          id: migration.id,
          up: [migration.sql],
        })),
      });
      return result.executed.map((entry) => entry.id);
    },

    async baseline(
      migrations: readonly DiscoveredMigration[],
    ): Promise<readonly string[]> {
      const applied = new Set(await appliedIds());
      const marked: string[] = [];
      for (const migration of migrations) {
        if (applied.has(migration.id)) {
          continue;
        }
        await store.markApplied(
          createAppliedMigration(
            defineSqlMigration({ id: migration.id, up: migration.sql }),
          ),
        );
        marked.push(migration.id);
      }
      return marked;
    },

    async repair(
      migrations: readonly DiscoveredMigration[],
    ): Promise<readonly string[]> {
      const applied = new Set(await appliedIds());
      const repaired: string[] = [];
      for (const migration of migrations) {
        if (!applied.has(migration.id)) {
          continue;
        }
        await store.unmarkApplied(migration.id);
        await store.markApplied(
          createAppliedMigration(
            defineSqlMigration({ id: migration.id, up: migration.sql }),
          ),
        );
        repaired.push(migration.id);
      }
      return repaired;
    },
  };
}

/**
 * Entrypoint: loads `rootware.migrate.ts` (its default export must be a
 * {@link MigrateConfig}), wires the Deno filesystem and Postgres runner, and
 * dispatches. Returns the intended exit code.
 */
export async function main(
  argv: readonly string[],
  configPath = "./rootware.migrate.ts",
): Promise<number> {
  const parsed = parseMigrateCliArgs(argv);

  if (parsed.command === "help") {
    const result = await runMigrateCli(parsed, {
      config: { dir: "migrations" },
      fs: denoMigrationFileSystem(),
      log: console.log,
    });
    return result.code;
  }

  const module = await import(
    new URL(configPath, `file://${denoCwd()}/`).href
  ) as { readonly default?: MigrateConfig };
  const config = module.default;
  if (config === undefined) {
    throw new MigrationError(
      `Config ${configPath} must default-export a MigrateConfig`,
      { code: "MIGRATION_INVALID" },
    );
  }

  const needsDatabase = parsed.command === "migrate" ||
    parsed.command === "status" || parsed.command === "baseline" ||
    parsed.command === "repair";

  const runner = needsDatabase && config.databaseUrl !== undefined
    ? createPostgresMigrateRunner({
      url: config.databaseUrl,
      ...(config.historyTable === undefined
        ? {}
        : { historyTable: config.historyTable }),
    })
    : undefined;

  const result = await runMigrateCli(parsed, {
    config,
    fs: denoMigrationFileSystem(),
    log: console.log,
    ...(runner === undefined ? {} : { runner }),
  });
  return result.code;
}

function denoCwd(): string {
  return (globalThis as { readonly Deno?: { cwd(): string } }).Deno?.cwd() ??
    ".";
}

if (import.meta.main) {
  const args = (globalThis as { readonly Deno?: { readonly args: string[] } })
    .Deno?.args ?? [];
  const code = await main(args);
  (globalThis as { readonly Deno?: { exit(code: number): never } }).Deno
    ?.exit(code);
}
