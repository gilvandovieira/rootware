/**
 * libSQL adapter for `@rootware/orm`.
 *
 * Provides libSQL/Turso query execution, lazy `@libsql/client` opening, SQLite
 * dialect compatibility, and a database facade for remote or embedded clients.
 *
 * @module
 */

import type { Logger } from "@rootware/log";

import {
  createDatabase,
  type Database,
  type OrmQueryResult,
  type SqlInput,
  type SqlParameter,
} from "../core/mod.ts";

import { LIBSQL_DIALECT } from "./dialect.ts";
import {
  type LibsqlConnectionOptions,
  type LibsqlLikeClient,
  openLibsqlClient,
} from "./database.ts";
import { createLibsqlOrmDriver } from "./driver.ts";

export { LIBSQL_DIALECT } from "./dialect.ts";
export { sqliteColumnAffinity } from "../sqlite/dialect.ts";
export type {
  LibsqlConnectionOptions,
  LibsqlLikeClient,
  LibsqlLikeTransaction,
  LibsqlResultSet,
  LibsqlStatement,
} from "./database.ts";
export { openLibsqlClient } from "./database.ts";
export type {
  LibsqlExecutorOptions,
  LibsqlQueryResult,
  LibsqlSqlExecutor,
} from "./executor.ts";
export { createLibsqlExecutor } from "./executor.ts";
export { createLibsqlOrmDriver } from "./driver.ts";
export type { LibsqlOrmDriverOptions } from "./driver.ts";

/** libSQL-specialized database facade. */
export interface LibsqlDatabase extends Database {
  execute<T = unknown>(
    query: SqlInput,
    params?: readonly SqlParameter[],
  ): Promise<OrmQueryResult<T>>;

  query<T = unknown>(
    query: SqlInput,
    params?: readonly SqlParameter[],
  ): Promise<OrmQueryResult<T>>;
}

/** Options for opening a libSQL-backed database facade. */
export interface CreateLibsqlDbOptions extends LibsqlConnectionOptions {
  readonly executor?: import("./executor.ts").LibsqlSqlExecutor;
  readonly logger?: Logger;
}

/**
 * Opens a libSQL/Turso-backed database facade. The same `defineTable`/`columns`/
 * query-builder surface as `@rootware/orm/sqlite` (libSQL is SQLite-compatible),
 * over the bundled `@libsql/client`.
 */
export async function createLibsqlDb(
  options: CreateLibsqlDbOptions = {},
): Promise<LibsqlDatabase> {
  let client: LibsqlLikeClient | undefined = options.client;
  let ownsClient = false;

  if (options.executor === undefined && client === undefined) {
    client = await openLibsqlClient(options);
    ownsClient = true;
  }

  const driver = createLibsqlOrmDriver({
    executor: options.executor,
    client,
    ownsClient,
  });

  return createDatabase({
    driver,
    dialect: LIBSQL_DIALECT,
    logger: options.logger,
  }) as LibsqlDatabase;
}

/** Convenience alias for {@link createLibsqlDb}. */
export function connect(
  options: CreateLibsqlDbOptions = {},
): Promise<LibsqlDatabase> {
  return createLibsqlDb(options);
}
