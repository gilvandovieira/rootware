/**
 * Turso migration adapter for `@rootware/migrate`.
 *
 * Turso is hosted libSQL, so this is a thin, Turso-named entrypoint over the
 * `@rootware/migrate/libsql` migrator that **requires** a `url` and `authToken`
 * for a real connection and otherwise behaves identically (interactive
 * transactions, SQLite-compatible DDL).
 *
 * @module
 */

import { MigrationError } from "../core/mod.ts";
import {
  createLibsqlMigrator,
  type CreateLibsqlMigratorOptions,
  type LibsqlMigrator,
} from "../libsql/mod.ts";

export type { LibsqlMigrator as TursoMigrator } from "../libsql/mod.ts";

// Turso speaks SQLite SQL — re-export the SQLite DDL generators for convenience.
export type { SqliteUpStatements } from "../sqlite/ddl.ts";
export {
  generateSqliteAddColumn,
  generateSqliteColumnDefinition,
  generateSqliteColumnType,
  generateSqliteCreateTable,
  generateSqliteUpStatements,
  quoteSqliteIdent,
} from "../sqlite/ddl.ts";

/** Options for creating a Turso migration facade. */
export interface CreateTursoMigratorOptions {
  /** Turso database URL (`libsql://<db>-<org>.turso.io`). */
  readonly url?: string;
  /** Turso database auth token (required for hosted databases). */
  readonly authToken?: string;
  /** An already-open libSQL client or executor (for tests). */
  readonly client?: CreateLibsqlMigratorOptions["client"];
  readonly executor?: CreateLibsqlMigratorOptions["executor"];
  readonly logger?: CreateLibsqlMigratorOptions["logger"];
  readonly historyTable?: string;
  readonly useTransaction?: boolean;
}

/**
 * Creates a Turso migration facade. Equivalent to `createLibsqlMigrator`, but for
 * a real connection it validates that a `url` **and** `authToken` are present.
 * An injected `client`/`executor` bypasses that for tests.
 */
export function createTursoMigrator(
  options: CreateTursoMigratorOptions,
): Promise<LibsqlMigrator> {
  const injected = options.client !== undefined ||
    options.executor !== undefined;

  if (!injected) {
    if (typeof options.url !== "string" || options.url.trim().length === 0) {
      throw new MigrationError("Turso database url is required", {
        code: "MIGRATION_INVALID",
        status: 400,
      });
    }

    if (
      typeof options.authToken !== "string" ||
      options.authToken.trim().length === 0
    ) {
      throw new MigrationError("Turso auth token is required", {
        code: "MIGRATION_INVALID",
        status: 400,
      });
    }
  }

  return createLibsqlMigrator({
    ...(options.url === undefined ? {} : { url: options.url }),
    ...(options.authToken === undefined
      ? {}
      : { authToken: options.authToken }),
    ...(options.client === undefined ? {} : { client: options.client }),
    ...(options.executor === undefined ? {} : { executor: options.executor }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ...(options.historyTable === undefined
      ? {}
      : { historyTable: options.historyTable }),
    ...(options.useTransaction === undefined
      ? {}
      : { useTransaction: options.useTransaction }),
  });
}
