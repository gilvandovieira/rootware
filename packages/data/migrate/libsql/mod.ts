/**
 * libSQL/Turso migration adapter for `@rootware/migrate`.
 *
 * `createLibsqlMigrator` runs migrations over `@libsql/client` (lazy import,
 * interactive transactions) reusing the SQLite history store and DDL generators,
 * which this module re-exports.
 *
 * @module
 */

export type {
  LibsqlConnectionOptions,
  LibsqlLikeClient,
  LibsqlLikeTransaction,
  LibsqlResultSet,
  LibsqlStatement,
} from "./database.ts";
export { openLibsqlClient } from "./database.ts";

export type {
  CreateLibsqlMigratorOptions,
  LibsqlMigrateOptions,
  LibsqlMigrationDefinition,
  LibsqlMigrationInput,
  LibsqlMigrationPlanOptions,
  LibsqlMigrator,
  LibsqlRollbackOptions,
} from "./migrator.ts";
export { createLibsqlMigrator } from "./migrator.ts";

export type { QueryResult, SqlExecutor } from "./executor.ts";
export type { LibsqlExecutorOptions } from "./executor.ts";
export { createLibsqlExecutor } from "./executor.ts";

export { createLibsqlMigrationDriver } from "./driver.ts";
export type { LibsqlMigrationDriverOptions } from "./driver.ts";

// libSQL speaks SQLite SQL, so the SQLite DDL generators apply verbatim.
export type { SqliteUpStatements } from "../sqlite/ddl.ts";
export {
  generateSqliteAddColumn,
  generateSqliteColumnDefinition,
  generateSqliteColumnType,
  generateSqliteCreateTable,
  generateSqliteUpStatements,
  quoteSqliteIdent,
} from "../sqlite/ddl.ts";
